
/* AudioWorklet wrapper — runs the generator off the main thread. */
class SFMNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.gen = sfmMakeGenerator();
    this.mix = 0.5;
    this.port.onmessage = e => { if (typeof e.data.mix === 'number') this.mix = e.data.mix; };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (out && out[0]) this.gen.process(out[0], out[1] || out[0], out[0].length, this.mix);
    return true;
  }
}
registerProcessor('sfm-noise', SFMNoiseProcessor);
