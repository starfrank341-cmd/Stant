// Деревья, фонари, монеты — инстансинг
import * as THREE from 'three';
import { GeoBuilder, appendGeometry } from './geo.js';
import { mulberry32 } from './util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

function jitter(geo, amt, seed) {
  const r = mulberry32(seed);
  const p = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
    const j = map.get(k);
    p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Props {
  constructor(scene, world, T, quality) {
    const shadows = quality !== 'low';
    const rnd = mulberry32(555);
    // --- Деревья: ствол + крона (две разные формы) ---
    const trees = world.treeSpots.filter((t) => t[3] !== 'palm');
    const palms = world.treeSpots.filter((t) => t[3] === 'palm');
    const trunkG = new THREE.CylinderGeometry(0.18, 0.32, 3.2, 6).translate(0, 1.6, 0);
    const crownB = new GeoBuilder();
    const ico = jitter(new THREE.IcosahedronGeometry(1.9, 1), 0.5, 3);
    _m.makeTranslation(0, 4.6, 0); appendGeometry(crownB, ico, _m);
    _m.compose(_p.set(0.9, 3.9, 0.4), _q.identity(), _s.set(0.65, 0.65, 0.65)); appendGeometry(crownB, ico, _m);
    _m.compose(_p.set(-0.7, 4.0, -0.6), _q.identity(), _s.set(0.7, 0.6, 0.7)); appendGeometry(crownB, ico, _m);
    _m.compose(_p.set(0, 5.9, 0), _q.identity(), _s.set(0.6, 0.6, 0.6)); appendGeometry(crownB, ico, _m);
    const crownG = crownB.build();
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
    this.trunks = new THREE.InstancedMesh(trunkG, barkMat, trees.length + palms.length);
    this.crowns = new THREE.InstancedMesh(crownG, leafMat, trees.length);
    const leafCols = ['#4f8a3a', '#5f9a3f', '#3f7a35', '#6fa644', '#7a9a3a', '#c4a23a', '#d9772b'];
    trees.forEach((t, i) => {
      const s = 0.8 + rnd() * 0.6;
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * 6.28);
      _m.compose(_p.set(t[0], t[2], t[1]), _q, _s.set(s, s * (0.9 + rnd() * 0.3), s));
      this.trunks.setMatrixAt(i, _m);
      this.crowns.setMatrixAt(i, _m);
      const k = rnd();
      this.crowns.setColorAt(i, _c.set(leafCols[k < 0.9 ? (k * 5) | 0 : 5 + ((k * 20) | 0) % 2]));
    });
    // пальмы
    const palmB = new GeoBuilder();
    const leaf = new THREE.BoxGeometry(0.5, 0.05, 2.6).translate(0, 0, 1.3);
    for (let i = 0; i < 7; i++) {
      _q.setFromEuler(new THREE.Euler(0.45, (i / 7) * Math.PI * 2, 0, 'YXZ'));
      _m.compose(_p.set(0, 6.2, 0), _q, _s.set(1, 1, 1));
      appendGeometry(palmB, leaf, _m);
    }
    this.palmLeaves = new THREE.InstancedMesh(palmB.build(), new THREE.MeshStandardMaterial({ color: 0x4f9a3a, roughness: 0.8, side: THREE.DoubleSide }), Math.max(1, palms.length));
    palms.forEach((t, k) => {
      const i = trees.length + k;
      const y = world.heightAt(t[0], t[1]);
      _q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.15, rnd() * 6, (rnd() - 0.5) * 0.15));
      _m.compose(_p.set(t[0], y, t[1]), _q, _s.set(0.8, 2.0, 0.8));
      this.trunks.setMatrixAt(i, _m);
      _m.compose(_p.set(t[0], y, t[1]), _q, _s.set(1, 1, 1));
      this.palmLeaves.setMatrixAt(k, _m);
    });
    this.palmLeaves.count = palms.length;
    for (const m of [this.trunks, this.crowns, this.palmLeaves]) {
      m.castShadow = shadows; m.receiveShadow = true;
      scene.add(m);
    }
    // --- Фонари ---
    const lb = new GeoBuilder();
    _m.makeTranslation(0, 3.5, 0); appendGeometry(lb, new THREE.CylinderGeometry(0.08, 0.13, 7, 6), _m, [0.35, 0.37, 0.4]);
    _m.makeTranslation(0, 7, 0.7); appendGeometry(lb, new THREE.BoxGeometry(0.1, 0.1, 1.5), _m, [0.35, 0.37, 0.4]);
    _m.makeTranslation(0, 6.9, 1.4); appendGeometry(lb, new THREE.BoxGeometry(0.35, 0.12, 0.6), _m, [0.3, 0.3, 0.32]);
    _m.makeTranslation(0, 6.83, 1.4); appendGeometry(lb, new THREE.BoxGeometry(0.28, 0.02, 0.5), _m, [1.0, 0.95, 0.8]);
    this.lamps = new THREE.InstancedMesh(lb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }), world.lamps.length);
    world.lamps.forEach((l, i) => {
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, l[2]);
      _m.compose(_p.set(l[0], 0.1, l[1]), _q, _s.set(1, 1, 1));
      this.lamps.setMatrixAt(i, _m);
    });
    this.lamps.castShadow = shadows;
    scene.add(this.lamps);
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
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a + c.i * 0.3);
      _m.compose(_p.set(c.x, c.y + Math.sin(a + c.i) * 0.12, c.z), _q, _s.set(1, 1, 1));
      this.coinMesh.setMatrixAt(c.i, _m);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }
}
