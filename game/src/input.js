// Сенсорное управление (мультитач) + клавиатура для отладки на ПК
import { clamp } from './util.js';

export class Input {
  constructor() {
    this.steer = 0; this.lean = 0; this.throttle = 0; this.brake = 0; this.jump = false; this.trick = null;
    this.sens = 1;
    this.keys = new Set();
    this.btn = { gas: false, brake: false, jump: false };
    this.trickBtn = null;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.enabled = false;
    this.onPause = null;
    this.bindTouch();
    this.bindKeys();
  }

  bindTouch() {
    const zone = document.getElementById('stickzone');
    const stick = document.getElementById('stick');
    const knob = document.getElementById('knob');
    this.stickEl = stick; this.knobEl = knob;
    const R = 60;
    const home = () => {
      stick.style.left = ''; stick.style.top = ''; stick.style.bottom = '';
    };
    zone.addEventListener('pointerdown', (e) => {
      if (this.stick.id !== null) return;
      zone.setPointerCapture(e.pointerId);
      this.stick.id = e.pointerId;
      const r = zone.getBoundingClientRect();
      // джойстик появляется под пальцем
      const x = clamp(e.clientX - r.left, 70, r.width - 70), y = clamp(e.clientY - r.top, 70, r.height - 70);
      stick.style.left = x - 65 + 'px'; stick.style.top = y - 65 + 'px'; stick.style.bottom = 'auto';
      this.stick.ox = r.left + x; this.stick.oy = r.top + y;
      this.stick.x = 0; this.stick.y = 0;
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.stick.x = dx / R; this.stick.y = dy / R;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null; this.stick.x = 0; this.stick.y = 0;
      knob.style.transform = '';
      home();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);

    document.querySelectorAll('.cbtn').forEach((b) => {
      const ids = new Set();
      let held = null;
      const set = (on) => {
        const k = on ? b.dataset.k : held || b.dataset.k;
        held = on ? k : null;
        b.classList.toggle('on', on);
        if (k.startsWith('t:')) { this.trickBtn = on ? k.slice(2) : (this.trickBtn === k.slice(2) ? null : this.trickBtn); }
        else this.btn[k] = on;
        if (on && navigator.vibrate && k === 'jump') { try { navigator.vibrate(8); } catch (err) { /* нет вибро */ } }
      };
      b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); ids.add(e.pointerId); set(true); e.preventDefault(); });
      const up = (e) => { ids.delete(e.pointerId); if (!ids.size) set(false); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause && this.onPause();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  reset() {
    this.btn.gas = this.btn.brake = this.btn.jump = false;
    this.trickBtn = null;
    this.stick.id = null; this.stick.x = this.stick.y = 0;
    document.querySelectorAll('.cbtn.on').forEach((b) => b.classList.remove('on'));
    if (this.knobEl) this.knobEl.style.transform = '';
  }

  update() {
    const K = this.keys;
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
    let steer = dz(this.stick.x) * this.sens, lean = dz(this.stick.y) * this.sens;
    if (K.has('ArrowLeft') || K.has('KeyA')) steer = -1;
    if (K.has('ArrowRight') || K.has('KeyD')) steer = 1;
    if (K.has('KeyS')) lean = 1;
    if (K.has('KeyW')) lean = -1;
    this.steer = clamp(steer, -1, 1);
    this.lean = clamp(lean, -1, 1);
    this.throttle = this.btn.gas || K.has('ArrowUp') || K.has('ShiftLeft') ? 1 : 0;
    this.brake = this.btn.brake || K.has('ArrowDown') ? 1 : 0;
    this.jump = this.btn.jump || K.has('Space');
    let t = this.trickBtn;
    const tb = this.trickEls || (this.trickEls = document.querySelectorAll('.cbtn.trick'));
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((d, i) => { if (K.has(d) && tb[i]) t = tb[i].dataset.k.slice(2); });
    this.trick = t;
    if (!this.enabled) { this.steer = this.lean = this.throttle = this.brake = 0; this.jump = false; this.trick = null; }
    return this;
  }
}
