// Модель питбайка и райдера (процедурная), покраска, позы для трюков
import * as THREE from 'three';
import { lerp, clamp } from './util.js';

export const BIKES = [
  {
    id: 'kroha', name: 'Кроха 110', price: 0,
    desc: 'Лёгкий и вёрткий. Идеален для старта.',
    stats: { speed: 21, accel: 8.5, turn: 2.5, flip: 4.6, spin: 4.2, pop: 4.2, land: 16 },
    wheel: 0.29, base: 1.18, tank: 0.9, num: 7,
  },
  {
    id: 'shershen', name: 'Шершень 140', price: 18000,
    desc: 'Мощнее мотор, быстрее вращения.',
    stats: { speed: 24.5, accel: 10, turn: 2.55, flip: 5.3, spin: 4.8, pop: 4.8, land: 18 },
    wheel: 0.31, base: 1.24, tank: 1.0, num: 14,
  },
  {
    id: 'titan', name: 'Титан 190', price: 52000,
    desc: 'Максимальная скорость и огромные прыжки.',
    stats: { speed: 28, accel: 11.5, turn: 2.6, flip: 5.9, spin: 5.4, pop: 5.4, land: 20 },
    wheel: 0.33, base: 1.3, tank: 1.1, num: 99,
  },
];

export const UPGRADES = [
  { id: 'engine', name: 'Двигатель', desc: 'Скорость и разгон', base: 900 },
  { id: 'susp', name: 'Подвеска', desc: 'Прыжок и мягкая посадка', base: 800 },
  { id: 'tires', name: 'Шины', desc: 'Сцепление и поворот', base: 600 },
  { id: 'balance', name: 'Баланс', desc: 'Скорость сальто и вращений', base: 1000 },
];
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
  { id: 'body', name: 'Пластик' },
  { id: 'frame', name: 'Рама' },
  { id: 'rims', name: 'Диски' },
  { id: 'suit', name: 'Одежда' },
  { id: 'helmet', name: 'Шлем/кепка' },
];
export const PAINT_COST = 250;
export const defaultPaint = (i) => [
  { body: '#ff3b30', frame: '#1c1c1e', rims: '#ffcc00', suit: '#f2f2f2', helmet: '#1c1c1e', finish: 'gloss', style: 'street' },
  { body: '#ffcc00', frame: '#1c1c1e', rims: '#1c1c1e', suit: '#0a5cff', helmet: '#ffcc00', finish: 'gloss', style: 'moto' },
  { body: '#30b0ff', frame: '#c7c7cc', rims: '#ff2d92', suit: '#ffffff', helmet: '#30b0ff', finish: 'metal', style: 'moto' },
][i];

// ---------- Позы райдера (в локальных координатах байка; +z вперёд, +y вверх) ----------
// hips, chest (направление корпуса), руки L/R, ноги L/R
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function pose(o) {
  return {
    hips: o.hips, torso: o.torso.clone().normalize(), head: o.head || 0,
    hl: o.hl, hr: o.hr, fl: o.fl, fr: o.fr,
    el: o.el || V(0.6, -0.4, -0.5), er: o.er || V(-0.6, -0.4, -0.5),
    kl: o.kl || V(0.3, 0, 1), kr: o.kr || V(-0.3, 0, 1),
  };
}
export function makePoses(bk) {
  const wy = -0.55 + bk.wheel;
  const L = (0.42 - wy) / Math.cos(0.42);
  const gz = bk.base / 2 - Math.sin(0.42) * L - 0.09; // руль
  const grips = (y = 0.62) => [V(0.33, y, gz), V(-0.33, y, gz)];
  const [gl, gr] = grips();
  return {
    ride: pose({ hips: V(0, 0.62, -0.18), torso: V(0, 1, 0.75), hl: gl, hr: gr, fl: V(0.17, -0.1, -0.02), fr: V(-0.17, -0.1, -0.02) }),
    seat: pose({ hips: V(0, 0.42, -0.24), torso: V(0, 1, 0.45), hl: gl, hr: gr, fl: V(0.2, -0.1, 0.05), fr: V(-0.2, -0.1, 0.05) }),
    back: pose({ hips: V(0, 0.5, -0.42), torso: V(0, 1, 0.1), hl: gl, hr: gr, fl: V(0.17, -0.1, -0.02), fr: V(-0.17, -0.1, -0.02) }),
    fwd: pose({ hips: V(0, 0.68, 0.02), torso: V(0, 1, 1.4), hl: gl, hr: gr, fl: V(0.17, -0.1, -0.02), fr: V(-0.17, -0.1, -0.02) }),
    // Трюки
    superman: pose({ hips: V(0, 0.85, -0.55), torso: V(0, 0.35, 1), hl: gl, hr: gr, fl: V(0.18, 0.85, -1.45), fr: V(-0.18, 0.95, -1.4), kl: V(0, -1, 0), kr: V(0, -1, 0) }),
    cancan: pose({ hips: V(0, 0.6, -0.18), torso: V(-0.15, 1, 0.6), hl: gl, hr: gr, fl: V(-0.55, 0.15, 0.45), fr: V(-0.17, -0.1, -0.02), kl: V(-0.5, 0.4, 1) }),
    nohander: pose({ hips: V(0, 0.68, -0.2), torso: V(0, 1, 0.25), hl: V(0.85, 1.25, -0.05), hr: V(-0.85, 1.25, -0.05), fl: V(0.17, -0.1, -0.02), fr: V(-0.17, -0.1, -0.02), el: V(0, -1, -0.5), er: V(0, -1, -0.5) }),
    heelclick: pose({ hips: V(0, 0.55, -0.22), torso: V(0, 1, 0.2), hl: gl, hr: gr, fl: V(0.06, 0.62, 0.95), fr: V(-0.06, 0.62, 0.95), kl: V(0.6, 1, 0.3), kr: V(-0.6, 1, 0.3) }),
    // Падение
    crash: pose({ hips: V(0, 0, 0), torso: V(0, 1, 0.3), hl: V(0.6, 0.6, 0.2), hr: V(-0.6, 0.5, 0.3), fl: V(0.35, -0.85, -0.1), fr: V(-0.3, -0.8, 0.25) }),
    idle: pose({ hips: V(0, 0.42, -0.24), torso: V(0, 1, 0.3), hl: gl, hr: gr, fl: V(0.42, -0.55, 0.05), fr: V(-0.2, -0.1, 0.05) }),
  };
}

export const TRICK_POSES = [
  { id: 'superman', name: 'Супермен', pts: 450 },
  { id: 'cancan', name: 'Кан-кан', pts: 300 },
  { id: 'nohander', name: 'Без рук', pts: 350 },
  { id: 'heelclick', name: 'Хил-клик', pts: 400 },
];

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
    // голова: мото-шлем
    this.head = new THREE.Group();
    this.group.add(this.head);
    this.moto = new THREE.Group();
    const hm = mk(new THREE.SphereGeometry(0.15, 16, 12), M.helmet, this.moto);
    hm.scale.set(1, 1.05, 1.12);
    mk(new THREE.BoxGeometry(0.16, 0.08, 0.12), M.helmet, this.moto).position.set(0, -0.08, 0.12);
    mk(new THREE.BoxGeometry(0.2, 0.07, 0.04), M.visor, this.moto).position.set(0, 0.0, 0.155);
    const peak = mk(new THREE.BoxGeometry(0.2, 0.02, 0.16), M.helmet, this.moto);
    peak.position.set(0, 0.1, 0.14); peak.rotation.x = -0.25;
    // голова: уличный стиль — кепка и очки
    this.street = new THREE.Group();
    const hd = mk(new THREE.SphereGeometry(0.115, 14, 10), M.skin, this.street);
    hd.scale.set(0.92, 1.08, 1.02);
    mk(new THREE.SphereGeometry(0.122, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), M.helmet, this.street).position.set(0, 0.03, -0.005);
    const visorCap = mk(new THREE.BoxGeometry(0.2, 0.014, 0.13), M.helmet, this.street);
    visorCap.position.set(0, 0.035, -0.17); // кепка козырьком назад
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

// ---------- Байк ----------
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
      plate: new THREE.MeshStandardMaterial({ map: T.makeNumber(bikeDef.num), roughness: 0.5 }),
      suit: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.75 }),
      suit2: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 }),
      helmet: new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.2, metalness: 0.1 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.9 }),
      boot: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 }),
      glove: new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.7 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xd9a07a, roughness: 0.7 }),
      shoe: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
    };
    this.build();
    this.rider = new Rider(this.mats);
    this.rider.setStyle(paint.style || 'street');
    this.body.add(this.rider.group);
    this.poses = makePoses(bikeDef);
    this.curPose = clonePose(this.poses.ride);
    this.tmpPose = clonePose(this.poses.ride);
    this.rider.apply(this.curPose);
    this.setPaint(paint);
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  build() {
    const d = this.def, M = this.mats;
    const R = d.wheel, hb = d.base / 2;
    const wy = -0.55 + R; // ось колеса относительно ЦМ (низ колеса на -0.55)
    this.wheelY = wy;
    const mk = (geo, mat, x = 0, y = 0, z = 0, parent = this.body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    // Колёса
    const wheel = () => {
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
      // спицы
      const sg = new THREE.CylinderGeometry(0.005, 0.005, R - 0.12, 4);
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Mesh(sg, M.chrome);
        const a = (i / 10) * Math.PI * 2;
        s.position.set((i % 2 ? 0.02 : -0.02), Math.cos(a) * (R - 0.12) / 2, Math.sin(a) * (R - 0.12) / 2);
        s.rotation.x = a;
        g.add(s);
      }
      return g;
    };
    // Передняя вилка (поворотная), ось колеса точно в (0, wy, hb)
    const rake = 0.42;
    const forkLen = (0.42 - wy) / Math.cos(rake);
    const headZ = hb - Math.sin(rake) * forkLen;
    this.headZ = headZ;
    this.fork = new THREE.Group();
    this.fork.position.set(0, 0.42, headZ);
    this.fork.rotation.x = -rake; // наклон вилки (кастер)
    this.body.add(this.fork);
    this.frontWheel = wheel();
    this.forkInner = new THREE.Group();
    this.fork.add(this.forkInner);
    for (const s of [-1, 1]) {
      mk(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 8), M.chrome, s * 0.085, -0.22, 0, this.forkInner);
      mk(new THREE.CylinderGeometry(0.04, 0.036, 0.4, 10), M.rims, s * 0.085, -(forkLen - 0.2), 0, this.forkInner);
    }
    this.frontWheel.position.set(0, -forkLen, 0);
    this.forkInner.add(this.frontWheel);
    // руль
    const bar = mk(new THREE.CylinderGeometry(0.014, 0.014, 0.72, 8), M.chrome, 0, 0.22, 0, this.forkInner);
    bar.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), M.black, s * 0.31, 0.22, 0, this.forkInner).rotation.z = Math.PI / 2;
    mk(new THREE.BoxGeometry(0.2, 0.05, 0.08), M.frame, 0, 0.04, 0, this.forkInner);
    for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6), M.chrome, s * 0.05, 0.13, 0, this.forkInner);
    // номерной щит спереди
    const plate = mk(new THREE.BoxGeometry(0.26, 0.24, 0.02), M.body, 0, -0.1, 0.07, this.forkInner);
    plate.rotation.x = 0.1;
    const plateF = mk(new THREE.PlaneGeometry(0.2, 0.17), M.plate, 0, -0.1, 0.085, this.forkInner);
    plateF.rotation.x = 0.1;
    // переднее крыло
    const ff = mk(new THREE.BoxGeometry(0.14, 0.02, 0.46), M.body, 0, -forkLen + R + 0.07, 0.08, this.forkInner);
    ff.rotation.x = 0.2;

    // Заднее колесо и маятник
    this.rearWheel = wheel();
    this.rearWheel.position.set(0, wy, -hb);
    this.body.add(this.rearWheel);
    for (const s of [-1, 1]) {
      const sa = mk(new THREE.BoxGeometry(0.035, 0.05, hb + 0.05), M.frame, s * 0.08, wy + 0.08, -hb / 2 - 0.02);
      sa.rotation.x = -0.18;
    }
    // Рама
    const tube = (a, b, r, mat = M.frame) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const m = mk(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), mat);
      place(m, A, B);
      return m;
    };
    const head = [0, 0.42, headZ];
    tube(head, [0, 0.05, -0.05], 0.035);
    tube(head, [0, 0.3, -0.25], 0.03);
    tube([0, 0.3, -0.25], [0, 0.0, -0.12], 0.03);
    tube([0, 0.05, -0.05], [0, -0.1, -0.15], 0.03);
    tube([0, 0.3, -0.25], [0, 0.32, -0.7], 0.022);
    // Двигатель
    mk(new THREE.BoxGeometry(0.22, 0.25, 0.3), M.black, 0, -0.07, 0.02);
    mk(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 12), M.chrome, 0, 0.1, 0.12).rotation.x = -0.6;
    for (let i = 0; i < 4; i++) mk(new THREE.BoxGeometry(0.24, 0.012, 0.2), M.black, 0, 0.03 + i * 0.035, 0.12).rotation.x = -0.6;
    const cover = mk(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), M.chrome, 0.12, -0.08, -0.02);
    cover.rotation.z = Math.PI / 2;
    // Выхлоп
    tube([0.06, 0.12, 0.18], [0.12, -0.05, 0.05], 0.025, M.chrome);
    tube([0.12, -0.05, 0.05], [0.16, 0.12, -0.35], 0.025, M.chrome);
    const muf = mk(new THREE.CylinderGeometry(0.055, 0.045, 0.36, 12), M.chrome, 0.17, 0.2, -0.55);
    muf.rotation.x = Math.PI / 2 - 0.25;
    // Бак и пластик
    const tk = d.tank;
    const tank = mk(new THREE.SphereGeometry(0.15, 16, 10), M.body, 0, 0.36, 0.1);
    tank.scale.set(1.15 * tk, 0.75, 1.5 * tk);
    for (const s of [-1, 1]) {
      const shroud = mk(new THREE.BoxGeometry(0.02, 0.2, 0.3), M.body, s * 0.15, 0.25, 0.17);
      shroud.rotation.x = -0.5; shroud.rotation.y = s * 0.15;
      const side = mk(new THREE.BoxGeometry(0.02, 0.15, 0.25), M.body, s * 0.13, 0.22, -0.4);
      side.rotation.x = 0.1;
      const num = mk(new THREE.PlaneGeometry(0.16, 0.12), M.plate, s * 0.142, 0.22, -0.4);
      num.rotation.y = s * Math.PI / 2;
    }
    // Сиденье
    const seat = mk(new THREE.BoxGeometry(0.2, 0.07, 0.6), M.seat, 0, 0.36, -0.3);
    seat.rotation.x = 0.05;
    // Заднее крыло
    const rf = mk(new THREE.BoxGeometry(0.18, 0.025, 0.55), M.body, 0, 0.34, -0.75);
    rf.rotation.x = -0.25;
    // Подножки
    for (const s of [-1, 1]) mk(new THREE.BoxGeometry(0.12, 0.025, 0.05), M.chrome, s * 0.16, -0.12, -0.02);
    // Амортизатор
    tube([0, 0.3, -0.3], [0, wy + 0.1, -0.35], 0.03, M.rims);
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
    M.suit.roughness = 0.75;
    const style = p.style || 'street';
    if (this.rider && this.rider.style !== style) this.rider.setStyle(style);
    if (style === 'street') { M.suit2.color.set(p.frame === '#1c1c1e' ? '#3b5b8a' : p.frame).multiplyScalar(0.85); M.suit.roughness = 0.9; }
  }

  // Обновление визуала: колёса, руль, подвеска, поза
  update(dt, st) {
    const R = this.def.wheel;
    this.rearWheel.rotation.x += (st.wheelSpeed * dt) / R;
    this.frontWheel.rotation.x += (st.frontSpeed * dt) / R;
    this.forkInner.rotation.y = lerp(this.forkInner.rotation.y, st.steerVis * 0.45, 1 - Math.exp(-10 * dt));
    this.body.position.y = -st.compress * 0.12;
    // поза
    const P = this.poses;
    let target = P.ride;
    if (st.crashed) target = P.crash;
    else if (st.pose) target = P[st.pose];
    else if (st.idle) target = P.idle;
    else if (st.lean > 0.3) target = P.back;
    else if (st.lean < -0.3) target = P.fwd;
    else if (st.seated) target = P.seat;
    const k = 1 - Math.exp(-(st.pose ? 14 : 9) * dt);
    lerpPose(this.curPose, this.curPose, target, k);
    // лёгкое покачивание от подвески
    this.tmpPose.hips.copy(this.curPose.hips);
    for (const key of ['torso', 'hl', 'hr', 'fl', 'fr', 'el', 'er', 'kl', 'kr']) this.tmpPose[key].copy(this.curPose[key]);
    this.tmpPose.hips.y -= st.compress * 0.15;
    // при повороте руки за рулём
    const sv = this.forkInner.rotation.y;
    if (!st.pose || st.pose === 'superman' || st.pose === 'cancan' || st.pose === 'heelclick') {
      if (!st.crashed) {
        this.tmpPose.hl.z += -sv * 0.12; this.tmpPose.hr.z += sv * 0.12;
      }
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
