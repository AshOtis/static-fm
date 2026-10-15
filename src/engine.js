/* Static FM 2 — audio engine (shared by the Firefox add-on and the Obsidian plugin).
 * host: { load(), save(d), onChange(), workletUrl() -> Promise<string|null> } */

const SFM_COLORS = ['blue', 'green', 'grey', 'white', 'pink', 'orange', 'brown'];

// Binaural presets: beat = L/R difference (Hz), carrier = left-ear tone (Hz)
const SFM_PRESETS = {
  delta: { name: 'Delta', beat: 2, carrier: 100, about: 'deep sleep' },
  theta: { name: 'Theta', beat: 6, carrier: 140, about: 'meditation' },
  alpha: { name: 'Alpha', beat: 10, carrier: 200, about: 'calm focus' },
  beta: { name: 'Beta', beat: 18, carrier: 220, about: 'alert, active' },
  gamma: { name: 'Gamma', beat: 40, carrier: 250, about: 'peak focus' }
};
const SFM_TIMERS = [0, 15, 30, 60, 90];

class SFMEngine {
  constructor(host) {
    this.host = host;
    this.d = {
      volume: 0.3, spectrum: 50, bass: 0, muted: false,
      binaural: { on: false, preset: 'alpha', beat: 10, carrier: 200, mix: 0.3 },
      timer: 0, motion: true,
      pulseDepth: 3, pulsePeriod: 16   // gentler, slower than v1 (±5 over ~6.7 s)
    };
    this.ctx = null;
    this.playing = false;
    this.pulsing = false;
    this.pulseCentre = 50;
    this.pulseStart = 0;
    this.live = 50;           // current spectrum position incl. pulse
    this.timerEnd = 0;
    this.fadeTimer = null;
    this.building = null;
  }

  async init() {
    const saved = await this.host.load();
    if (saved) {
      Object.assign(this.d, saved);
      if (saved.pulseDepth == null) this.d.pulseDepth = 3;
      if (saved.pulsePeriod == null) this.d.pulsePeriod = 16;
      this.d.binaural = Object.assign({ on: false, preset: 'alpha', beat: 10, carrier: 200, mix: 0.3 }, saved.binaural || {});
    }
    this.live = this.d.spectrum;
    this.tickId = setInterval(() => this.tick(), 50);
  }

  destroy() {
    clearInterval(this.tickId);
    try { if (this.ctx) this.ctx.close(); } catch (_) {}
    this.ctx = null;
  }

  save() { this.host.save(this.d); }
  changed() { if (this.host.onChange) this.host.onChange(); }

  /* ---------- graph ---------- */

  async build() {
    // 'playback' asks for a larger output buffer: a touch more latency (irrelevant for noise),
    // far fewer dropouts/crackles while the page or the computer is busy.
    const AC = self.AudioContext || self.webkitAudioContext;
    let ctx;
    try { ctx = new AC({ latencyHint: 'playback' }); } catch (e) { ctx = new AC(); }
    let src = null;
    try {
      const url = await this.host.workletUrl();
      if (url && ctx.audioWorklet) {
        await ctx.audioWorklet.addModule(url);
        src = new AudioWorkletNode(ctx, 'sfm-noise', { numberOfInputs: 0, outputChannelCount: [2] });
        this.port = src.port;
      }
    } catch (_) { src = null; }
    if (!src) {                         // fallback: same generator on a ScriptProcessor
      const gen = sfmMakeGenerator();
      src = ctx.createScriptProcessor(2048, 1, 2);
      src.onaudioprocess = e => gen.process(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), 2048, this.live / 100);
      this.port = null;
    }

    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf'; bass.frequency.value = 200; bass.gain.value = this.d.bass;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.707; lp.frequency.value = 1200 - this.live * 10;
    const master = ctx.createGain(); master.gain.value = 0;
    src.connect(bass); bass.connect(lp); lp.connect(master);

    // Binaural: two pure tones, one per ear, bypassing the noise filters
    const merger = ctx.createChannelMerger(2);
    const oscL = ctx.createOscillator(), oscR = ctx.createOscillator();
    oscL.type = oscR.type = 'sine';
    oscL.connect(merger, 0, 0); oscR.connect(merger, 0, 1);
    const bin = ctx.createGain(); bin.gain.value = 0;
    merger.connect(bin); bin.connect(master);
    oscL.start(); oscR.start();

    master.connect(ctx.destination);
    const analyser = ctx.createAnalyser();          // drives the visuals
    analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.8;
    master.connect(analyser);
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.timeData = new Float32Array(analyser.fftSize);
    Object.assign(this, { ctx, src, bass, lp, master, oscL, oscR, bin, analyser });
    this.applyAll(true);
  }

  ramp(param, value, tc = 0.015) {
    if (!this.ctx) return;
    param.setTargetAtTime(value, this.ctx.currentTime, tc);
  }

  applySpectrum() {
    if (!this.ctx) return;
    this.ramp(this.lp.frequency, 1200 - (this.live / 100) * 1000);
    if (this.port) this.port.postMessage({ mix: this.live / 100 });
  }

  applyBinaural(instant) {
    if (!this.ctx) return;
    const b = this.d.binaural, t = this.ctx.currentTime;
    const f = (p, v) => instant ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, 0.05);
    f(this.oscL.frequency, b.carrier);
    f(this.oscR.frequency, b.carrier + b.beat);
    this.ramp(this.bin.gain, b.on ? b.mix * 0.35 : 0, 0.2);
  }

  applyAll(instant) {
    this.applySpectrum();
    this.ramp(this.bass.gain, this.d.bass);
    this.applyBinaural(instant);
  }

  targetVolume() {
    if (this.d.muted) return 0;
    let v = this.d.volume;
    if (this.timerEnd) {   // sleep timer: fade over the last 10% (at least 30 s)
      const total = this.d.timer * 60, left = (this.timerEnd - Date.now()) / 1000;
      const fade = Math.max(total * 0.1, 30);
      if (left < fade) v *= Math.max(0, left / fade);
    }
    return v;
  }

  /* ---------- transport ---------- */

  async start() {
    if (this.playing) return;
    if (!this.ctx) { this.building = this.building || this.build(); await this.building; this.building = null; }
    clearTimeout(this.fadeTimer);
    const g = this.master.gain;
    g.cancelScheduledValues(0); g.value = 0;            // silent before the device starts
    if (this.ctx.state !== 'running') await this.ctx.resume();
    // let the audio device settle for a moment, then fade in gently
    const t = this.ctx.currentTime + 0.12;
    this.lastTarget = this.targetVolume();
    this.fadeInEnd = t + 1.2;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(this.lastTarget, this.fadeInEnd);
    this.playing = true;
    this.timerEnd = this.d.timer ? Date.now() + this.d.timer * 60000 : 0;
    this.changed();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.pulsing = false;
    this.timerEnd = 0;
    if (this.ctx) {
      const g = this.master.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.5);
      this.fadeTimer = setTimeout(() => { if (!this.playing && this.ctx) this.ctx.suspend(); }, 600);
    }
    this.live = this.d.spectrum;
    this.changed();
  }

  toggle() { return this.playing ? this.stop() : this.start(); }

  togglePulse() {
    if (!this.playing) return;
    this.pulsing = !this.pulsing;
    if (this.pulsing) { this.pulseCentre = this.d.spectrum; this.pulsePhase = 0; this.pulseLast = Date.now(); }
    else { this.live = this.d.spectrum; this.applySpectrum(); }
    this.changed();
  }

  tick() {
    if (this.pulsing) {   // "breathing" LFO; speed and depth are adjustable
      const now = Date.now();
      this.pulsePhase += (now - this.pulseLast) / 1000 / this.d.pulsePeriod * 2 * Math.PI;
      this.pulseLast = now;
      this.live = Math.max(0, Math.min(100, this.pulseCentre + Math.sin(this.pulsePhase) * this.d.pulseDepth));
      this.applySpectrum();
    }
    if (this.playing && this.ctx) {
      // follow volume / mute / sleep-timer fade — but never interrupt the start-up fade-in,
      // and only touch the gain when the target actually moves (re-scheduling every tick
      // during a ramp caused clicks on the first seconds of playback)
      const tv = this.targetVolume();
      if ((this.ctx.currentTime >= this.fadeInEnd || tv === 0) && Math.abs(tv - this.lastTarget) > 1e-4) {
        this.ramp(this.master.gain, tv, 0.1);
        this.lastTarget = tv;
      }
      if (this.timerEnd && Date.now() >= this.timerEnd) this.stop();
    }
  }

  /* ---------- settings ---------- */

  set(key, value) {
    const d = this.d, b = d.binaural;
    switch (key) {
      case 'volume': d.volume = Math.max(0, Math.min(1, value)); break;
      case 'spectrum':
        d.spectrum = Math.max(0, Math.min(100, value));
        if (this.pulsing) this.pulseCentre = d.spectrum; else { this.live = d.spectrum; this.applySpectrum(); }
        break;
      case 'color': return this.set('spectrum', value / 6 * 100);
      case 'bass': d.bass = Math.max(-3, Math.min(12, value)); this.ramp && this.bass && this.ramp(this.bass.gain, d.bass); break;
      case 'muted': d.muted = !!value; break;
      case 'binaural': b.on = !!value; this.applyBinaural(); break;
      case 'preset': {
        const p = SFM_PRESETS[value];
        if (p) { b.preset = value; b.beat = p.beat; b.carrier = p.carrier; b.on = true; this.applyBinaural(); }
        break;
      }
      case 'beat': b.beat = Math.max(0.5, Math.min(40, value)); b.preset = 'custom'; this.applyBinaural(); break;
      case 'carrier': b.carrier = Math.max(60, Math.min(500, value)); b.preset = 'custom'; this.applyBinaural(); break;
      case 'mix': b.mix = Math.max(0, Math.min(1, value)); this.applyBinaural(); break;
      case 'timer':
        d.timer = SFM_TIMERS.includes(value) ? value : 0;
        this.timerEnd = this.playing && d.timer ? Date.now() + d.timer * 60000 : 0;
        break;
      case 'motion': d.motion = !!value; break;
      case 'pulseDepth': d.pulseDepth = Math.max(0.5, Math.min(10, value)); break;
      case 'pulsePeriod': d.pulsePeriod = Math.max(4, Math.min(60, value)); break;
    }
    this.save();
    this.changed();
  }

  // Loudness overall and in three bands, 0..1, for the visuals
  vizFrame() {
    if (!this.analyser || !this.playing) return { rms: 0, low: 0, mid: 0, high: 0 };
    this.analyser.getFloatTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) sum += this.timeData[i] * this.timeData[i];
    this.analyser.getByteFrequencyData(this.freqData);
    const nyq = this.ctx.sampleRate / 2, n = this.freqData.length;
    const band = (f1, f2) => {
      const a = Math.max(1, Math.floor(f1 / nyq * n)), b = Math.max(a + 1, Math.ceil(f2 / nyq * n));
      let m = 0; for (let i = a; i < b && i < n; i++) m += this.freqData[i];
      return m / (b - a) / 255;
    };
    return { rms: Math.min(1, Math.sqrt(sum / this.timeData.length) * 6), low: band(20, 250), mid: band(250, 1500), high: band(1500, 8000) };
  }

  snapshot() {
    const b = this.d.binaural;
    return {
      playing: this.playing, pulsing: this.pulsing, muted: this.d.muted,
      spectrum: this.d.spectrum, live: this.live, volume: this.d.volume, bass: this.d.bass,
      binaural: Object.assign({}, b), timer: this.d.timer, motion: this.d.motion,
      pulseDepth: this.d.pulseDepth, pulsePeriod: this.d.pulsePeriod,
      timerLeft: this.timerEnd ? Math.max(0, Math.round((this.timerEnd - Date.now()) / 1000)) : 0
    };
  }

  async command(cmd, a = {}) {
    switch (cmd) {
      case 'state': break;
      case 'toggle': await this.toggle(); break;
      case 'start': await this.start(); break;
      case 'stop': this.stop(); break;
      case 'pulse': this.togglePulse(); break;
      case 'set': this.set(a.key, a.value); break;
      case 'viz': return this.vizFrame();
    }
    return this.snapshot();
  }
}
