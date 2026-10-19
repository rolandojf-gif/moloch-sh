/* MOLOCH.SH v2.6 — procedural Web Audio synthesizer. Zero audio files. */

export class AudioSynth {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  ensure() {
    if (!this.enabled) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -14;
      this.master.ratio.value = 6;
      const out = this.ctx.createGain();
      out.gain.value = 0.55;
      this.master.connect(out).connect(this.ctx.destination);
      this.noise = this.#makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    if (on) this.ensure();
  }

  #makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      d[i] = ((seed >>> 0) / 4294967295) * 2 - 1;
    }
    return buf;
  }

  #env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  #noiseBurst(t, { freq = 3200, q = 4, peak = 0.5, decay = 0.03, type = 'bandpass' } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    src.connect(f).connect(g).connect(this.master);
    this.#env(g, t, 0.001, peak, decay);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  #tone(t, { type = 'sine', freq = 440, to = null, peak = 0.3, attack = 0.004, decay = 0.2, dest = null } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const g = this.ctx.createGain();
    o.connect(g).connect(dest || this.master);
    this.#env(g, t, attack, peak, decay);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
    return o;
  }

  /* Mechanical relay: contact transient + armature thunk. */
  click() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    this.#noiseBurst(t, { freq: 4200, q: 6, peak: 0.45, decay: 0.012 });
    this.#tone(t, { type: 'square', freq: 180, to: 60, peak: 0.08, decay: 0.03 });
    this.#noiseBurst(t + 0.018, { freq: 2600, q: 8, peak: 0.18, decay: 0.01 });
  }

  /* X-RAY: sub-bass hum + high-frequency sweep (rising on enable, falling on disable). */
  xray(on) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const hum = this.ctx.createGain();
    hum.connect(this.master);
    this.#env(hum, t, 0.06, 0.5, 0.9);
    [41, 55, 82.4].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.9 : 0.18;
      o.connect(g).connect(hum);
      o.start(t); o.stop(t + 1.1);
    });
    const saw = this.ctx.createOscillator();
    saw.type = 'sawtooth';
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass'; hp.Q.value = 12;
    const from = on ? 1800 : 9000, to = on ? 9000 : 1500;
    saw.frequency.setValueAtTime(from / 4, t);
    saw.frequency.exponentialRampToValueAtTime(to / 4, t + 0.55);
    hp.frequency.setValueAtTime(from, t);
    hp.frequency.exponentialRampToValueAtTime(to, t + 0.55);
    const sg = this.ctx.createGain();
    saw.connect(hp).connect(sg).connect(this.master);
    this.#env(sg, t, 0.02, 0.22, 0.6);
    saw.start(t); saw.stop(t + 0.7);
  }

  /* Teletype radar ping: sonar sine with feedback echo + carriage chatter. */
  ping() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.18;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.38;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.5;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(this.master);
    const o = this.#tone(t, { freq: 1320, to: 1180, peak: 0.32, attack: 0.003, decay: 0.45 });
    const tap = this.ctx.createGain();
    tap.gain.value = 0.6;
    o.connect(tap).connect(delay);
    setTimeout(() => { try { delay.disconnect(); fb.disconnect(); } catch { /* already released */ } }, 2200);
    this.teletype(6, 0.5);
  }

  teletype(n = 8, offset = 0) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + offset;
    for (let i = 0; i < n; i++) {
      const jitter = ((i * 7919) % 13) / 1000;
      this.#noiseBurst(t0 + i * 0.045 + jitter, { freq: 5200 - (i % 3) * 700, q: 9, peak: 0.22, decay: 0.008 });
    }
  }

  fault() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    this.#tone(t, { type: 'sawtooth', freq: 220, to: 70, peak: 0.25, decay: 0.35 });
    this.#noiseBurst(t, { freq: 900, q: 1.2, peak: 0.35, decay: 0.25, type: 'lowpass' });
    this.ping();
  }

  achievement() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    [880, 1174.7, 1568].forEach((f, i) => this.#tone(t + i * 0.07, { type: 'square', freq: f, peak: 0.09, decay: 0.14 }));
  }

  error() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    this.#tone(t, { type: 'square', freq: 140, peak: 0.15, decay: 0.12 });
    this.#tone(t + 0.14, { type: 'square', freq: 110, peak: 0.15, decay: 0.18 });
  }
}
