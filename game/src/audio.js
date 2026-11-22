// Синтезированный звук: мотор, ветер, удары, монеты (без аудиофайлов)
import { clamp } from './util.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.gear = 1;
    this.rpm = 0.2;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(ctx.destination);
    // Мотор: две пилы + квадрат через фильтр
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 900;
    this.engFilter.Q.value = 3;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sawtooth';
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    const g3 = ctx.createGain(); g3.gain.value = 0.25;
    this.o1.connect(this.engFilter); this.o2.connect(g2).connect(this.engFilter); this.o3.connect(g3).connect(this.engFilter);
    // «тарахтение» — амплитудная модуляция
    this.lfo = ctx.createOscillator(); this.lfo.type = 'square';
    this.lfoGain = ctx.createGain(); this.lfoGain.gain.value = 0.25;
    this.am = ctx.createGain(); this.am.gain.value = 0.75;
    this.lfo.connect(this.lfoGain).connect(this.am.gain);
    this.engFilter.connect(this.am).connect(this.engGain).connect(this.master);
    for (const o of [this.o1, this.o2, this.o3, this.lfo]) o.start();
    // Шум: ветер и шуршание шин
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true;
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 600; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    ns.connect(this.windFilter).connect(this.windGain).connect(this.master);
    ns.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  setMotor(m) { this.motor = m; }

  // Обновление мотора: speed м/с, throttle 0..1, air
  engine(speed, vmax, throttle, air, active, timeScale = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.motor === 'electric' || this.motor === 'kick') {
      // электро: тонкий вой, растущий со скоростью; самокат: только ветер и шуршание колёс
      const sp = Math.abs(speed) / vmax;
      const el = this.motor === 'electric';
      const f = 220 + sp * 900 + throttle * 80;
      this.o1.frequency.setTargetAtTime(f, t, 0.05);
      this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.o3.frequency.setTargetAtTime(f * 2.01, t, 0.05);
      this.lfo.frequency.setTargetAtTime(0.01, t, 0.1);
      this.engFilter.frequency.setTargetAtTime(el ? 1800 + sp * 2500 : 300, t, 0.05);
      this.engGain.gain.setTargetAtTime(active && el ? 0.025 + throttle * 0.04 + sp * 0.03 : 0, t, 0.08);
      const wind = active ? clamp(sp * 0.25 + (air ? 0.12 : 0) + (!el && !air ? sp * 0.15 : 0), 0, 0.3) : 0;
      this.windGain.gain.setTargetAtTime(wind * 0.5, t, 0.1);
      this.windFilter.frequency.setTargetAtTime(400 + sp * 900, t, 0.1);
      this.gear = 1;
      return;
    }
    const sp = Math.abs(speed) / vmax;
    // имитация коробки передач
    const gears = [0, 0.22, 0.42, 0.62, 0.82, 1.2];
    let g = this.gear;
    while (g < 5 && sp > gears[g]) g++;
    while (g > 1 && sp < gears[g - 1] - 0.04) g--;
    this.gear = g;
    const lo = gears[g - 1], hi = gears[g];
    let target = 0.18 + clamp((sp - lo) / (hi - lo), 0, 1) * 0.8;
    if (air) target = throttle > 0 ? 0.95 : 0.45;
    if (sp < 0.03) target = 0.15 + throttle * 0.5;
    this.rpm += (target - this.rpm) * (air ? 0.06 : 0.15);
    const f = (38 + this.rpm * 150) * (0.85 + 0.15 * timeScale);
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.o3.frequency.setTargetAtTime(f * 1.505, t, 0.03);
    this.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(400 + this.rpm * 1800 + throttle * 900, t, 0.05);
    this.engGain.gain.setTargetAtTime(active ? 0.12 + throttle * 0.13 + this.rpm * 0.05 : 0, t, 0.08);
    const wind = active ? clamp(sp * 0.25 + (air ? 0.12 : 0), 0, 0.3) : 0;
    this.windGain.gain.setTargetAtTime(wind * 0.5, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(400 + sp * 900, t, 0.1);
  }

  _noise(dur, freq, gain, type = 'lowpass') {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  _tone(freq, dur, gain, type = 'sine', when = 0, slide = 0) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  land(power) { this._noise(0.25 + power * 0.2, 220 + power * 200, 0.35 + power * 0.5); this._tone(70, 0.2, 0.25 * power + 0.1, 'sine', 0, 0.5); }
  crash() { this._noise(0.8, 1200, 0.8); this._noise(0.5, 300, 0.7); this._tone(120, 0.4, 0.3, 'square', 0, 0.3); }
  splash() { this._noise(1.0, 2500, 0.6, 'highpass'); this._noise(0.7, 500, 0.6); }
  coin() { this._tone(1320, 0.09, 0.15, 'square'); this._tone(1760, 0.18, 0.12, 'square', 0.06); }
  trick() { this._tone(660, 0.12, 0.12, 'triangle'); this._tone(990, 0.15, 0.1, 'triangle', 0.05); }
  bank(big) {
    const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((n, i) => this._tone(n, 0.25, 0.13, 'triangle', i * 0.07));
  }
  lost() { this._tone(330, 0.3, 0.15, 'sawtooth', 0, 0.5); }
  click() { this._tone(900, 0.05, 0.08, 'square'); }
  buy() { [784, 988, 1175, 1568].forEach((n, i) => this._tone(n, 0.18, 0.12, 'triangle', i * 0.06)); }
  horn() { this._tone(415, 0.35, 0.12, 'square'); this._tone(523, 0.35, 0.08, 'square'); }
}
