// Машины на дорогах, пешеходы и зрители (всё через InstancedMesh — мало draw calls)
import * as THREE from 'three';
import { GeoBuilder, appendGeometry } from './geo.js';
import { ROAD_LINES, terrainH } from './world.js';
import { clamp, damp, mulberry32, wrapAngle } from './util.js';

const CAR_COLORS = ['#d6332a', '#f2f2f2', '#1f4fa3', '#222326', '#9aa3ad', '#e6b422', '#2f7d4a', '#7a1f3d', '#ff7a1a', '#3fa7d6'];

// Геометрия машины из профилей (выдавливание с фаской): корпус (красится) и детали
function profileShape(pts, arches) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  if (arches) {
    // нижняя кромка спереди назад с арками колёс
    const [fx, rx, y] = arches;
    sh.lineTo(fx + 0.42, y);
    sh.absarc(fx, y + 0.04, 0.42, 0, Math.PI, false);
    sh.lineTo(rx + 0.42, y);
    sh.absarc(rx, y + 0.04, 0.42, 0, Math.PI, false);
  }
  sh.closePath();
  return sh;
}
function extrude(shape, depth, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 5 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return g;
}
const CAR_TYPES = [
  { // седан
    body: [[-2.2, 0.3], [-2.24, 0.62], [-2.08, 0.86], [-1.25, 0.92], [1.15, 0.9], [2.05, 0.76], [2.22, 0.52], [2.16, 0.3]],
    cabin: [[-1.22, 0.9], [-0.72, 1.36], [0.42, 1.38], [1.15, 0.9]],
    roof: [[-0.74, 1.33], [-0.7, 1.43], [0.42, 1.45], [0.48, 1.35]],
    wf: 1.35, wr: -1.35, front: 2.2, rear: -2.22,
  },
  { // хэтчбек
    body: [[-1.95, 0.3], [-2.0, 0.66], [-1.92, 0.96], [1.05, 0.92], [1.95, 0.78], [2.1, 0.52], [2.04, 0.3]],
    cabin: [[-1.86, 0.94], [-1.62, 1.42], [0.3, 1.45], [1.05, 0.92]],
    roof: [[-1.66, 1.38], [-1.6, 1.5], [0.3, 1.52], [0.36, 1.42]],
    wf: 1.28, wr: -1.25, front: 2.08, rear: -1.98,
  },
];
export function carGeometries(type = 0) {
  const T = CAR_TYPES[type];
  const body = new GeoBuilder(), det = new GeoBuilder();
  const m = new THREE.Matrix4();
  // корпус: нижняя кромка с арками (спереди назад)
  const pts = T.body.slice();
  const bodyShape = profileShape(pts, [T.wf, T.wr, 0.3]);
  appendGeometry(body, extrude(bodyShape, 1.66, 0.07), m.identity());
  appendGeometry(body, extrude(profileShape(T.roof), 1.5, 0.04), m.identity());
  // стойки
  for (const sx of [-0.76, 0.76]) {
    for (const [z0, y0, z1, y1] of [[T.cabin[0][0] + 0.06, 0.92, T.cabin[1][0], 1.36], [T.cabin[3][0] - 0.06, 0.92, T.cabin[2][0], 1.38]]) {
      const A = new THREE.Vector3(sx, y0, z0), B = new THREE.Vector3(sx, y1, z1);
      const len = A.distanceTo(B);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
      appendGeometry(body, new THREE.BoxGeometry(0.07, len, 0.08), m.compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    }
  }
  // стёкла
  appendGeometry(det, extrude(profileShape(T.cabin), 1.5, 0.03), m.identity(), [0.09, 0.12, 0.16]);
  // колёса: шина + диск
  const tire = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.21, 0.21, 0.26, 8).rotateZ(Math.PI / 2);
  for (const sx of [-0.8, 0.8]) for (const z of [T.wf, T.wr]) {
    appendGeometry(det, tire, m.makeTranslation(sx, 0.34, z), [0.06, 0.06, 0.07]);
    appendGeometry(det, rim, m.makeTranslation(sx * 1.01, 0.34, z), [0.75, 0.76, 0.8]);
  }
  // фары, фонари, решётка, бамперы, номера, зеркала
  for (const sx of [-0.58, 0.58]) {
    det.box(sx, 0.66, T.front - 0.02, 0.38, 0.13, 0.06, [1, 0.96, 0.82], 1);
    det.box(sx, 0.72, T.rear + 0.02, 0.4, 0.12, 0.06, [0.85, 0.05, 0.05], 1);
    det.box(sx * 1.6, 1.0, T.cabin[3][0] - 0.1, 0.16, 0.1, 0.12, [0.1, 0.1, 0.1], 1);
  }
  det.box(0, 0.52, T.front + 0.02, 0.8, 0.14, 0.05, [0.08, 0.08, 0.09], 1);
  det.box(0, 0.34, T.front + 0.04, 1.72, 0.16, 0.08, [0.14, 0.14, 0.15], 1);
  det.box(0, 0.34, T.rear - 0.04, 1.72, 0.16, 0.08, [0.14, 0.14, 0.15], 1);
  det.box(0, 0.5, T.rear - 0.05, 0.42, 0.11, 0.02, [0.95, 0.95, 0.95], 1);
  det.box(0, 0.36, T.front + 0.09, 0.42, 0.1, 0.02, [0.95, 0.95, 0.95], 1);
  return [body.build(), det.build()];
}

// Автопарк: два типа машин, у каждого корпус + детали; индекс машины -> (тип, номер)
class Fleet {
  constructor(scene, count, shadows) {
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.55, vertexColors: true });
    const detMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.65 });
    this.sets = [0, 1].map((t) => {
      const n = Math.ceil(count / 2) + 1;
      const [bg, dg] = carGeometries(t);
      const body = new THREE.InstancedMesh(bg, bodyMat, n);
      const det = new THREE.InstancedMesh(dg, detMat, n);
      body.castShadow = det.castShadow = shadows;
      body.receiveShadow = det.receiveShadow = true;
      body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      det.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      body.count = det.count = 0;
      scene.add(body, det);
      return { body, det };
    });
    this.map = [];
    for (let i = 0; i < count; i++) {
      const s = this.sets[i % 2];
      this.map.push([s, s.body.count]);
      s.body.count++; s.det.count++;
    }
  }
  setMatrix(i, m) { const [s, k] = this.map[i]; s.body.setMatrixAt(k, m); s.det.setMatrixAt(k, m); }
  setColor(i, c) { const [s, k] = this.map[i]; s.body.setColorAt(k, c); }
  update() {
    for (const s of this.sets) { s.body.instanceMatrix.needsUpdate = true; s.det.instanceMatrix.needsUpdate = true; if (s.body.instanceColor) s.body.instanceColor.needsUpdate = true; }
  }
}

// Прямоугольный маршрут с полосой справа по ходу
function makeLoop(corners, lane) {
  const n = corners.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p = corners[(i + n - 1) % n], c = corners[i], q = corners[(i + 1) % n];
    const d1 = [c[0] - p[0], c[1] - p[1]], d2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
    const r1 = [-d1[1] / l1, d1[0] / l1], r2 = [-d2[1] / l2, d2[0] / l2];
    pts.push([c[0] + (r1[0] + r2[0]) * lane, c[1] + (r1[1] + r2[1]) * lane]);
  }
  const seg = [];
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push({ a, b, len, s0: L });
    L += len;
  }
  return {
    L, seg,
    at(s, out) {
      s = ((s % L) + L) % L;
      for (const g of seg) {
        if (s <= g.s0 + g.len) {
          const t = (s - g.s0) / g.len;
          out[0] = g.a[0] + (g.b[0] - g.a[0]) * t;
          out[1] = g.a[1] + (g.b[1] - g.a[1]) * t;
          out[2] = g.s0 + g.len - s; // до поворота
          return out;
        }
      }
      return out;
    },
  };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const _c = new THREE.Color();
const _root = new THREE.Matrix4();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

export class Traffic {
  constructor(scene, world, quality) {
    this.world = world;
    const shadows = quality !== 'low';
    const L = ROAD_LINES;
    const rects = [
      [[L[0], L[0]], [L[3], L[0]], [L[3], L[3]], [L[0], L[3]]],
      [[L[1], L[1]], [L[2], L[1]], [L[2], L[2]], [L[1], L[2]]],
      [[L[0], L[1]], [L[1], L[1]], [L[1], L[2]], [L[0], L[2]]],
      [[L[2], L[1]], [L[3], L[1]], [L[3], L[2]], [L[2], L[2]]],
      [[L[1], L[2]], [L[2], L[2]], [L[2], L[3]], [L[1], L[3]]],
      [[L[1], L[0]], [L[2], L[0]], [L[2], L[1]], [L[1], L[1]]],
    ];
    this.loops = [];
    for (const r of rects) {
      this.loops.push(makeLoop(r, 3.4));
      this.loops.push(makeLoop([...r].reverse(), 3.4));
    }
    const nCars = quality === 'low' ? 14 : quality === 'med' ? 22 : 30;
    const rnd = mulberry32(777);
    this.cars = [];
    for (let i = 0; i < nCars; i++) {
      const loop = this.loops[i % this.loops.length];
      const car = {
        id: i, loop, s: rnd() * loop.L, speed: 8 + rnd() * 4, cruise: 9 + rnd() * 5,
        x: 0, z: 0, y: 0, yaw: 0, nearT: 0, honk: 0,
      };
      this.cars.push(car);
      // динамическое препятствие для физики
      const self = car;
      world.dynamic.push({
        active: true, car: self, isCar: true,
        heightAt(px, pz) {
          const dx = px - self.x, dz = pz - self.z;
          if (dx * dx + dz * dz > 9) return -Infinity;
          const c = Math.cos(self.yaw), s = Math.sin(self.yaw);
          const u = dx * s + dz * c, v = dx * c - dz * s;
          return Math.abs(u) < 2.2 && Math.abs(v) < 0.92 ? self.y + 1.32 : -Infinity;
        },
      });
    }
    const parked = world.parked;
    this.fleet = new Fleet(scene, nCars + parked.length, shadows);
    for (let i = 0; i < nCars; i++) this.fleet.setColor(i, _c.set(CAR_COLORS[i % CAR_COLORS.length]));
    // припаркованные машины — статичные инстансы
    parked.forEach((p, k) => {
      const i = nCars + k;
      _p.set(p[0], terrainH(p[0], p[1]) + 0.05, p[1]);
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p[2]);
      _m.compose(_p, _q, _s);
      this.fleet.setMatrix(i, _m);
      this.fleet.setColor(i, _c.set(CAR_COLORS[p[3] % CAR_COLORS.length]));
    });
    this.fleet.update();
    this.nCars = nCars;
    this.tmp = [0, 0, 0];
    this.tmp2 = [0, 0, 0];
    this.update(0, null);
  }

  update(dt, player, hooks) {
    const P = player;
    for (const car of this.cars) {
      // ограничение скорости перед поворотом и перед игроком/машиной
      car.loop.at(car.s, this.tmp);
      let target = car.cruise;
      if (this.tmp[2] < 18) target = Math.min(target, 5.5 + this.tmp[2] * 0.2);
      if (P && !P.crashed) {
        const dx = P.pos.x - car.x, dz = P.pos.z - car.z;
        const fs = Math.sin(car.yaw), fc = Math.cos(car.yaw);
        const ahead = dx * fs + dz * fc, lat = Math.abs(dx * fc - dz * fs);
        if (ahead > 0 && ahead < 16 && lat < 2.6 && P.pos.y < car.y + 3) {
          target = Math.min(target, Math.max(0, (ahead - 5) * 0.8));
          if (ahead < 9 && car.honk <= 0 && hooks) { hooks.honk(car); car.honk = 6; }
        }
      }
      // машина впереди на том же маршруте
      for (const o of this.cars) {
        if (o === car || o.loop !== car.loop) continue;
        let d = o.s - car.s;
        if (d < 0) d += car.loop.L;
        if (d < 14) target = Math.min(target, Math.max(0, (d - 7) * 0.8));
      }
      car.honk -= dt;
      car.speed = damp(car.speed, target, target < car.speed ? 4 : 1, dt);
      car.s = (car.s + car.speed * dt) % car.loop.L;
      // плавные повороты: середина хорды
      car.loop.at(car.s - 3, this.tmp);
      car.loop.at(car.s + 3, this.tmp2);
      car.x = (this.tmp[0] + this.tmp2[0]) / 2;
      car.z = (this.tmp[1] + this.tmp2[1]) / 2;
      car.yaw = Math.atan2(this.tmp2[0] - this.tmp[0], this.tmp2[1] - this.tmp[1]);
      car.y = 0.06;
      // взаимодействие с игроком
      if (P && hooks && !P.crashed) {
        const dx = P.pos.x - car.x, dz = P.pos.z - car.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 36) {
          const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
          const u = dx * s + dz * c, v = dx * c - dz * s;
          const above = P.pos.y - 0.55 > car.y + 1.3;
          if (!P.grounded && Math.abs(u) < 2.6 && Math.abs(v) < 1.3 && above && P.jump) P.jump.cars.add('m' + car.id);
          if (Math.abs(u) < 2.45 && Math.abs(v) < 1.15 && !above && P.grounded && car.speed > 2.5) hooks.hit(car);
          const sp = P.grounded ? Math.abs(P.speed) : 0;
          if (sp > 11 && Math.abs(u) < 3 && Math.abs(v) > 1.2 && Math.abs(v) < 2.6 && car.nearT <= 0) {
            car.nearT = 3;
            hooks.near(car);
          }
        }
      }
      car.nearT -= dt;
      _p.set(car.x, car.y, car.z);
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, car.yaw);
      _m.compose(_p, _q, _s);
      this.fleet.setMatrix(car.id, _m);
    }
    this.fleet.update();
  }
}

// ---------- Люди ----------
const SKIN = ['#f1c7a5', '#e0ac85', '#c68b62', '#8d5a3c', '#5e3b26', '#f3d0b5'];
const SHIRTS = ['#e63946', '#f1faee', '#457b9d', '#1d3557', '#ffb703', '#2a9d8f', '#8338ec', '#fb5607', '#ff006e', '#3a86ff', '#606c38', '#ffffff', '#222222', '#9b2226', '#94d2bd'];
const PANTS = ['#264653', '#1b1b1e', '#3d405b', '#5e503f', '#14213d', '#6c757d', '#3b5b8a', '#2f4f6f', '#8a7a5a'];
const HAIR = ['#1b1b1b', '#2b1d12', '#4a3020', '#7a5230', '#c9a66b', '#3a3a3a'];
const CAPS = ['#111111', '#c1121f', '#ffffff', '#1d4ed8', '#f59e0b', '#16a34a'];
const SHOES = ['#f5f5f5', '#111111', '#7a4b2a', '#c1121f', '#2b2d42'];
const _ua = new THREE.Matrix4(), _tmp = new THREE.Matrix4();

function personGeometries() {
  const G = {};
  G.torso = new THREE.CapsuleGeometry(0.165, 0.3, 2, 8).scale(1.18, 1, 0.66).translate(0, 1.22, 0);
  const pel = new GeoBuilder();
  appendGeometry(pel, new THREE.BoxGeometry(0.34, 0.2, 0.2), new THREE.Matrix4().makeTranslation(0, 0.93, 0));
  G.pelvis = pel.build();
  const hb = new GeoBuilder();
  appendGeometry(hb, new THREE.SphereGeometry(0.112, 9, 7).scale(0.92, 1.1, 1), new THREE.Matrix4().makeTranslation(0, 1.65, 0));
  appendGeometry(hb, new THREE.CylinderGeometry(0.048, 0.055, 0.14, 6, 1, true), new THREE.Matrix4().makeTranslation(0, 1.51, 0));
  appendGeometry(hb, new THREE.BoxGeometry(0.03, 0.04, 0.04), new THREE.Matrix4().makeTranslation(0, 1.64, 0.11));
  for (const x of [-0.105, 0.105]) appendGeometry(hb, new THREE.SphereGeometry(0.025, 4, 3), new THREE.Matrix4().makeTranslation(x, 1.65, 0));
  G.head = hb.build();
  G.hair = new THREE.SphereGeometry(0.118, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.05, 1.05).translate(0, 1.67, -0.01);
  const cb = new GeoBuilder();
  appendGeometry(cb, new THREE.SphereGeometry(0.12, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.97, 0.9, 1.03), new THREE.Matrix4().makeTranslation(0, 1.69, 0));
  appendGeometry(cb, new THREE.BoxGeometry(0.2, 0.015, 0.12), new THREE.Matrix4().makeTranslation(0, 1.7, 0.14));
  G.cap = cb.build();
  G.upperArm = new THREE.CapsuleGeometry(0.052, 0.2, 1, 5).translate(0, -0.15, 0);
  const fb = new GeoBuilder();
  appendGeometry(fb, new THREE.CapsuleGeometry(0.044, 0.18, 1, 5), new THREE.Matrix4().makeTranslation(0, -0.13, 0));
  appendGeometry(fb, new THREE.SphereGeometry(0.05, 5, 3).scale(0.8, 1.1, 0.6), new THREE.Matrix4().makeTranslation(0, -0.28, 0));
  G.foreArm = fb.build();
  G.leg = new THREE.CapsuleGeometry(0.072, 0.7, 1, 6).translate(0, -0.42, 0);
  G.shoe = new THREE.BoxGeometry(0.1, 0.07, 0.25).translate(0, -0.85, 0.04);
  return G;
}

export class People {
  constructor(scene, world, quality) {
    this.world = world;
    const rnd = mulberry32(31337);
    const L = ROAD_LINES;
    const rects = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      rects.push(makeLoop([[L[i] + 9, L[j] + 9], [L[i + 1] - 9, L[j] + 9], [L[i + 1] - 9, L[j + 1] - 9], [L[i] + 9, L[j + 1] - 9]], 0));
    }
    const nWalk = quality === 'low' ? 36 : quality === 'med' ? 60 : 90;
    const specs = world.spectatorSpots;
    const n = nWalk + specs.length;
    this.n = n;
    this.list = [];
    for (let i = 0; i < n; i++) {
      const walker = i < nWalk;
      const p = {
        walker, loop: walker ? rects[i % rects.length] : null, dir: rnd() < 0.5 ? 1 : -1,
        s: rnd() * 600, speed: 1.1 + rnd() * 0.6, x: 0, z: 0, y: 0, yaw: 0,
        phase: rnd() * 10, cheer: 0, dodge: 0, dvx: 0, dvz: 0, fall: 0, h: 0.92 + rnd() * 0.16,
        ox: 0, oz: 0, phone: !walker && rnd() < 0.22, cap: rnd() < 0.4, dirty: true,
      };
      if (!walker) {
        const sp = specs[i - nWalk];
        p.x = sp[0]; p.z = sp[1]; p.yaw = sp[2];
        p.y = (sp[3] || 0) + world.heightAt(sp[0], sp[1]);
        if (sp[3]) p.y = sp[3] + terrainH(sp[0], sp[1]);
      }
      this.list.push(p);
    }
    const G = personGeometries();
    const shadows = quality === 'high';
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82 });
    const mk = (g) => {
      const m = new THREE.InstancedMesh(g, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = shadows;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.M = {
      torso: mk(G.torso), pelvis: mk(G.pelvis), head: mk(G.head), hair: mk(G.hair), cap: mk(G.cap),
      uaL: mk(G.upperArm), uaR: mk(G.upperArm), faL: mk(G.foreArm), faR: mk(G.foreArm),
      legL: mk(G.leg), legR: mk(G.leg), shoeL: mk(G.shoe), shoeR: mk(G.shoe),
    };
    const M = this.M;
    const pick = (arr) => _c.set(arr[(rnd() * arr.length) | 0]).clone();
    for (let i = 0; i < n; i++) {
      const shirt = pick(SHIRTS), pants = pick(PANTS), skin = pick(SKIN), hair = pick(HAIR), cap = pick(CAPS), shoe = pick(SHOES);
      M.torso.setColorAt(i, shirt); M.uaL.setColorAt(i, shirt); M.uaR.setColorAt(i, shirt);
      M.pelvis.setColorAt(i, pants); M.legL.setColorAt(i, pants); M.legR.setColorAt(i, pants);
      M.head.setColorAt(i, skin); M.faL.setColorAt(i, skin); M.faR.setColorAt(i, skin);
      M.hair.setColorAt(i, hair); M.cap.setColorAt(i, cap);
      M.shoeL.setColorAt(i, shoe); M.shoeR.setColorAt(i, shoe);
    }
    for (const k in M) M[k].instanceColor.needsUpdate = true;
    this.tmp = [0, 0, 0];
    this.t = 0;
    this.first = true;
    this.update(0.016, null);
    this.first = false;
  }

  cheerNear(x, z, r = 60) {
    for (const p of this.list) {
      if (Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) p.cheer = 2.2 + Math.random();
    }
  }

  update(dt, player, hooks) {
    this.t += dt;
    const P = player;
    const px = P ? P.pos.x : 0, pz = P ? P.pos.z : 0;
    for (let i = 0; i < this.n; i++) {
      const p = this.list[i];
      const far = Math.abs(p.x - px) > 140 || Math.abs(p.z - pz) > 140;
      // далёкие зрители не двигаются — не пересчитываем
      if (!this.first && far && P && (!p.walker || (i + Math.floor(this.t * 10)) % 5 !== 0)) continue;
      const ddt = far ? dt * 5 : dt;
      let moving = false;
      if (p.fall > 0) {
        p.fall -= ddt;
      } else if (p.walker) {
        p.s += p.speed * p.dir * ddt;
        p.loop.at(p.s, this.tmp);
        const tx = this.tmp[0] + p.ox, tz = this.tmp[1] + p.oz;
        p.loop.at(p.s + p.dir, this.tmp);
        p.yaw = Math.atan2(this.tmp[0] - this.tmp[0] * 0 - (tx - p.ox), this.tmp[1] - (tz - p.oz));
        p.x = tx; p.z = tz;
        p.y = 0.12;
        moving = true;
        p.ox = damp(p.ox, 0, 0.5, ddt); p.oz = damp(p.oz, 0, 0.5, ddt);
      }
      // уклонение от байка
      if (P && !far && !P.crashed && p.fall <= 0) {
        const dx = p.x - P.pos.x, dz = p.z - P.pos.z;
        const d2 = dx * dx + dz * dz;
        const sp = P.grounded ? Math.abs(P.speed) : 0;
        if (d2 < 64 && sp > 4 && p.dodge <= 0 && Math.abs(P.pos.y - p.y - 0.6) < 2) {
          const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
          const ahead = -(dx * fx + dz * fz);
          if (ahead < 0) {
            const side = dx * fz - dz * fx > 0 ? 1 : -1;
            p.dvx = fz * side * 4.5; p.dvz = -fx * side * 4.5;
            p.dodge = 0.6;
          }
        }
        if (d2 < 0.7 && sp > 3 && hooks && Math.abs(P.pos.y - p.y - 0.6) < 1.2) {
          p.fall = 3;
          hooks.hitPed(p);
        }
      }
      if (p.dodge > 0) {
        p.dodge -= ddt;
        const ox = p.dvx * ddt, oz = p.dvz * ddt;
        if (p.walker) { p.ox += ox; p.oz += oz; } else { p.x += ox; p.z += oz; }
      }
      if (!p.walker && P && !far && p.fall <= 0) {
        const a = Math.atan2(P.pos.x - p.x, P.pos.z - p.z);
        p.yaw += wrapAngle(a - p.yaw) * clamp(ddt * 2, 0, 1);
      }
      if (p.cheer > 0) p.cheer -= ddt;
      this.pose(i, p, moving);
    }
    for (const k in this.M) this.M[k].instanceMatrix.needsUpdate = true;
  }

  pose(i, p, moving) {
    const M = this.M;
    const t = this.t * 6 * p.speed + p.phase;
    const sw = moving ? Math.sin(t) * 0.5 : 0;
    const cheering = p.cheer > 0;
    const jump = cheering ? Math.max(0, Math.sin(this.t * 9 + p.phase)) * 0.22 : 0;
    const fallen = p.fall > 0;
    const s = p.h;
    _s.set(s, s, s);
    const root = _root;
    const sway = !moving && !cheering ? Math.sin(this.t * 1.3 + p.phase) * 0.04 : 0;
    _q.setFromEuler(_e.set(fallen ? -1.45 : 0, p.yaw, sway, 'YXZ'));
    _p.set(p.x, p.y + jump + (fallen ? 0.2 : 0), p.z);
    root.compose(_p, _q, _s);
    M.torso.setMatrixAt(i, root); M.pelvis.setMatrixAt(i, root); M.head.setMatrixAt(i, root);
    if (p.cap) { M.cap.setMatrixAt(i, root); M.hair.setMatrixAt(i, _zero); }
    else { M.hair.setMatrixAt(i, root); M.cap.setMatrixAt(i, _zero); }
    const local = (out, x, y, rx, rz) => {
      out.makeRotationFromEuler(_e.set(rx, 0, rz));
      out.setPosition(x, y, 0);
      return out.premultiply(root);
    };
    // ноги и обувь
    local(_m, 0.095, 0.88, sw, 0); M.legL.setMatrixAt(i, _m); M.shoeL.setMatrixAt(i, _m);
    local(_m, -0.095, 0.88, -sw, 0); M.legR.setMatrixAt(i, _m); M.shoeR.setMatrixAt(i, _m);
    // руки: плечо -> локоть
    let la, lz, le, ra, rz, re;
    if (cheering) {
      const w = Math.sin(this.t * 12 + p.phase) * 0.3;
      la = 0; lz = Math.PI - 0.35 + w; le = 0.3; ra = 0; rz = -Math.PI + 0.35 - w; re = 0.3;
    } else if (p.phone) {
      la = -sw * 0.7; lz = 0.1; le = -0.3; ra = -1.2; rz = -0.15; re = -1.3; // снимает на телефон
    } else {
      la = -sw * 0.8; lz = 0.12; le = -0.25 - Math.max(0, -sw) * 0.6; ra = sw * 0.8; rz = -0.12; re = -0.25 - Math.max(0, sw) * 0.6;
    }
    local(_ua, 0.22, 1.43, la, lz); M.uaL.setMatrixAt(i, _ua);
    _tmp.makeRotationX(le).setPosition(0, -0.29, 0); _m.multiplyMatrices(_ua, _tmp); M.faL.setMatrixAt(i, _m);
    local(_ua, -0.22, 1.43, ra, rz); M.uaR.setMatrixAt(i, _ua);
    _tmp.makeRotationX(re).setPosition(0, -0.29, 0); _m.multiplyMatrices(_ua, _tmp); M.faR.setMatrixAt(i, _m);
  }
}
