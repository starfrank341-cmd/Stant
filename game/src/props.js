// Деревья, пальмы, кусты, фонари, ограждения, конусы, вышки ЛЭП, монеты — всё инстансингом
import * as THREE from 'three';
import { GeoBuilder, appendGeometry } from './geo.js';
import { mulberry32 } from './util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// Отрезок-цилиндр между двумя точками
function seg(b, A, B, r1, r2, color = [1, 1, 1], sides = 7) {
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r2, r1, len, sides, 1, true);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize());
  appendGeometry(b, g, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), color);
}

// Карточки листвы вокруг центра; нормали направлены наружу — мягкое освещение кроны
function foliage(b, cx, cy, cz, R, n, size, rnd) {
  const quad = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(1 - u * u);
    const k = 0.45 + rnd() * 0.55;
    const off = new THREE.Vector3(Math.cos(a) * rr * R * k, u * R * 0.75 * k, Math.sin(a) * rr * R * k);
    const pos = new THREE.Vector3(cx, cy, cz).add(off);
    const sc = size * (0.75 + rnd() * 0.5);
    const shade = 0.65 + (off.y / R) * 0.25 + k * 0.15;
    for (let j = 0; j < 2; j++) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 1.2, a + j * Math.PI / 2, (rnd() - 0.5) * 0.6));
      const start = b.pos.length;
      appendGeometry(b, quad, new THREE.Matrix4().compose(pos, q, new THREE.Vector3(sc, sc, sc)), [shade, shade, shade]);
      // нормали = от центра кроны
      const nrm = off.clone().normalize();
      for (let v = start; v < b.nor.length; v += 3) { b.nor[v] = nrm.x; b.nor[v + 1] = nrm.y * 0.8 + 0.2; b.nor[v + 2] = nrm.z; }
    }
  }
}

function treeGeometries(variant, q) {
  const rnd = mulberry32(700 + variant);
  const trunk = new GeoBuilder(), crown = new GeoBuilder();
  const H = variant === 0 ? 3.4 : 2.6;
  const top = new THREE.Vector3((rnd() - 0.5) * 0.4, H, (rnd() - 0.5) * 0.4);
  seg(trunk, new THREE.Vector3(0, -0.2, 0), top, 0.3, 0.2);
  const cards = q === 'low' ? 10 : 18;
  const centers = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rnd();
    const end = top.clone().add(new THREE.Vector3(Math.cos(a) * 1.3, 1.2 + rnd() * 0.8, Math.sin(a) * 1.3));
    seg(trunk, top, end, 0.15, 0.07);
    centers.push(end);
  }
  centers.push(top.clone().add(new THREE.Vector3(0, 2.2, 0)));
  for (const c of centers) foliage(crown, c.x, c.y, c.z, variant === 0 ? 1.7 : 1.4, Math.round(cards / 3), 2.2, rnd);
  return [trunk.build(), crown.build()];
}

function palmGeometries(variant) {
  const rnd = mulberry32(800 + variant);
  const trunk = new GeoBuilder(), crown = new GeoBuilder();
  const H = 7 + variant * 1.5;
  const bend = 0.9 + rnd() * 0.8;
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3(bend * t * t, H * t, 0));
  }
  for (let i = 0; i < 8; i++) seg(trunk, pts[i], pts[i + 1], 0.26 - i * 0.012, 0.25 - (i + 1) * 0.012, [1, 1, 1], 8);
  const top = pts[8];
  // кокосы
  for (let i = 0; i < 4; i++) {
    const g = new THREE.SphereGeometry(0.13, 5, 3);
    const a = i * 1.6;
    appendGeometry(trunk, g, new THREE.Matrix4().makeTranslation(top.x + Math.cos(a) * 0.22, top.y - 0.2, Math.sin(a) * 0.22), [0.5, 0.38, 0.2]);
  }
  // листья: изогнутые полосы
  const nF = 11;
  for (let f = 0; f < nF; f++) {
    const a = (f / nF) * Math.PI * 2 + rnd() * 0.3;
    const up = f % 4 === 0 ? 0.5 : 0;
    const L = 3.6 + rnd() * 0.8;
    const steps = 7;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const P = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const d = t * L;
      const y = (0.9 + up) * t * 2 - (1.6 - up) * t * t * 2.2;
      P.push(top.clone().addScaledVector(dir, d).add(new THREE.Vector3(0, y * 0.9, 0)));
    }
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const w0 = 0.65 * Math.sin(Math.PI * Math.min(1, t0 * 1.1 + 0.05)), w1 = 0.65 * Math.sin(Math.PI * Math.min(1, t1 * 1.1 + 0.05));
      const fold = 0.12;
      const A = P[i].clone().addScaledVector(side, -w0).add(new THREE.Vector3(0, -fold, 0));
      const B = P[i].clone().addScaledVector(side, w0).add(new THREE.Vector3(0, -fold, 0));
      const C = P[i + 1].clone().addScaledVector(side, w1).add(new THREE.Vector3(0, -fold, 0));
      const D = P[i + 1].clone().addScaledVector(side, -w1).add(new THREE.Vector3(0, -fold, 0));
      const sh = 0.85 + rnd() * 0.25;
      crown.quad(A.toArray(), B.toArray(), C.toArray(), D.toArray(), [t0, 0], [t0, 1], [t1, 1], [t1, 0], [sh, sh, sh], [0, 1, 0]);
    }
  }
  return [trunk.build(), crown.build(), top];
}

function lampGeometry() {
  const lb = new GeoBuilder();
  const grey = [0.3, 0.32, 0.35];
  _m.makeTranslation(0, 3.5, 0); appendGeometry(lb, new THREE.CylinderGeometry(0.07, 0.12, 7, 8), _m, grey);
  // изогнутая консоль
  const pts = [[0, 6.8, 0], [0, 7.2, 0.3], [0, 7.3, 0.8], [0, 7.25, 1.4]].map((p) => new THREE.Vector3(...p));
  for (let i = 0; i < 3; i++) seg(lb, pts[i], pts[i + 1], 0.05, 0.05, grey, 6);
  _m.makeTranslation(0, 7.15, 1.5); appendGeometry(lb, new THREE.BoxGeometry(0.34, 0.12, 0.62), _m, [0.25, 0.25, 0.27]);
  _m.makeTranslation(0, 7.08, 1.5); appendGeometry(lb, new THREE.BoxGeometry(0.26, 0.02, 0.5), _m, [1.0, 0.92, 0.75]);
  _m.makeTranslation(0, 0.25, 0); appendGeometry(lb, new THREE.CylinderGeometry(0.18, 0.2, 0.5, 8), _m, grey);
  return lb.build();
}

function barrierGeometry() {
  const b = new GeoBuilder();
  const c = [0.75, 0.77, 0.8];
  const W = 2.3;
  for (const y of [0.08, 1.05]) {
    _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    _m.compose(_p.set(0, y, 0), _q, _s.set(1, 1, 1));
    appendGeometry(b, new THREE.CylinderGeometry(0.025, 0.025, W, 6), _m, c);
  }
  for (const x of [-W / 2, W / 2]) {
    _m.makeTranslation(x, 0.56, 0); appendGeometry(b, new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), _m, c);
    _m.makeTranslation(x, 0.02, 0); appendGeometry(b, new THREE.BoxGeometry(0.06, 0.04, 0.7), _m, c);
  }
  for (let i = 1; i < 12; i++) {
    _m.makeTranslation(-W / 2 + (i * W) / 12, 0.56, 0);
    appendGeometry(b, new THREE.CylinderGeometry(0.012, 0.012, 0.96, 4), _m, c);
  }
  return b.build();
}

function coneGeometry() {
  const b = new GeoBuilder();
  const o = [1, 0.35, 0.05], w = [0.95, 0.95, 0.95];
  _m.makeTranslation(0, 0.02, 0); appendGeometry(b, new THREE.BoxGeometry(0.42, 0.04, 0.42), _m, [0.1, 0.1, 0.1]);
  _m.makeTranslation(0, 0.18, 0); appendGeometry(b, new THREE.CylinderGeometry(0.12, 0.16, 0.28, 12), _m, o);
  _m.makeTranslation(0, 0.39, 0); appendGeometry(b, new THREE.CylinderGeometry(0.085, 0.12, 0.14, 12), _m, w);
  _m.makeTranslation(0, 0.56, 0); appendGeometry(b, new THREE.CylinderGeometry(0.03, 0.085, 0.2, 12), _m, o);
  return b.build();
}

// Решётчатая вышка ЛЭП
function towerGeometry() {
  const b = new GeoBuilder();
  const c = [0.42, 0.44, 0.47];
  const H = 26;
  const w = (y) => 2.4 * (1 - y / H) + 0.45;
  const corner = (i, y) => { const s = w(y); return new THREE.Vector3((i & 1 ? 1 : -1) * s, y, (i & 2 ? 1 : -1) * s); };
  const levels = [0, 4, 8, 12, 16, 20, 23, 26];
  for (let l = 0; l < levels.length - 1; l++) {
    const y0 = levels[l], y1 = levels[l + 1];
    for (let i = 0; i < 4; i++) seg(b, corner(i, y0), corner(i, y1), 0.07, 0.06, c, 4);
    const order = [0, 1, 3, 2];
    for (let k = 0; k < 4; k++) {
      const a = order[k], bb = order[(k + 1) % 4];
      seg(b, corner(a, y0), corner(bb, y1), 0.03, 0.03, c, 3);
      seg(b, corner(a, y1), corner(bb, y1), 0.03, 0.03, c, 3);
    }
  }
  for (const y of [18, 23]) {
    seg(b, new THREE.Vector3(-5, y, 0), new THREE.Vector3(5, y, 0), 0.06, 0.06, c, 4);
    for (const x of [-5, 5]) {
      seg(b, new THREE.Vector3(x, y, 0), new THREE.Vector3(x * 0.2, y + 1.5, 0), 0.03, 0.03, c, 3);
      _m.makeTranslation(x, y - 0.6, 0); appendGeometry(b, new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), _m, [0.85, 0.85, 0.8]);
    }
  }
  return b.build();
}

export class Props {
  constructor(scene, world, T, quality) {
    const shadows = quality !== 'low';
    const rnd = mulberry32(555);
    const add = (m, cast = shadows) => { m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
    // --- Лиственные деревья (2 варианта) ---
    const trees = world.treeSpots.filter((t) => t[3] !== 'palm');
    const palms = world.treeSpots.filter((t) => t[3] === 'palm');
    const barkMat = new THREE.MeshStandardMaterial({ map: T.bark, roughness: 1, vertexColors: true });
    const leafMat = new THREE.MeshStandardMaterial({ map: T.leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
    const tv = [0, 1].map((v) => treeGeometries(v, quality));
    const groups = [[], []];
    trees.forEach((t, i) => groups[i % 2].push(t));
    const leafCols = ['#8fbf5a', '#a6c860', '#7fb04e', '#b5c75a', '#d6b04a', '#e08a3a', '#9ccf68'];
    groups.forEach((list, v) => {
      if (!list.length) return;
      const tr = new THREE.InstancedMesh(tv[v][0], barkMat, list.length);
      const cr = new THREE.InstancedMesh(tv[v][1], leafMat, list.length);
      list.forEach((t, i) => {
        const s = 0.8 + rnd() * 0.55;
        _q.setFromAxisAngle(UP, rnd() * 6.28);
        _m.compose(_p.set(t[0], t[2], t[1]), _q, _s.set(s, s * (0.9 + rnd() * 0.3), s));
        tr.setMatrixAt(i, _m); cr.setMatrixAt(i, _m);
        const k = rnd();
        cr.setColorAt(i, _c.set(leafCols[k < 0.88 ? (k * 4.5) | 0 : 4 + (((k * 30) | 0) % 3)]));
      });
      add(tr); add(cr);
    });
    // --- Пальмы (2 варианта) ---
    const palmTrunkMat = new THREE.MeshStandardMaterial({ map: T.palmBark, roughness: 1, vertexColors: true });
    const frondMat = new THREE.MeshStandardMaterial({ map: T.frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true });
    const pv = [0, 1].map((v) => palmGeometries(v));
    const pg = [[], []];
    palms.forEach((t, i) => pg[i % 2].push(t));
    pg.forEach((list, v) => {
      if (!list.length) return;
      const tr = new THREE.InstancedMesh(pv[v][0], palmTrunkMat, list.length);
      const cr = new THREE.InstancedMesh(pv[v][1], frondMat, list.length);
      list.forEach((t, i) => {
        const y = t[2] !== undefined && t[2] !== 0 ? t[2] : world.heightAt(t[0], t[1]);
        const s = 0.85 + rnd() * 0.35;
        _q.setFromAxisAngle(UP, rnd() * 6.28);
        _m.compose(_p.set(t[0], y - 0.1, t[1]), _q, _s.set(s, s, s));
        tr.setMatrixAt(i, _m); cr.setMatrixAt(i, _m);
        cr.setColorAt(i, _c.setRGB(0.85 + rnd() * 0.25, 0.9 + rnd() * 0.15, 0.7 + rnd() * 0.2));
      });
      add(tr); add(cr);
    });
    // --- Кусты ---
    if (world.bushSpots.length) {
      const bb = new GeoBuilder();
      foliage(bb, 0, 0.6, 0, 0.9, quality === 'low' ? 4 : 7, 1.4, mulberry32(77));
      const bushes = new THREE.InstancedMesh(bb.build(), leafMat, world.bushSpots.length);
      world.bushSpots.forEach((t, i) => {
        const s = 0.7 + rnd() * 0.6;
        _q.setFromAxisAngle(UP, rnd() * 6.28);
        _m.compose(_p.set(t[0], world.heightAt(t[0], t[1]), t[1]), _q, _s.set(s, s * 0.8, s));
        bushes.setMatrixAt(i, _m);
        bushes.setColorAt(i, _c.set(leafCols[(rnd() * 3) | 0]));
      });
      add(bushes, false);
    }
    // --- Фонари ---
    this.lamps = new THREE.InstancedMesh(lampGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 }), world.lamps.length);
    world.lamps.forEach((l, i) => {
      _q.setFromAxisAngle(UP, l[2]);
      _m.compose(_p.set(l[0], 0.1, l[1]), _q, _s.set(1, 1, 1));
      this.lamps.setMatrixAt(i, _m);
    });
    add(this.lamps);
    // --- Ограждения для зрителей ---
    const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.8 });
    if (world.barriers.length) {
      const bm = new THREE.InstancedMesh(barrierGeometry(), metal, world.barriers.length);
      world.barriers.forEach((b, i) => {
        _q.setFromAxisAngle(UP, b[2]);
        _m.compose(_p.set(b[0], world.heightAt(b[0], b[1]) - 0.02, b[1]), _q, _s.set(1, 1, 1));
        bm.setMatrixAt(i, _m);
      });
      add(bm);
    }
    // --- Конусы ---
    if (world.cones.length) {
      const cm = new THREE.InstancedMesh(coneGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), world.cones.length);
      world.cones.forEach((c, i) => {
        _q.setFromAxisAngle(UP, rnd() * 6);
        _m.compose(_p.set(c[0], world.heightAt(c[0], c[1]), c[1]), _q, _s.set(1, 1, 1));
        cm.setMatrixAt(i, _m);
      });
      add(cm);
    }
    // --- Вышки ЛЭП и провода ---
    if (world.towers.length) {
      const tw = new THREE.InstancedMesh(towerGeometry(), metal, world.towers.length);
      const wires = new GeoBuilder();
      world.towers.forEach((t, i) => {
        const y = world.heightAt(t[0], t[1]);
        t[3] = y;
        _q.setFromAxisAngle(UP, t[2]);
        _m.compose(_p.set(t[0], y, t[1]), _q, _s.set(1, 1, 1));
        tw.setMatrixAt(i, _m);
      });
      for (let i = 0; i < world.towers.length - 1; i++) {
        const a = world.towers[i], b = world.towers[i + 1];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 160) continue;
        for (const [ox, oy] of [[-5, 17.4], [5, 17.4], [-5, 22.4], [5, 22.4]]) {
          const ca = Math.cos(a[2]), sa = Math.sin(a[2]), cb = Math.cos(b[2]), sb = Math.sin(b[2]);
          const A = new THREE.Vector3(a[0] + ox * ca, a[3] + oy, a[1] - ox * sa);
          const B = new THREE.Vector3(b[0] + ox * cb, b[3] + oy, b[1] - ox * sb);
          const N = 10;
          for (let k = 0; k < N; k++) {
            const t0 = k / N, t1 = (k + 1) / N;
            const P0 = A.clone().lerp(B, t0); P0.y -= Math.sin(Math.PI * t0) * 4;
            const P1 = A.clone().lerp(B, t1); P1.y -= Math.sin(Math.PI * t1) * 4;
            seg(wires, P0, P1, 0.025, 0.025, [0.15, 0.15, 0.15], 3);
          }
        }
      }
      add(tw, false);
      if (wires.count) add(new THREE.Mesh(wires.build(), new THREE.MeshBasicMaterial({ vertexColors: true })), false);
    }
    // --- Монеты ---
    const coinG = new THREE.CylinderGeometry(0.45, 0.45, 0.09, 20).rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 1, roughness: 0.22, emissive: 0x6a4400, emissiveIntensity: 0.6 });
    this.coins = world.coinsPos.map((c, i) => ({ x: c[0], y: c[1], z: c[2], val: c[3], taken: 0, i }));
    this.coinMesh = new THREE.InstancedMesh(coinG, coinMat, this.coins.length);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.frustumCulled = false;
    scene.add(this.coinMesh);
    this.t = 0;
    this.updateCoins(0, null);
  }

  // Вращение и сбор монет
  updateCoins(dt, pos, onCollect) {
    this.t += dt;
    const a = this.t * 2.5;
    for (const c of this.coins) {
      if (c.taken > 0) {
        c.taken -= dt;
        if (c.taken > 0) { _m.makeScale(0, 0, 0); this.coinMesh.setMatrixAt(c.i, _m); continue; }
      }
      if (pos) {
        const dx = pos.x - c.x, dy = pos.y - c.y, dz = pos.z - c.z;
        if (dx * dx + dy * dy + dz * dz < 3.2) {
          c.taken = 120;
          onCollect(c);
          continue;
        }
      }
      _q.setFromAxisAngle(UP, a + c.i * 0.3);
      _m.compose(_p.set(c.x, c.y + Math.sin(a + c.i) * 0.12, c.z), _q, _s.set(1, 1, 1));
      this.coinMesh.setMatrixAt(c.i, _m);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }
}
