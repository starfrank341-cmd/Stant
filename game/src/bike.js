// Транспорт (питбайки, электро-питбайки, самокаты, электросамокаты), райдер, покраска, позы трюков
import * as THREE from 'three';
import { lerp, clamp, TAU } from './util.js';

// kind: pit | scooter ; motor: gas | electric | kick
const P = (body, frame, rims, suit, helmet, finish = 'gloss', style = 'street') => ({ body, frame, rims, suit, helmet, finish, style });
export const BIKES = [
  // --- Питбайки ---
  {
    id: 'kroha', name: 'Кроха 110', price: 0, kind: 'pit', motor: 'gas',
    desc: 'Лёгкий и вёрткий. Идеален для старта.',
    stats: { speed: 21, accel: 8.5, turn: 2.5, flip: 4.6, spin: 4.2, pop: 4.2, land: 16 },
    wheel: 0.29, base: 1.18, tank: 0.9, num: 7, paint: P('#ff3b30', '#1c1c1e', '#ffcc00', '#f2f2f2', '#1c1c1e'),
  },
  {
    id: 'groza', name: 'Гроза 125', price: 9000, kind: 'pit', motor: 'gas',
    desc: 'Короткая база — самые быстрые сальто среди бензиновых.',
    stats: { speed: 22.5, accel: 9.2, turn: 2.7, flip: 5.6, spin: 5.0, pop: 4.6, land: 16.5 },
    wheel: 0.28, base: 1.1, tank: 0.85, num: 25, paint: P('#a4e400', '#1c1c1e', '#1c1c1e', '#1c1c1e', '#a4e400'),
  },
  {
    id: 'shershen', name: 'Шершень 140', price: 18000, kind: 'pit', motor: 'gas',
    desc: 'Мощнее мотор, быстрее вращения.',
    stats: { speed: 24.5, accel: 10, turn: 2.55, flip: 5.3, spin: 4.8, pop: 4.8, land: 18 },
    wheel: 0.31, base: 1.24, tank: 1.0, num: 14, paint: P('#ffcc00', '#1c1c1e', '#1c1c1e', '#0a5cff', '#ffcc00', 'gloss', 'moto'),
  },
  {
    id: 'volt', name: 'Вольт-Э', price: 35000, kind: 'pit', motor: 'electric',
    desc: 'Электро-питбайк: тихий, мгновенный разгон, лёгкий.',
    stats: { speed: 25.5, accel: 13.5, turn: 2.7, flip: 5.7, spin: 5.3, pop: 5.0, land: 18 },
    wheel: 0.3, base: 1.2, tank: 0.95, num: 0, paint: P('#1c1c1e', '#c7c7cc', '#00c7be', '#1c1c1e', '#00c7be', 'matte'),
  },
  {
    id: 'titan', name: 'Титан 190', price: 52000, kind: 'pit', motor: 'gas',
    desc: 'Максимальная скорость и огромные прыжки.',
    stats: { speed: 28, accel: 11.5, turn: 2.6, flip: 5.9, spin: 5.4, pop: 5.4, land: 20 },
    wheel: 0.33, base: 1.3, tank: 1.1, num: 99, paint: P('#30b0ff', '#c7c7cc', '#ff2d92', '#ffffff', '#30b0ff', 'metal', 'moto'),
  },
  {
    id: 'monstr', name: 'Монстр 250', price: 95000, kind: 'pit', motor: 'gas',
    desc: 'Самый мощный. Для мега-рампы и рекордных полётов.',
    stats: { speed: 31, accel: 13, turn: 2.6, flip: 6.3, spin: 5.8, pop: 6.0, land: 22 },
    wheel: 0.34, base: 1.34, tank: 1.15, num: 1, paint: P('#5e2bff', '#1c1c1e', '#ffcc00', '#1c1c1e', '#5e2bff', 'metal', 'moto'),
  },
  // --- Самокаты ---
  {
    id: 'trick', name: 'Трюкач', price: 3000, kind: 'scooter', motor: 'kick',
    desc: 'Трюковой самокат. Едет толчками ноги, крутится быстрее всех.',
    stats: { speed: 10, accel: 4.2, turn: 3.2, flip: 6.4, spin: 6.2, pop: 4.4, land: 14 },
    wheel: 0.11, base: 0.86, num: 0, paint: P('#ff2d92', '#1c1c1e', '#ffffff', '#1c1c1e', '#ff2d92'),
  },
  {
    id: 'trickpro', name: 'Трюкач Про', price: 12000, kind: 'scooter', motor: 'kick',
    desc: 'Лёгкая рама, мощный толчок, прыгает выше.',
    stats: { speed: 11.5, accel: 5.2, turn: 3.3, flip: 6.9, spin: 6.8, pop: 5.0, land: 15 },
    wheel: 0.12, base: 0.9, num: 0, paint: P('#ffcc00', '#1c1c1e', '#1c1c1e', '#ffffff', '#1c1c1e', 'metal'),
  },
  {
    id: 'eflash', name: 'Электро-Флеш', price: 8000, kind: 'scooter', motor: 'electric',
    desc: 'Городской электросамокат: ровный разгон без усилий.',
    stats: { speed: 15, accel: 6, turn: 2.9, flip: 4.8, spin: 4.6, pop: 3.8, land: 14 },
    wheel: 0.14, base: 1.0, num: 0, electric: true, paint: P('#30b0ff', '#1c1c1e', '#1c1c1e', '#1c1c1e', '#30b0ff', 'matte'),
  },
  {
    id: 'ebeast', name: 'Электро-Бист', price: 40000, kind: 'scooter', motor: 'electric',
    desc: 'Мощный электросамокат с большими колёсами — как питбайк.',
    stats: { speed: 22, accel: 10.5, turn: 2.8, flip: 5.4, spin: 5.0, pop: 4.6, land: 17 },
    wheel: 0.18, base: 1.12, num: 0, electric: true, paint: P('#ff6a00', '#1c1c1e', '#ff6a00', '#1c1c1e', '#ff6a00'),
  },
];
export const KIND_NAMES = { pit: 'Питбайки', scooter: 'Самокаты' };
export const isScooter = (d) => d.kind === 'scooter';

export const UPGRADES = [
  { id: 'engine', name: 'Двигатель', desc: 'Скорость и разгон', base: 900 },
  { id: 'susp', name: 'Подвеска', desc: 'Прыжок и мягкая посадка', base: 800 },
  { id: 'tires', name: 'Шины', desc: 'Сцепление и поворот', base: 600 },
  { id: 'balance', name: 'Баланс', desc: 'Скорость сальто и вращений', base: 1000 },
];
export const upgName = (u, def) => (u.id === 'engine' ? (def.motor === 'electric' ? 'Мотор и батарея' : def.motor === 'kick' ? 'Сила толчка' : 'Двигатель') : u.name);
export const MAX_UPG = 5;
export const upgCost = (u, lvl) => Math.round((u.base * Math.pow(lvl + 1, 1.55)) / 50) * 50;

export const PALETTE = [
  '#ff3b30', '#ff6a00', '#ffcc00', '#a4e400', '#34c759', '#00c7be', '#30b0ff', '#0a5cff',
  '#5e2bff', '#af52de', '#ff2d92', '#ffffff', '#c7c7cc', '#6e6e73', '#1c1c1e', '#8b5a2b',
];
export const FINISHES = [
  { id: 'gloss', name: 'Глянец', metal: 0.05, rough: 0.22 },
  { id: 'metal', name: 'Металлик', metal: 0.75, rough: 0.3 },
  { id: 'matte', name: 'Матовый', metal: 0.0, rough: 0.85 },
  { id: 'chrome', name: 'Хром', metal: 1.0, rough: 0.06 },
];
export const PAINT_PARTS = [
  { id: 'body', name: 'Пластик/дека' },
  { id: 'frame', name: 'Рама' },
  { id: 'rims', name: 'Диски' },
  { id: 'suit', name: 'Одежда' },
  { id: 'helmet', name: 'Шлем/кепка' },
];
export const PAINT_COST = 250;
export const defaultPaint = (i) => ({ ...BIKES[i].paint });

// ---------- Трюки ----------
// Позы (держать кнопку) и вращения (тейлвип, барспин). 3 набора по 4 кнопки.
export const TRICK_POSES = [
  { id: 'superman', name: 'Супермен', short: 'Супермен', pts: 450 },
  { id: 'cancan', name: 'Кан-кан', short: 'Кан-кан', pts: 300 },
  { id: 'nohander', name: 'Без рук', short: 'Без рук', pts: 350 },
  { id: 'heelclick', name: 'Хил-клик', short: 'Хил-клик', pts: 400 },
  { id: 'nacnac', name: 'Нак-нак', short: 'Нак-нак', pts: 420 },
  { id: 'cliffhanger', name: 'Клифхэнгер', short: 'Клифф', pts: 700 },
  { id: 'indian', name: 'Индиан-эйр', short: 'Индиан', pts: 550 },
  { id: 'hartattack', name: 'Харт-атак', short: 'Харт-атак', pts: 800 },
  { id: 'lazyboy', name: 'Лэйзибой', short: 'Лэйзибой', pts: 650 },
  { id: 'kiss', name: 'Поцелуй смерти', short: 'Поцелуй', pts: 1000 },
];
export const SPIN_TRICKS = [
  { id: 'tailwhip', name: 'Тейлвип', short: 'Тейлвип', pts: 900 },
  { id: 'barspin', name: 'Барспин', short: 'Барспин', pts: 600 },
];
export const TRICK_SETS = [
  { name: 'Классика', ids: ['superman', 'cancan', 'nohander', 'heelclick'] },
  { name: 'Про', ids: ['nacnac', 'cliffhanger', 'indian', 'hartattack'] },
  { name: 'Вращения', ids: ['tailwhip', 'barspin', 'lazyboy', 'kiss'] },
];
export const trickInfo = (id) => TRICK_POSES.find((t) => t.id === id) || SPIN_TRICKS.find((t) => t.id === id);
export const isSpinTrick = (id) => id === 'tailwhip' || id === 'barspin';

// ---------- Позы райдера (в локальных координатах; +z вперёд, +y вверх, начало = центр масс) ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function pose(o) {
  return {
    hips: o.hips, torso: o.torso.clone().normalize(),
    hl: o.hl, hr: o.hr, fl: o.fl, fr: o.fr,
    el: o.el || V(0.6, -0.4, -0.5), er: o.er || V(-0.6, -0.4, -0.5),
    kl: o.kl || V(0.3, 0, 1), kr: o.kr || V(-0.3, 0, 1),
  };
}
export function gripPos(bk) {
  if (isScooter(bk)) return { gy: 0.42, gz: bk.base / 2 - 0.08, gx: 0.26 };
  const wy = -0.55 + bk.wheel;
  const L = (0.42 - wy) / Math.cos(0.42);
  return { gy: 0.62, gz: bk.base / 2 - Math.sin(0.42) * L - 0.09, gx: 0.33 };
}
export function makePoses(bk) {
  const { gy, gz, gx } = gripPos(bk);
  const gl = V(gx, gy, gz), gr = V(-gx, gy, gz);
  const up = { el: V(1, -0.2, -0.2), er: V(-1, -0.2, -0.2) };
  if (isScooter(bk)) {
    const d = -0.55 + bk.wheel + 0.07; // верх деки
    const fF = V(0.06, d + 0.05, 0.1), fB = V(-0.07, d + 0.05, -0.2);
    return {
      ride: pose({ hips: V(0, d + 0.8, -0.12), torso: V(0, 1, 0.35), hl: gl, hr: gr, fl: fF, fr: fB }),
      seat: pose({ hips: V(0, d + 0.84, -0.1), torso: V(0, 1, 0.22), hl: gl, hr: gr, fl: fF, fr: fB }),
      back: pose({ hips: V(0, d + 0.72, -0.32), torso: V(0, 1, -0.02), hl: gl, hr: gr, fl: fF, fr: fB }),
      fwd: pose({ hips: V(0, d + 0.76, 0.04), torso: V(0, 1, 0.9), hl: gl, hr: gr, fl: fF, fr: fB }),
      idle: pose({ hips: V(0, d + 0.8, -0.1), torso: V(0, 1, 0.25), hl: gl, hr: gr, fl: fF, fr: V(-0.28, -0.5, -0.1) }),
      superman: pose({ hips: V(0, d + 1.0, -0.42), torso: V(0, 0.3, 1), hl: gl, hr: gr, fl: V(0.18, d + 0.95, -1.4), fr: V(-0.18, d + 1.0, -1.35), kl: V(0, -1, 0), kr: V(0, -1, 0) }),
      cancan: pose({ hips: V(0, d + 0.8, -0.1), torso: V(-0.15, 1, 0.4), hl: gl, hr: gr, fl: V(-0.55, d + 0.5, 0.35), fr: fB, kl: V(-0.5, 0.4, 1) }),
      nohander: pose({ hips: V(0, d + 0.82, -0.1), torso: V(0, 1, 0.12), hl: V(0.8, d + 1.7, -0.05), hr: V(-0.8, d + 1.7, -0.05), fl: fF, fr: fB, ...up }),
      heelclick: pose({ hips: V(0, d + 0.72, -0.22), torso: V(0, 1, 0.25), hl: gl, hr: gr, fl: V(0.06, gy + 0.12, gz + 0.3), fr: V(-0.06, gy + 0.12, gz + 0.3), kl: V(0.6, 1, 0.3), kr: V(-0.6, 1, 0.3) }),
      nacnac: pose({ hips: V(0, d + 0.85, -0.12), torso: V(0.18, 1, 0.4), hl: gl, hr: gr, fl: fF, fr: V(-0.6, d + 0.55, -0.6), kr: V(-0.6, 0.3, -0.5) }),
      cliffhanger: pose({ hips: V(0, d + 1.22, 0.02), torso: V(0, 1, -0.25), hl: V(0.5, d + 1.95, -0.1), hr: V(-0.5, d + 1.95, -0.1), fl: V(0.2, gy, gz), fr: V(-0.2, gy, gz), ...up, kl: V(0.4, 0, 1), kr: V(-0.4, 0, 1) }),
      indian: pose({ hips: V(0, d + 0.95, -0.3), torso: V(0, 0.6, 1), hl: gl, hr: gr, fl: V(0.2, d + 0.5, -1.0), fr: V(-0.2, d + 0.95, -0.55), kl: V(0, -1, 0), kr: V(0, -1, 0) }),
      hartattack: pose({ hips: V(0, d + 1.35, -0.15), torso: V(0, -0.55, 0.9), hl: gl, hr: gr, fl: V(0.15, d + 2.0, -0.8), fr: V(-0.15, d + 2.05, -0.75), kl: V(0, 0, -1), kr: V(0, 0, -1) }),
      lazyboy: pose({ hips: V(0, d + 0.62, -0.32), torso: V(0, 0.45, -1), hl: V(0.17, d + 0.98, -0.85), hr: V(-0.17, d + 0.98, -0.85), fl: V(0.2, gy + 0.03, gz - 0.04), fr: V(-0.2, gy + 0.03, gz - 0.04), el: V(1, 0.5, 0), er: V(-1, 0.5, 0), kl: V(0.3, 1, 0), kr: V(-0.3, 1, 0) }),
      kiss: pose({ hips: V(0, d + 1.55, 0.08), torso: V(0, -1, 0.3), hl: gl, hr: gr, fl: V(0.1, d + 2.4, -0.2), fr: V(-0.1, d + 2.42, -0.15), kl: V(0, 0, -1), kr: V(0, 0, -1) }),
      barspin: pose({ hips: V(0, d + 0.82, -0.1), torso: V(0, 1, 0.3), hl: V(gx, gy + 0.32, gz - 0.12), hr: V(-gx, gy + 0.32, gz - 0.12), fl: fF, fr: fB, ...up }),
      crash: pose({ hips: V(0, 0, 0), torso: V(0, 1, 0.3), hl: V(0.6, 0.6, 0.2), hr: V(-0.6, 0.5, 0.3), fl: V(0.35, -0.85, -0.1), fr: V(-0.3, -0.8, 0.25) }),
    };
  }
  const peg = (s) => V(s * 0.17, -0.1, -0.02);
  return {
    ride: pose({ hips: V(0, 0.62, -0.18), torso: V(0, 1, 0.75), hl: gl, hr: gr, fl: peg(1), fr: peg(-1) }),
    seat: pose({ hips: V(0, 0.42, -0.24), torso: V(0, 1, 0.45), hl: gl, hr: gr, fl: V(0.2, -0.1, 0.05), fr: V(-0.2, -0.1, 0.05) }),
    back: pose({ hips: V(0, 0.5, -0.42), torso: V(0, 1, 0.1), hl: gl, hr: gr, fl: peg(1), fr: peg(-1) }),
    fwd: pose({ hips: V(0, 0.68, 0.02), torso: V(0, 1, 1.4), hl: gl, hr: gr, fl: peg(1), fr: peg(-1) }),
    superman: pose({ hips: V(0, 0.85, -0.55), torso: V(0, 0.35, 1), hl: gl, hr: gr, fl: V(0.18, 0.85, -1.45), fr: V(-0.18, 0.95, -1.4), kl: V(0, -1, 0), kr: V(0, -1, 0) }),
    cancan: pose({ hips: V(0, 0.6, -0.18), torso: V(-0.15, 1, 0.6), hl: gl, hr: gr, fl: V(-0.55, 0.15, 0.45), fr: peg(-1), kl: V(-0.5, 0.4, 1) }),
    nohander: pose({ hips: V(0, 0.68, -0.2), torso: V(0, 1, 0.25), hl: V(0.85, 1.25, -0.05), hr: V(-0.85, 1.25, -0.05), fl: peg(1), fr: peg(-1), el: V(0, -1, -0.5), er: V(0, -1, -0.5) }),
    heelclick: pose({ hips: V(0, 0.55, -0.22), torso: V(0, 1, 0.2), hl: gl, hr: gr, fl: V(0.06, 0.62, 0.95), fr: V(-0.06, 0.62, 0.95), kl: V(0.6, 1, 0.3), kr: V(-0.6, 1, 0.3) }),
    nacnac: pose({ hips: V(0, 0.7, -0.25), torso: V(0.2, 1, 0.5), hl: gl, hr: gr, fl: peg(1), fr: V(-0.55, 0.55, -0.75), kr: V(-0.6, 0.3, -0.5) }),
    cliffhanger: pose({ hips: V(0, 1.15, 0.08), torso: V(0, 1, -0.25), hl: V(0.5, 1.9, -0.1), hr: V(-0.5, 1.9, -0.1), fl: V(0.22, gy, gz), fr: V(-0.22, gy, gz), ...up, kl: V(0.4, 0, 1), kr: V(-0.4, 0, 1) }),
    indian: pose({ hips: V(0, 0.85, -0.45), torso: V(0, 0.5, 1), hl: gl, hr: gr, fl: V(0.2, 0.35, -1.35), fr: V(-0.2, 0.95, -1.0), kl: V(0, -1, 0), kr: V(0, -1, 0) }),
    hartattack: pose({ hips: V(0, 1.25, -0.25), torso: V(0, -0.55, 0.9), hl: gl, hr: gr, fl: V(0.15, 1.9, -0.95), fr: V(-0.15, 1.95, -0.9), kl: V(0, 0, -1), kr: V(0, 0, -1) }),
    lazyboy: pose({ hips: V(0, 0.45, -0.5), torso: V(0, 0.45, -1), hl: V(0.17, 0.78, -0.98), hr: V(-0.17, 0.78, -0.98), fl: V(0.2, gy, gz - 0.02), fr: V(-0.2, gy, gz - 0.02), el: V(1, 0.5, 0), er: V(-1, 0.5, 0), kl: V(0.3, 1, 0), kr: V(-0.3, 1, 0) }),
    kiss: pose({ hips: V(0, 1.6, 0.05), torso: V(0, -1, 0.35), hl: gl, hr: gr, fl: V(0.1, 2.45, -0.25), fr: V(-0.1, 2.47, -0.2), kl: V(0, 0, -1), kr: V(0, 0, -1) }),
    barspin: pose({ hips: V(0, 0.66, -0.18), torso: V(0, 1, 0.5), hl: V(gx, gy + 0.32, gz - 0.12), hr: V(-gx, gy + 0.32, gz - 0.12), fl: peg(1), fr: peg(-1), ...up }),
    crash: pose({ hips: V(0, 0, 0), torso: V(0, 1, 0.3), hl: V(0.6, 0.6, 0.2), hr: V(-0.6, 0.5, 0.3), fl: V(0.35, -0.85, -0.1), fr: V(-0.3, -0.8, 0.25) }),
    idle: pose({ hips: V(0, 0.42, -0.24), torso: V(0, 1, 0.3), hl: gl, hr: gr, fl: V(0.42, -0.55, 0.05), fr: V(-0.2, -0.1, 0.05) }),
  };
}

function lerpPose(out, a, b, t) {
  for (const k of ['hips', 'torso', 'hl', 'hr', 'fl', 'fr', 'el', 'er', 'kl', 'kr']) out[k].copy(a[k]).lerp(b[k], t);
  out.torso.normalize();
  return out;
}
function clonePose(p) {
  const o = {};
  for (const k in p) o[k] = p[k].clone ? p[k].clone() : p[k];
  return o;
}

// ---------- Конечность из двух капсул с IK ----------
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
class Limb {
  constructor(parent, l1, l2, r1, r2, mat1, mat2) {
    this.l1 = l1; this.l2 = l2;
    this.a = new THREE.Mesh(new THREE.CapsuleGeometry(r1, l1 - r1 * 2 + 0.02, 3, 8), mat1);
    this.b = new THREE.Mesh(new THREE.CapsuleGeometry(r2, l2 - r2 * 2 + 0.02, 3, 8), mat2);
    this.a.castShadow = this.b.castShadow = true;
    parent.add(this.a, this.b);
    this.mid = new THREE.Vector3();
    this.endP = new THREE.Vector3();
  }
  solve(A, C, hint) {
    _d.subVectors(C, A);
    let d = _d.length();
    const max = (this.l1 + this.l2) * 0.999;
    if (d > max) { _d.multiplyScalar(max / d); d = max; }
    if (d < 0.05) d = 0.05;
    _d.normalize();
    const a = (this.l1 * this.l1 - this.l2 * this.l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, this.l1 * this.l1 - a * a));
    _p.copy(hint).addScaledVector(_d, -hint.dot(_d));
    if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1);
    _p.normalize();
    this.mid.copy(A).addScaledVector(_d, a).addScaledVector(_p, h);
    const end = _m.copy(A).addScaledVector(_d, d);
    this.endP.copy(end);
    place(this.a, A, this.mid);
    place(this.b, this.mid, end);
  }
}
const _dir = new THREE.Vector3();
function place(mesh, A, B) {
  mesh.position.addVectors(A, B).multiplyScalar(0.5);
  _dir.subVectors(B, A).normalize();
  mesh.quaternion.setFromUnitVectors(_up, _dir);
}

// ---------- Райдер ----------
export class Rider {
  constructor(mats) {
    this.mats = mats;
    this.group = new THREE.Group();
    const M = mats;
    const mk = (g, m, parent = this.group) => { const o = new THREE.Mesh(g, m); o.castShadow = true; parent.add(o); return o; };
    this.torso = mk(new THREE.CapsuleGeometry(0.155, 0.3, 3, 10), M.suit);
    this.torso.scale.set(1.12, 1, 0.72);
    this.neck = mk(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8), M.skin);
    this.head = new THREE.Group();
    this.group.add(this.head);
    this.moto = new THREE.Group();
    const hm = mk(new THREE.SphereGeometry(0.15, 16, 12), M.helmet, this.moto);
    hm.scale.set(1, 1.05, 1.12);
    mk(new THREE.BoxGeometry(0.16, 0.08, 0.12), M.helmet, this.moto).position.set(0, -0.08, 0.12);
    mk(new THREE.BoxGeometry(0.2, 0.07, 0.04), M.visor, this.moto).position.set(0, 0.0, 0.155);
    const peak = mk(new THREE.BoxGeometry(0.2, 0.02, 0.16), M.helmet, this.moto);
    peak.position.set(0, 0.1, 0.14); peak.rotation.x = -0.25;
    this.street = new THREE.Group();
    const hd = mk(new THREE.SphereGeometry(0.115, 14, 10), M.skin, this.street);
    hd.scale.set(0.92, 1.08, 1.02);
    mk(new THREE.SphereGeometry(0.122, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), M.helmet, this.street).position.set(0, 0.03, -0.005);
    const visorCap = mk(new THREE.BoxGeometry(0.2, 0.014, 0.13), M.helmet, this.street);
    visorCap.position.set(0, 0.035, -0.17);
    mk(new THREE.BoxGeometry(0.19, 0.04, 0.02), M.visor, this.street).position.set(0, 0.0, 0.11);
    mk(new THREE.BoxGeometry(0.03, 0.04, 0.04), M.skin, this.street).position.set(0, -0.025, 0.115);
    for (const x of [-0.105, 0.105]) mk(new THREE.SphereGeometry(0.025, 6, 5), M.skin, this.street).position.set(x, -0.01, 0);
    this.head.add(this.moto, this.street);
    this.armL = new Limb(this.group, 0.3, 0.29, 0.056, 0.048, M.suit, M.glove);
    this.armR = new Limb(this.group, 0.3, 0.29, 0.056, 0.048, M.suit, M.glove);
    this.legL = new Limb(this.group, 0.42, 0.44, 0.08, 0.062, M.suit2, M.boot);
    this.legR = new Limb(this.group, 0.42, 0.44, 0.08, 0.062, M.suit2, M.boot);
    const handG = new THREE.SphereGeometry(0.05, 8, 6).scale(0.85, 1, 0.7);
    this.handL = mk(handG, M.glove); this.handR = mk(handG, M.glove);
    const shoeG = new THREE.BoxGeometry(0.1, 0.08, 0.26);
    this.footL = mk(shoeG, M.boot); this.footR = mk(shoeG, M.boot);
    this.setStyle('moto');
  }
  setStyle(style) {
    const M = this.mats, st = style === 'street';
    this.style = style;
    this.moto.visible = !st; this.street.visible = st;
    for (const a of [this.armL, this.armR]) a.b.material = st ? M.skin : M.suit;
    for (const l of [this.legL, this.legR]) l.b.material = st ? M.skin : M.boot;
    this.handL.material = this.handR.material = st ? M.skin : M.glove;
    this.footL.material = this.footR.material = st ? M.shoe : M.boot;
    this.neck.visible = st;
  }
  apply(p) {
    const hips = p.hips;
    const t = p.torso;
    const neck = _m.copy(hips).addScaledVector(t, 0.48).clone();
    place(this.torso, hips, neck);
    const side = new THREE.Vector3(1, 0, 0);
    const shL = neck.clone().addScaledVector(side, 0.17).addScaledVector(t, -0.06);
    const shR = neck.clone().addScaledVector(side, -0.17).addScaledVector(t, -0.06);
    const headP = neck.clone().addScaledVector(t, 0.13);
    this.neck.position.copy(neck).addScaledVector(t, 0.03);
    this.neck.quaternion.setFromUnitVectors(_up, t);
    this.head.position.copy(headP);
    this.head.quaternion.setFromUnitVectors(_up, t.clone().lerp(_up, 0.55).normalize());
    const hpL = hips.clone().add(new THREE.Vector3(0.1, -0.02, 0));
    const hpR = hips.clone().add(new THREE.Vector3(-0.1, -0.02, 0));
    this.armL.solve(shL, p.hl, p.el);
    this.armR.solve(shR, p.hr, p.er);
    this.legL.solve(hpL, p.fl, p.kl);
    this.legR.solve(hpR, p.fr, p.kr);
    this.handL.position.copy(this.armL.endP); this.handR.position.copy(this.armR.endP);
    this.footL.position.copy(this.legL.endP).add(_fo); this.footR.position.copy(this.legR.endP).add(_fo);
  }
}
const _fo = new THREE.Vector3(0, -0.02, 0.06);

// ---------- Транспорт ----------
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
export class BikeModel {
  constructor(T, bikeDef, paint) {
    this.T = T;
    this.def = bikeDef;
    this.group = new THREE.Group(); // начало координат = центр масс
    this.body = new THREE.Group(); // всё, что качается на подвеске
    this.group.add(this.body);
    this.mats = {
      body: new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.25, metalness: 0.05 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.4, metalness: 0.5 }),
      rims: new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.3, metalness: 0.7 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.1, metalness: 1 }),
      black: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7, metalness: 0.1 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.9 }),
      tire: new THREE.MeshStandardMaterial({ map: T.tire, roughness: 0.95 }),
      plate: new THREE.MeshStandardMaterial({ map: T.makeNumber(bikeDef.num || 1), roughness: 0.5 }),
      glow: new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00c7ff, emissiveIntensity: 1.6, roughness: 0.4 }),
      light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 1.2 }),
      suit: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.75 }),
      suit2: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 }),
      helmet: new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.2, metalness: 0.1 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.9 }),
      boot: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 }),
      glove: new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.7 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xd9a07a, roughness: 0.7 }),
      shoe: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
    };
    if (isScooter(bikeDef)) this.buildScooter(); else this.buildPit();
    this.forkPos0 = this.fork.position.clone();
    this.forkQ0 = this.fork.quaternion.clone();
    this.rider = new Rider(this.mats);
    this.rider.setStyle(paint.style || 'street');
    this.body.add(this.rider.group);
    this.poses = makePoses(bikeDef);
    this.curPose = clonePose(this.poses.ride);
    this.tmpPose = clonePose(this.poses.ride);
    this.rider.apply(this.curPose);
    this.setPaint(paint);
    this.kickT = 0;
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  _mk(geo, mat, x = 0, y = 0, z = 0, parent = this.body) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  _tube(a, b, r, mat, parent = this.body) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const m = this._mk(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), mat, 0, 0, 0, parent);
    place(m, A, B);
    return m;
  }

  // Колесо питбайка со спицами и тормозным диском
  _pitWheel(R) {
    const M = this.mats;
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R - 0.06, 0.065, 10, 28), M.tire);
    tire.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.1, 0.018, 6, 24), M.rims);
    rim.rotation.y = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 12), M.chrome);
    hub.rotation.z = Math.PI / 2;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.42, R * 0.42, 0.006, 22), M.chrome);
    disc.rotation.z = Math.PI / 2; disc.position.x = -0.075;
    g.add(tire, rim, hub, disc);
    const sg = new THREE.CylinderGeometry(0.005, 0.005, R - 0.12, 4);
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(sg, M.chrome);
      const a = (i / 10) * Math.PI * 2;
      s.position.set((i % 2 ? 0.02 : -0.02), Math.cos(a) * (R - 0.12) / 2, Math.sin(a) * (R - 0.12) / 2);
      s.rotation.x = a;
      g.add(s);
    }
    return g;
  }

  // Маленькое колесо самоката: шина + литой диск
  _scootWheel(R, wide) {
    const M = this.mats;
    const g = new THREE.Group();
    const tr = wide ? 0.045 : 0.028;
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R - tr, tr, 8, 22), M.tire);
    tire.rotation.y = Math.PI / 2;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(R - tr * 1.4, R - tr * 1.4, wide ? 0.07 : 0.045, 16), M.rims);
    core.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, wide ? 0.1 : 0.07, 10), M.chrome);
    hub.rotation.z = Math.PI / 2;
    g.add(tire, core, hub);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(wide ? 0.075 : 0.05, R * 0.5, 0.012), M.black);
      sp.rotation.x = (i / 5) * Math.PI * 2;
      g.add(sp);
    }
    return g;
  }

  buildPit() {
    const d = this.def, M = this.mats;
    const R = d.wheel, hb = d.base / 2;
    const wy = -0.55 + R;
    const mk = this._mk.bind(this), tube = this._tube.bind(this);
    const electric = d.motor === 'electric';
    const rake = 0.42;
    this.rake = rake;
    const forkLen = (0.42 - wy) / Math.cos(rake);
    const headZ = hb - Math.sin(rake) * forkLen;
    this.headZ = headZ; this.pivotY = 0.42;
    this.fork = new THREE.Group();
    this.fork.position.set(0, 0.42, headZ);
    this.fork.rotation.x = -rake;
    this.body.add(this.fork);
    this.frontWheel = this._pitWheel(R);
    this.forkInner = new THREE.Group();
    this.fork.add(this.forkInner);
    for (const s of [-1, 1]) {
      mk(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 8), M.chrome, s * 0.085, -0.22, 0, this.forkInner);
      mk(new THREE.CylinderGeometry(0.04, 0.036, 0.4, 10), M.rims, s * 0.085, -(forkLen - 0.2), 0, this.forkInner);
    }
    this.frontWheel.position.set(0, -forkLen, 0);
    this.forkInner.add(this.frontWheel);
    this.bars = new THREE.Group();
    this.bars.position.set(0, 0.22, 0);
    this.forkInner.add(this.bars);
    const bar = mk(new THREE.CylinderGeometry(0.014, 0.014, 0.72, 8), M.chrome, 0, 0, 0, this.bars);
    bar.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), M.black, s * 0.31, 0, 0, this.bars).rotation.z = Math.PI / 2;
    mk(new THREE.BoxGeometry(0.2, 0.05, 0.08), M.frame, 0, 0.04, 0, this.forkInner);
    for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6), M.chrome, s * 0.05, 0.13, 0, this.forkInner);
    const plate = mk(new THREE.BoxGeometry(0.26, 0.24, 0.02), M.body, 0, -0.1, 0.07, this.forkInner);
    plate.rotation.x = 0.1;
    if (electric) {
      const hl = mk(new THREE.BoxGeometry(0.14, 0.05, 0.02), M.light, 0, -0.06, 0.085, this.forkInner);
      hl.rotation.x = 0.1;
    } else {
      const plateF = mk(new THREE.PlaneGeometry(0.2, 0.17), M.plate, 0, -0.1, 0.085, this.forkInner);
      plateF.rotation.x = 0.1;
    }
    const ff = mk(new THREE.BoxGeometry(0.14, 0.02, 0.46), M.body, 0, -forkLen + R + 0.07, 0.08, this.forkInner);
    ff.rotation.x = 0.2;
    this.rearWheel = this._pitWheel(R);
    this.rearWheel.position.set(0, wy, -hb);
    this.body.add(this.rearWheel);
    for (const s of [-1, 1]) {
      const sa = mk(new THREE.BoxGeometry(0.035, 0.05, hb + 0.05), M.frame, s * 0.08, wy + 0.08, -hb / 2 - 0.02);
      sa.rotation.x = -0.18;
    }
    const head = [0, 0.42, headZ];
    tube(head, [0, 0.05, -0.05], 0.035, M.frame);
    tube(head, [0, 0.3, -0.25], 0.03, M.frame);
    tube([0, 0.3, -0.25], [0, 0.0, -0.12], 0.03, M.frame);
    tube([0, 0.05, -0.05], [0, -0.1, -0.15], 0.03, M.frame);
    tube([0, 0.3, -0.25], [0, 0.32, -0.7], 0.022, M.frame);
    if (electric) {
      // батарея, мотор, светящаяся полоса
      mk(new THREE.BoxGeometry(0.2, 0.32, 0.42), M.body, 0, 0.08, 0.02);
      mk(new THREE.BoxGeometry(0.205, 0.02, 0.36), M.glow, 0, 0.15, 0.03);
      const mot = mk(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 16), M.black, 0, -0.12, -0.12);
      mot.rotation.z = Math.PI / 2;
      mk(new THREE.CylinderGeometry(0.05, 0.05, 0.17, 12), M.rims, 0, -0.12, -0.12).rotation.z = Math.PI / 2;
    } else {
      mk(new THREE.BoxGeometry(0.22, 0.25, 0.3), M.black, 0, -0.07, 0.02);
      mk(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 12), M.chrome, 0, 0.1, 0.12).rotation.x = -0.6;
      for (let i = 0; i < 4; i++) mk(new THREE.BoxGeometry(0.24, 0.012, 0.2), M.black, 0, 0.03 + i * 0.035, 0.12).rotation.x = -0.6;
      const cover = mk(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), M.chrome, 0.12, -0.08, -0.02);
      cover.rotation.z = Math.PI / 2;
      tube([0.06, 0.12, 0.18], [0.12, -0.05, 0.05], 0.025, M.chrome);
      tube([0.12, -0.05, 0.05], [0.16, 0.12, -0.35], 0.025, M.chrome);
      const muf = mk(new THREE.CylinderGeometry(0.055, 0.045, 0.36, 12), M.chrome, 0.17, 0.2, -0.55);
      muf.rotation.x = Math.PI / 2 - 0.25;
    }
    const tk = d.tank || 1;
    const tank = mk(new THREE.SphereGeometry(0.15, 16, 10), M.body, 0, 0.36, 0.1);
    tank.scale.set(1.15 * tk, 0.75, 1.5 * tk);
    for (const s of [-1, 1]) {
      const shroud = mk(new THREE.BoxGeometry(0.02, 0.2, 0.3), M.body, s * 0.15, 0.25, 0.17);
      shroud.rotation.x = -0.5; shroud.rotation.y = s * 0.15;
      const side = mk(new THREE.BoxGeometry(0.02, 0.15, 0.25), M.body, s * 0.13, 0.22, -0.4);
      side.rotation.x = 0.1;
      if (!electric) {
        const num = mk(new THREE.PlaneGeometry(0.16, 0.12), M.plate, s * 0.142, 0.22, -0.4);
        num.rotation.y = s * Math.PI / 2;
      } else mk(new THREE.BoxGeometry(0.004, 0.02, 0.22), M.glow, s * 0.142, 0.27, -0.4);
    }
    const seat = mk(new THREE.BoxGeometry(0.2, 0.07, 0.6), M.seat, 0, 0.36, -0.3);
    seat.rotation.x = 0.05;
    const rf = mk(new THREE.BoxGeometry(0.18, 0.025, 0.55), M.body, 0, 0.34, -0.75);
    rf.rotation.x = -0.25;
    for (const s of [-1, 1]) mk(new THREE.BoxGeometry(0.12, 0.025, 0.05), M.chrome, s * 0.16, -0.12, -0.02);
    tube([0, 0.3, -0.3], [0, wy + 0.1, -0.35], 0.03, M.rims);
  }

  buildScooter() {
    const d = this.def, M = this.mats;
    const R = d.wheel, hb = d.base / 2;
    const wy = -0.55 + R;
    const mk = this._mk.bind(this), tube = this._tube.bind(this);
    const el = d.motor === 'electric';
    const big = R > 0.16;
    const deckY = wy + 0.035;
    const deckW = el ? 0.2 : 0.13, deckT = el ? 0.07 : 0.035;
    const deckL = d.base - (el ? 0.1 : 0.2);
    // дека с шкуркой
    mk(new THREE.BoxGeometry(deckW, deckT, deckL), M.body, 0, deckY, -0.03);
    mk(new THREE.BoxGeometry(deckW - 0.01, 0.004, deckL - 0.04), M.black, 0, deckY + deckT / 2 + 0.002, -0.03);
    if (el) {
      mk(new THREE.BoxGeometry(deckW + 0.006, 0.012, deckL - 0.1), M.glow, 0, deckY - deckT / 2 + 0.01, -0.03);
    }
    // задняя часть и тормоз-крыло
    this.rearWheel = this._scootWheel(R, el);
    this.rearWheel.position.set(0, wy, -hb);
    this.body.add(this.rearWheel);
    for (const s of [-1, 1]) mk(new THREE.BoxGeometry(0.012, 0.05, R + 0.08), M.frame, s * (el ? 0.06 : 0.04), wy + 0.01, -hb + 0.04);
    const fender = mk(new THREE.BoxGeometry(el ? 0.1 : 0.07, 0.01, R * 1.5), el ? M.body : M.chrome, 0, wy + R + 0.025, -hb - 0.02);
    fender.rotation.x = -0.15;
    if (el) mk(new THREE.BoxGeometry(0.06, 0.03, 0.02), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.2 }), 0, wy + R + 0.02, -hb - R * 0.8);
    // руль: почти вертикальный
    const rake = el ? 0.18 : 0.08;
    this.rake = rake;
    const headZ = hb - 0.02 - Math.sin(rake) * 0.2;
    const headY = deckY + 0.16;
    this.headZ = headZ; this.pivotY = headY;
    const down = (headY - wy) / Math.cos(rake);
    const upL = (0.42 - headY) / Math.cos(rake);
    // шея деки к рулевой
    tube([0, deckY, deckL / 2 - 0.05], [0, headY, headZ], el ? 0.035 : 0.025, M.frame);
    this.fork = new THREE.Group();
    this.fork.position.set(0, headY, headZ);
    this.fork.rotation.x = -rake;
    this.body.add(this.fork);
    this.forkInner = new THREE.Group();
    this.fork.add(this.forkInner);
    this.frontWheel = this._scootWheel(R, el);
    this.frontWheel.position.set(0, -down, 0);
    this.forkInner.add(this.frontWheel);
    for (const s of [-1, 1]) mk(new THREE.BoxGeometry(0.012, down * 0.8, 0.03), M.frame, s * (el ? 0.055 : 0.035), -down * 0.55, 0, this.forkInner);
    mk(new THREE.CylinderGeometry(el ? 0.03 : 0.022, el ? 0.03 : 0.022, upL, 10), el ? M.frame : M.chrome, 0, upL / 2, 0, this.forkInner);
    if (el) {
      mk(new THREE.BoxGeometry(0.08, 0.05, 0.03), M.black, 0, upL - 0.03, 0.03, this.forkInner);
      mk(new THREE.BoxGeometry(0.05, 0.03, 0.004), M.glow, 0, upL - 0.025, 0.046, this.forkInner);
      mk(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), M.light, 0, upL * 0.55, 0.035, this.forkInner).rotation.x = Math.PI / 2;
      const ff = mk(new THREE.BoxGeometry(0.08, 0.01, R * 1.3), M.body, 0, -down + R + 0.03, 0.02, this.forkInner);
      ff.rotation.x = 0.15;
    }
    this.bars = new THREE.Group();
    this.bars.position.set(0, upL, 0);
    this.forkInner.add(this.bars);
    const bw = el ? 0.56 : 0.54;
    mk(new THREE.CylinderGeometry(0.014, 0.014, bw, 8), el ? M.frame : M.chrome, 0, 0, 0, this.bars).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.02, 0.02, 0.11, 8), M.black, s * (bw / 2 - 0.05), 0, 0, this.bars).rotation.z = Math.PI / 2;
    if (big) {
      // амортизаторы у мощного электросамоката
      for (const s of [-1, 1]) tube([s * 0.07, deckY + 0.02, -hb + 0.15], [s * 0.07, wy + 0.05, -hb], 0.016, M.rims);
    }
  }

  setPaint(p) {
    const f = FINISHES.find((x) => x.id === p.finish) || FINISHES[0];
    const M = this.mats;
    M.body.color.set(p.body); M.body.metalness = f.metal; M.body.roughness = f.rough;
    M.frame.color.set(p.frame); M.frame.metalness = Math.max(0.3, f.metal); M.frame.roughness = Math.min(0.5, f.rough + 0.1);
    M.rims.color.set(p.rims); M.rims.metalness = 0.7; M.rims.roughness = 0.3;
    M.suit.color.set(p.suit);
    M.suit2.color.set(p.suit).multiplyScalar(0.7);
    M.helmet.color.set(p.helmet); M.helmet.metalness = f.metal * 0.8; M.helmet.roughness = Math.max(0.15, f.rough);
    M.glove.color.set(p.helmet).multiplyScalar(0.4);
    M.glow.color.set(p.rims); M.glow.emissive.set(p.rims);
    M.suit.roughness = 0.75;
    const style = p.style || 'street';
    if (this.rider && this.rider.style !== style) this.rider.setStyle(style);
    if (style === 'street') { M.suit2.color.set(p.frame === '#1c1c1e' ? '#3b5b8a' : p.frame).multiplyScalar(0.85); M.suit.roughness = 0.9; }
  }

  // Тейлвип: рама вращается вокруг оси руля, а райдер и руль остаются на месте
  _applyWhip(angle, compressY) {
    if (Math.abs(angle) < 1e-4) {
      if (this._whipOn) {
        this.body.quaternion.identity();
        this.rider.group.position.set(0, 0, 0); this.rider.group.quaternion.identity();
        this.fork.position.copy(this.forkPos0); this.fork.quaternion.copy(this.forkQ0);
        this._whipOn = false;
      }
      this.body.position.set(0, compressY, 0);
      return;
    }
    this._whipOn = true;
    const axis = _v.set(0, Math.cos(this.rake), -Math.sin(this.rake));
    _q.setFromAxisAngle(axis, angle);
    const pivot = _v2.set(0, this.pivotY, this.headZ);
    // позиция тела: pivot - q*pivot (+ подвеска)
    const qp = pivot.clone().applyQuaternion(_q);
    this.body.quaternion.copy(_q);
    this.body.position.set(pivot.x - qp.x, pivot.y - qp.y + compressY, pivot.z - qp.z);
    // обратное преобразование для райдера и вилки (только вращение вокруг оси)
    _qi.copy(_q).invert();
    const w = pivot.clone().sub(qp); // смещение вращения
    const inv = w.clone().negate().applyQuaternion(_qi);
    this.rider.group.quaternion.copy(_qi);
    this.rider.group.position.copy(inv);
    this.fork.quaternion.copy(_qi).multiply(this.forkQ0);
    this.fork.position.copy(this.forkPos0).applyQuaternion(_qi).add(inv);
  }

  // Обновление визуала: колёса, руль, подвеска, поза
  update(dt, st) {
    const R = this.def.wheel;
    this.rearWheel.rotation.x += (st.wheelSpeed * dt) / R;
    this.frontWheel.rotation.x += (st.frontSpeed * dt) / R;
    const steer = lerp(this.forkInner.rotation.y - (this._barExtra || 0), st.steerVis * 0.45, 1 - Math.exp(-10 * dt));
    this._barExtra = st.bar || 0;
    this.forkInner.rotation.y = steer + this._barExtra;
    this._applyWhip(st.whip || 0, -st.compress * 0.12);
    // поза
    const P = this.poses;
    let target = P.ride;
    if (st.crashed) target = P.crash;
    else if (st.pose && P[st.pose]) target = P[st.pose];
    else if (st.bar) target = P.barspin;
    else if (st.idle) target = P.idle;
    else if (st.lean > 0.3) target = P.back;
    else if (st.lean < -0.3) target = P.fwd;
    else if (st.seated) target = P.seat;
    const k = 1 - Math.exp(-(st.pose || st.bar ? 14 : 9) * dt);
    lerpPose(this.curPose, this.curPose, target, k);
    this.tmpPose.hips.copy(this.curPose.hips);
    for (const key of ['torso', 'hl', 'hr', 'fl', 'fr', 'el', 'er', 'kl', 'kr']) this.tmpPose[key].copy(this.curPose[key]);
    this.tmpPose.hips.y -= st.compress * 0.15;
    // толчки ногой на самокате
    if (this.def.motor === 'kick' && st.kicking && !st.pose && !st.crashed) {
      this.kickT += dt * 2.2;
      const ph = this.kickT % 1;
      const s = Math.sin(ph * TAU);
      const foot = this.tmpPose.fr;
      foot.x = -0.2; foot.y = -0.5 + Math.max(0, s) * 0.08; foot.z = -0.15 - s * 0.35;
      this.tmpPose.hips.y -= 0.06;
    } else this.kickT = 0;
    const sv = steer;
    if (!st.crashed && !st.bar && (!st.pose || st.pose === 'superman' || st.pose === 'cancan' || st.pose === 'heelclick' || st.pose === 'indian' || st.pose === 'nacnac' || st.pose === 'hartattack' || st.pose === 'kiss')) {
      this.tmpPose.hl.z += -sv * 0.12; this.tmpPose.hr.z += sv * 0.12;
    }
    this.rider.apply(this.tmpPose);
  }
}

// Объект «тень-пятно» под байком
export function makeBlob(T) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: T.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
  );
  m.scale.set(1.0, 1, 2.0);
  m.renderOrder = 1;
  return m;
}
export { clamp };
