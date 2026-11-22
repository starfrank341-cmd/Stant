// Машины на дорогах, пешеходы и зрители (всё через InstancedMesh — мало draw calls)
import * as THREE from 'three';
import { GeoBuilder, appendGeometry } from './geo.js';
import { ROAD_LINES, terrainH } from './world.js';
import { clamp, damp, mulberry32, wrapAngle } from './util.js';

const CAR_COLORS = ['#d6332a', '#f2f2f2', '#1f4fa3', '#222326', '#9aa3ad', '#e6b422', '#2f7d4a', '#7a1f3d', '#ff7a1a', '#3fa7d6'];

// Геометрия машины: корпус (красится) и детали (стёкла, колёса, фары)
export function carGeometries() {
  const body = new GeoBuilder(), det = new GeoBuilder();
  const W = [1, 1, 1];
  body.box(0, 0.62, 0, 1.8, 0.62, 4.3, W, 4, 0, { bottom: true });
  body.box(0, 0.95, 1.55, 1.74, 0.12, 1.1, W, 4);
  body.box(0, 1.2, -0.25, 1.62, 0.12, 2.1, W, 4); // крыша
  // стойки
  for (const sx of [-0.78, 0.78]) for (const z of [0.82, -1.3]) body.box(sx, 1.05, z, 0.06, 0.5, 0.08, W, 4);
  // стёкла
  const glass = [0.08, 0.12, 0.16];
  det.box(0, 1.04, -0.25, 1.6, 0.36, 2.06, glass, 4, 0, { noTop: true });
  // колёса
  const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14).rotateZ(Math.PI / 2);
  const m = new THREE.Matrix4();
  for (const sx of [-0.82, 0.82]) for (const z of [1.35, -1.35]) {
    m.makeTranslation(sx, 0.34, z);
    appendGeometry(det, wg, m, [0.07, 0.07, 0.08]);
  }
  // фары и фонари
  for (const sx of [-0.6, 0.6]) {
    det.box(sx, 0.7, 2.16, 0.38, 0.14, 0.02, [1, 0.97, 0.85], 1);
    det.box(sx, 0.72, -2.16, 0.38, 0.12, 0.02, [0.85, 0.05, 0.05], 1);
  }
  det.box(0, 0.38, 2.17, 1.7, 0.16, 0.04, [0.12, 0.12, 0.13], 1);
  det.box(0, 0.38, -2.17, 1.7, 0.16, 0.04, [0.12, 0.12, 0.13], 1);
  return [body.build(), det.build()];
}

function makeCarMeshes(count, shadows) {
  const [bg, dg] = carGeometries();
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.45 });
  const detMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.6 });
  const body = new THREE.InstancedMesh(bg, bodyMat, count);
  const det = new THREE.InstancedMesh(dg, detMat, count);
  body.castShadow = det.castShadow = shadows;
  body.receiveShadow = true;
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  det.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { body, det };
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
    const meshes = makeCarMeshes(nCars + parked.length, shadows);
    this.body = meshes.body; this.det = meshes.det;
    scene.add(this.body, this.det);
    for (let i = 0; i < nCars; i++) this.body.setColorAt(i, _c.set(CAR_COLORS[i % CAR_COLORS.length]));
    // припаркованные машины — статичные инстансы
    parked.forEach((p, k) => {
      const i = nCars + k;
      _p.set(p[0], terrainH(p[0], p[1]) + 0.05, p[1]);
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p[2]);
      _m.compose(_p, _q, _s);
      this.body.setMatrixAt(i, _m); this.det.setMatrixAt(i, _m);
      this.body.setColorAt(i, _c.set(CAR_COLORS[p[3] % CAR_COLORS.length]));
    });
    this.body.instanceColor.needsUpdate = true;
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
      this.body.setMatrixAt(car.id, _m);
      this.det.setMatrixAt(car.id, _m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.det.instanceMatrix.needsUpdate = true;
  }
}

// ---------- Люди ----------
const SKIN = ['#f1c7a5', '#d9a07a', '#a86f4c', '#6e4630', '#e8b890'];
const SHIRTS = ['#e63946', '#f1faee', '#457b9d', '#1d3557', '#ffb703', '#2a9d8f', '#8338ec', '#fb5607', '#ff006e', '#3a86ff', '#606c38', '#bc6c25'];
const PANTS = ['#264653', '#1b1b1e', '#3d405b', '#5e503f', '#14213d', '#6c757d'];

export class People {
  constructor(scene, world, quality) {
    this.world = world;
    const rnd = mulberry32(31337);
    const L = ROAD_LINES;
    const rects = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      rects.push(makeLoop([[L[i] + 9, L[j] + 9], [L[i + 1] - 9, L[j] + 9], [L[i + 1] - 9, L[j + 1] - 9], [L[i] + 9, L[j + 1] - 9]], 0));
    }
    const nWalk = quality === 'low' ? 40 : quality === 'med' ? 70 : 100;
    const specs = world.spectatorSpots;
    const n = nWalk + specs.length;
    this.n = n;
    this.list = [];
    for (let i = 0; i < n; i++) {
      const walker = i < nWalk;
      const p = {
        walker, loop: walker ? rects[i % rects.length] : null, dir: rnd() < 0.5 ? 1 : -1,
        s: rnd() * 600, speed: 1.1 + rnd() * 0.6, x: 0, z: 0, y: 0, yaw: 0,
        phase: rnd() * 10, cheer: 0, dodge: 0, dvx: 0, dvz: 0, fall: 0, h: 0.9 + rnd() * 0.2,
        ox: 0, oz: 0,
      };
      if (!walker) {
        const sp = specs[i - nWalk];
        p.x = sp[0]; p.z = sp[1]; p.yaw = sp[2];
        p.y = (sp[3] || 0) + terrainH(sp[0], sp[1]);
        p.baseYaw = sp[2];
      }
      this.list.push(p);
    }
    // Геометрии частей (точка вращения — сверху)
    const torso = new THREE.CapsuleGeometry(0.17, 0.42, 3, 8).scale(1, 1, 0.65).translate(0, 1.15, 0);
    const head = new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.62, 0);
    const hair = new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.64, -0.01);
    const leg = new THREE.CapsuleGeometry(0.075, 0.7, 3, 6).translate(0, -0.42, 0);
    const arm = new THREE.CapsuleGeometry(0.055, 0.5, 3, 6).translate(0, -0.3, 0);
    const mk = (g, colors) => {
      const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = quality !== 'low';
      for (let i = 0; i < n; i++) m.setColorAt(i, _c.set(colors[(rnd() * colors.length) | 0]));
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.mTorso = mk(torso, SHIRTS);
    this.mHead = mk(head, SKIN);
    this.mHair = mk(hair, ['#1b1b1b', '#3b2a1a', '#6b4423', '#c9a66b', '#8b2c1c']);
    this.mLegL = mk(leg, PANTS); this.mLegR = mk(leg, PANTS);
    // одинаковые цвета для пар
    for (let i = 0; i < n; i++) {
      this.mTorso.getColorAt(i, _c); this.list[i].shirt = _c.getHex();
      this.mLegL.getColorAt(i, _c); this.mLegR.setColorAt(i, _c);
    }
    this.mArmL = mk(arm, SHIRTS); this.mArmR = mk(arm, SHIRTS);
    for (let i = 0; i < n; i++) {
      _c.setHex(this.list[i].shirt);
      this.mArmL.setColorAt(i, _c); this.mArmR.setColorAt(i, _c);
    }
    for (const m of [this.mLegR, this.mArmL, this.mArmR]) m.instanceColor.needsUpdate = true;
    this.tmp = [0, 0, 0];
    this.t = 0;
    this.update(0.016, null);
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
      const far = Math.abs(p.x - px) > 160 || Math.abs(p.z - pz) > 160;
      if (far && P && (i + Math.floor(this.t * 10)) % 4 !== 0) continue;
      const ddt = far ? dt * 4 : dt;
      let moving = false;
      if (p.fall > 0) {
        p.fall -= ddt;
      } else if (p.walker) {
        p.s += p.speed * p.dir * ddt;
        p.loop.at(p.s, this.tmp);
        const tx = this.tmp[0] + p.ox, tz = this.tmp[1] + p.oz;
        p.loop.at(p.s + p.dir, this.tmp);
        p.yaw = Math.atan2(this.tmp[0] - tx + p.ox * 0, this.tmp[1] - tz + p.oz * 0);
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
            // уходит в сторону, перпендикулярно движению байка
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
        // зрители смотрят на игрока
        const a = Math.atan2(P.pos.x - p.x, P.pos.z - p.z);
        p.yaw += wrapAngle(a - p.yaw) * clamp(ddt * 2, 0, 1);
      }
      if (p.cheer > 0) p.cheer -= ddt;
      this.pose(i, p, moving);
    }
    for (const m of [this.mTorso, this.mHead, this.mHair, this.mLegL, this.mLegR, this.mArmL, this.mArmR]) m.instanceMatrix.needsUpdate = true;
  }

  pose(i, p, moving) {
    const t = this.t * 6 * p.speed + p.phase;
    const sw = moving ? Math.sin(t) * 0.55 : 0;
    const jump = p.cheer > 0 ? Math.max(0, Math.sin(this.t * 9 + p.phase)) * 0.25 : 0;
    const fallen = p.fall > 0;
    const s = p.h;
    _s.set(s, s, s);
    // корень
    const root = _root;
    _q.setFromEuler(_e.set(fallen ? -1.45 : 0, p.yaw, 0, 'YXZ'));
    _p.set(p.x, p.y + jump + (fallen ? 0.2 : 0), p.z);
    root.compose(_p, _q, _s);
    this.mTorso.setMatrixAt(i, root);
    this.mHead.setMatrixAt(i, root);
    this.mHair.setMatrixAt(i, root);
    const limb = (mesh, x, y, rx, rz) => {
      _m.makeRotationFromEuler(_e.set(rx, 0, rz));
      _m.setPosition(x, y, 0);
      _m.premultiply(root);
      mesh.setMatrixAt(i, _m);
    };
    limb(this.mLegL, 0.1, 0.86, sw, 0);
    limb(this.mLegR, -0.1, 0.86, -sw, 0);
    if (p.cheer > 0) {
      const w = Math.sin(this.t * 12 + p.phase) * 0.3;
      limb(this.mArmL, 0.23, 1.42, 0, Math.PI - 0.3 + w);
      limb(this.mArmR, -0.23, 1.42, 0, -Math.PI + 0.3 - w);
    } else {
      limb(this.mArmL, 0.23, 1.42, -sw * 0.8, 0.08);
      limb(this.mArmR, -0.23, 1.42, sw * 0.8, -0.08);
    }
  }
}
