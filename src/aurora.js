/* Static FM 2 — "Aurora" background: three large, heavily blurred glows that
 * wander slowly behind the glass. They take the colours of the noise, drift
 * in time with the pulse, brighten a little with the sound, and settle when stopped. */

class SFMAurora {
  constructor(host) {
    this.host = host;
    this.blobs = [0, 1, 2].map(i => {
      const el = document.createElement('div');
      el.className = 'sfa-glow sfa-glow-' + i;
      el.setAttribute('aria-hidden', 'true');
      host.appendChild(el);
      return el;
    });
    // Each glow follows its own slow looping path (Lissajous-style)
    this.paths = [
      { ax: 0.42, ay: 0.30, fx: 1.0, fy: 0.7, px: 0.0, py: 1.3, cx: 0.25, cy: 0.18, size: 0.95 },
      { ax: 0.38, ay: 0.36, fx: 0.8, fy: 1.1, px: 2.1, py: 0.4, cx: 0.75, cy: 0.42, size: 0.85 },
      { ax: 0.34, ay: 0.28, fx: 1.2, fy: 0.9, px: 4.0, py: 2.6, cx: 0.45, cy: 0.80, size: 0.80 }
    ];
    this.phase = 0;
    this.speed = 0.2;      // eased
    this.bright = 0.35;    // eased
    this.cols = [[236, 72, 153], [249, 115, 22], [180, 83, 9]];
    this.target = { cols: this.cols, speed: 0.2, bright: 0.35 };
    this.running = false;
    this.still = false;
  }

  // cols: three [r,g,b]; playing/pulsing/pulsePeriod/level
  update({ cols, playing, pulsing, pulsePeriod, level }) {
    // a slow drift (~60 s loops) when playing, near-still when stopped; pulse quickens it a little with shorter breaths
    const base = playing ? (pulsing ? Math.min(0.3, 3 / Math.max(4, pulsePeriod)) : 0.1) : 0.035;
    this.target = { cols, speed: base, bright: playing ? 0.45 + Math.min(1, level || 0) * 0.25 : 0.22 };
  }

  setStill(s) { this.still = s; }

  start() {
    if (this.running) return;
    this.running = true;
    let last = 0;
    const loop = ts => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      if (document.hidden || ts - last < 40) return;
      const dt = Math.min(0.2, (ts - (last || ts)) / 1000);
      last = ts;
      this.step(dt);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  step(dt) {
    const t = this.target, k = Math.min(1, dt * 0.8);
    this.speed += (t.speed - this.speed) * k;
    this.bright += (t.bright - this.bright) * Math.min(1, dt * 3);
    this.cols = this.cols.map((c, i) => c.map((v, j) => v + (t.cols[i][j] - v) * Math.min(1, dt * 0.7)));
    if (!this.still) this.phase += dt * this.speed;
    const w = this.host.clientWidth || 360, h = this.host.clientHeight || 600;
    const unit = Math.max(w, h * 0.7);
    this.blobs.forEach((el, i) => {
      const p = this.paths[i], ph = this.phase;
      const x = (p.cx + p.ax * Math.sin(ph * p.fx + p.px)) * w;
      const y = (p.cy + p.ay * Math.sin(ph * p.fy + p.py)) * h;
      const s = unit * p.size * (0.9 + 0.15 * Math.sin(ph * 0.7 + i));
      const c = this.cols[i];
      // fixed 400 px element, positioned and sized with transform only (cheap: no re-layout or re-blur)
      el.style.setProperty('--sfa-x', (x - 200).toFixed(1) + 'px');
      el.style.setProperty('--sfa-y', (y - 200).toFixed(1) + 'px');
      el.style.setProperty('--sfa-k', (s / 400).toFixed(3));
      el.style.setProperty('--sfa-c', `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
      el.style.setProperty('--sfa-o', (this.bright * (i === 2 ? 0.75 : 1)).toFixed(3));
    });
  }
}
