// Открытый мир: рельеф, дороги, районы, рампы и физика поверхности
import * as THREE from 'three';
import { GeoBuilder, appendGeometry } from './geo.js';
import { clamp, smoothstep, fbm2, mulberry32, lerp } from './util.js';

export const SURF = { ASPHALT: 0, CONCRETE: 1, GRASS: 2, DIRT: 3, SAND: 4, WOOD: 5, METAL: 6 };
export const WATER_LEVEL = -1.6;
export const ROAD_LINES = [-300, -100, 100, 300];
const ROAD_HW = 7;
const CELL = 16, GRID_N = 72, GRID_OFF = 576; // сетка для быстрого поиска объектов

function rectMask(x, z, x0, x1, z0, z1, fall) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0, fall, d);
}

// Высота рельефа (аналитическая — физика и меш используют одно и то же)
export function terrainH(x, z) {
  let h = 0;
  // Холмы на северо-западе (кроме коридора мега-рампы)
  const mh = rectMask(x, z, -276, -124, -186, -124, 18) * smoothstep(-214, -192, z);
  if (mh > 0) h += mh * Math.max(0, fbm2(x / 46, z / 46, 3, 11) * 30 - 10);
  // Небольшие неровности на мотокроссе
  const mx = rectMask(x, z, -80, 80, -280, -120, 10);
  if (mx > 0) h += mx * (fbm2(x / 28, z / 28, 2, 13) - 0.5) * 1.6;
  // Озеро с островом
  const ex = x / 76, ez = (z - 200) / 46;
  const d = Math.sqrt(ex * ex + ez * ez);
  if (d < 1.05) {
    h -= 5 * (1 - smoothstep(0.75, 1.0, d));
    const di = Math.hypot(x, z - 200);
    h += 6.2 * (1 - smoothstep(9, 17, di));
  }
  // Горы по краю карты
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 335) {
    const t = smoothstep(335, 480, e);
    h += t * t * (55 + 55 * fbm2(x / 70, z / 70, 3, 17));
  }
  return h;
}

// Веса текстур рельефа: [трава, земля, песок]
function terrainSplat(x, z) {
  let dirt = Math.max(rectMask(x, z, -86, 86, -286, -114, 6), rectMask(x, z, 114, 286, -286, -114, 6) * 0.9);
  const ex = x / 76, ez = (z - 200) / 46;
  const d = Math.sqrt(ex * ex + ez * ez);
  let sand = 1 - smoothstep(1.0, 1.25, d);
  const di = Math.hypot(x, z - 200);
  sand = Math.max(sand, 1 - smoothstep(16, 20, di));
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 360) dirt = Math.max(dirt, smoothstep(360, 440, e) * (0.5 + 0.5 * fbm2(x / 30, z / 30, 2, 5)));
  const nn = fbm2(x / 25, z / 25, 2, 3);
  dirt = Math.max(dirt, smoothstep(0.68, 0.8, nn) * 0.6);
  sand = clamp(sand, 0, 1); dirt = clamp(dirt * (1 - sand), 0, 1);
  return [clamp(1 - dirt - sand, 0, 1), dirt, sand];
}

function terrainSurf(x, z) {
  // дороги
  for (const L of ROAD_LINES) {
    if (Math.abs(x - L) < ROAD_HW && Math.abs(z) < 307) return SURF.ASPHALT;
    if (Math.abs(z - L) < ROAD_HW && Math.abs(x) < 307) return SURF.ASPHALT;
  }
  const s = terrainSplat(x, z);
  if (s[1] > 0.5) return SURF.DIRT;
  if (s[2] > 0.5) return SURF.SAND;
  return SURF.GRASS;
}

export class World {
  constructor(scene, T, quality) {
    this.scene = scene;
    this.T = T;
    this.q = quality;
    this.shapes = [];
    this.grid = new Array(GRID_N * GRID_N);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    this.dynamic = []; // движущиеся коробки (машины)
    this.pads = []; // площадки (поверхность и вид на миникарте)
    this.spots = [];
    this.coinsPos = [];
    this.treeSpots = [];
    this.spectatorSpots = [];
    this.parked = []; // припаркованные машины
    this.lamps = [];
    this.rnd = mulberry32(12345);
    this.builders = {};
    this.mats = {};
    this._q = { h: 0, surf: 0, shape: null };
    this.waterMeshes = [];
    this.build();
  }

  B(key) {
    return this.builders[key] || (this.builders[key] = new GeoBuilder());
  }

  // ---------- Физика поверхности ----------
  _cellIndex(x, z) {
    const cx = Math.floor((x + GRID_OFF) / CELL), cz = Math.floor((z + GRID_OFF) / CELL);
    if (cx < 0 || cz < 0 || cx >= GRID_N || cz >= GRID_N) return -1;
    return cz * GRID_N + cx;
  }

  addShape(s) {
    this.shapes.push(s);
    const [x0, z0, x1, z1] = s.bounds;
    const cx0 = Math.floor((x0 + GRID_OFF) / CELL), cx1 = Math.floor((x1 + GRID_OFF) / CELL);
    const cz0 = Math.floor((z0 + GRID_OFF) / CELL), cz1 = Math.floor((z1 + GRID_OFF) / CELL);
    for (let cz = Math.max(0, cz0); cz <= Math.min(GRID_N - 1, cz1); cz++)
      for (let cx = Math.max(0, cx0); cx <= Math.min(GRID_N - 1, cx1); cx++)
        this.grid[cz * GRID_N + cx].push(s);
    return s;
  }

  // Высота и тип поверхности в точке
  groundAt(x, z, out = this._q) {
    let h = terrainH(x, z);
    let surf = -1;
    let shape = null;
    const idx = this._cellIndex(x, z);
    if (idx >= 0) {
      const list = this.grid[idx];
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const hh = s.heightAt(x, z);
        if (hh > h) { h = hh; surf = s.surf; shape = s; }
      }
    }
    for (let i = 0; i < this.dynamic.length; i++) {
      const s = this.dynamic[i];
      if (!s.active) continue;
      const hh = s.heightAt(x, z);
      if (hh > h) { h = hh; surf = SURF.METAL; shape = s; }
    }
    if (surf < 0) {
      surf = -1;
      for (let i = 0; i < this.pads.length; i++) {
        const p = this.pads[i];
        if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) { surf = p.surf; break; }
      }
      if (surf < 0) surf = terrainSurf(x, z);
    }
    out.h = h; out.surf = surf; out.shape = shape;
    return out;
  }

  heightAt(x, z) { return this.groundAt(x, z).h; }

  isWater(x, z) {
    return terrainH(x, z) < WATER_LEVEL && Math.hypot(x / 76, (z - 200) / 46) < 1.05;
  }

  // ---------- Примитивы ----------
  // Призма: профиль [[u,h],...] вдоль направления yaw, ширина w, slope — скос боков (0 = вертикальные)
  prism(x, z, yaw, prof, w, opts = {}) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    const baseY = opts.baseY !== undefined ? opts.baseY : terrainH(x, z);
    const hw = w / 2;
    const slope = opts.slope || 0;
    const us = prof.map((p) => p[0]), hs = prof.map((p) => p[1]);
    const u0 = us[0], u1 = us[us.length - 1];
    const maxH = Math.max(...hs);
    const ext = hw + (slope ? maxH / slope : 0);
    // границы
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (const uu of [u0, u1]) for (const vv of [-ext, ext]) {
      const wx = x + fx * uu + sx * vv, wz = z + fz * uu + sz * vv;
      bx0 = Math.min(bx0, wx); bx1 = Math.max(bx1, wx); bz0 = Math.min(bz0, wz); bz1 = Math.max(bz1, wz);
    }
    const n = us.length;
    const s = {
      type: 'prism', x, z, yaw, baseY, surf: opts.surf ?? SURF.WOOD, top: baseY + maxH,
      bounds: [bx0, bz0, bx1, bz1], name: opts.name || '',
      heightAt(px, pz) {
        const dx = px - x, dz = pz - z;
        const u = dx * fx + dz * fz;
        if (u < u0 || u > u1) return -Infinity;
        const v = Math.abs(dx * sx + dz * sz);
        if (v > ext) return -Infinity;
        let h = hs[n - 1];
        for (let i = 0; i < n - 1; i++) {
          const a = us[i], b = us[i + 1];
          if (u >= a && u <= b) {
            if (b - a < 1e-6) { h = Math.max(hs[i], hs[i + 1]); }
            else h = hs[i] + (hs[i + 1] - hs[i]) * ((u - a) / (b - a));
            break;
          }
        }
        if (v > hw) {
          if (!slope) return -Infinity;
          h -= (v - hw) * slope;
          if (h <= 0) return -Infinity;
        }
        return baseY + h;
      },
    };
    this.addShape(s);
    if (!opts.invisible) this._prismMesh(s, prof, fx, fz, sx, sz, hw, slope, opts);
    return s;
  }

  _prismMesh(s, prof, fx, fz, sx, sz, hw, slope, opts) {
    const top = this.B(opts.mat || 'wood');
    const side = this.B(opts.sideMat || opts.mat || 'wood');
    const col = opts.color || [1, 1, 1];
    const uvS = opts.uvS || 4;
    const by = s.baseY;
    const bottom = opts.bottom !== undefined ? opts.bottom : -1.5;
    const W = (u, v, h) => [s.x + fx * u + sx * v, by + h, s.z + fz * u + sz * v];
    let acc = 0;
    for (let i = 0; i < prof.length - 1; i++) {
      const [ua, ha] = prof[i], [ub, hb] = prof[i + 1];
      const len = Math.hypot(ub - ua, hb - ha);
      const vA = acc / uvS, vB = (acc + len) / uvS;
      acc += len;
      // верх
      const up = [-(hb - ha) * fx, ub - ua + 1e-4, -(hb - ha) * fz];
      if (len > 1e-4) top.quad(W(ua, -hw, ha), W(ua, hw, ha), W(ub, hw, hb), W(ub, -hw, hb),
        [0, vA], [hw * 2 / uvS, vA], [hw * 2 / uvS, vB], [0, vB], col, ub - ua < 1e-4 ? [-fx, 0, -fz] : up);
      // бока
      for (const sg of [-1, 1]) {
        const hint = [sx * sg, 0, sz * sg];
        if (slope) {
          if (ha < 0.01 && hb < 0.01) continue;
          const oa = hw + ha / slope, ob = hw + hb / slope;
          side.quad(W(ua, sg * hw, ha), W(ub, sg * hw, hb), W(ub, sg * ob, -0.3), W(ua, sg * oa, -0.3),
            [ua / uvS, ha / uvS], [ub / uvS, hb / uvS], [ub / uvS, 0], [ua / uvS, 0], col, [sx * sg, 1, sz * sg]);
        } else {
          if (ua === ub) continue;
          side.quad(W(ua, sg * hw, bottom), W(ub, sg * hw, bottom), W(ub, sg * hw, hb), W(ua, sg * hw, ha),
            [ua / uvS, bottom / uvS], [ub / uvS, bottom / uvS], [ub / uvS, hb / uvS], [ua / uvS, ha / uvS], col, hint);
        }
      }
    }
    // торцы
    const caps = [[prof[0], -1], [prof[prof.length - 1], 1]];
    for (const [[u, h], sg] of caps) {
      if (h < 0.02) continue;
      const o = slope ? hw + h / slope : hw;
      const b = slope ? -0.3 : bottom;
      side.quad(W(u, -o, b), W(u, o, b), W(u, hw, h), W(u, -hw, h),
        [0, 0], [o * 2 / uvS, 0], [(o + hw) / uvS, h / uvS], [(o - hw) / uvS, h / uvS], col, [fx * sg, 0, fz * sg]);
    }
  }

  // Коробка (здание, контейнер) — тоже призма с плоским профилем
  boxShape(x, z, yaw, lx, wz, h, opts = {}) {
    return this.prism(x, z, yaw, [[-lx / 2, h], [lx / 2, h]], wz, opts);
  }

  // Цилиндр-препятствие (стволы, столбы)
  cyl(x, z, r, h) {
    const y = terrainH(x, z);
    const r2 = r * r;
    return this.addShape({
      type: 'cyl', x, z, surf: SURF.METAL, top: y + h, bounds: [x - r, z - r, x + r, z + r],
      heightAt(px, pz) {
        const dx = px - x, dz = pz - z;
        return dx * dx + dz * dz < r2 ? y + h : -Infinity;
      },
    });
  }

  // Профиль кикера: плавный трамплин длиной L и высотой H
  static kicker(L, H, u0 = 0, steps = 6, pow = 1.8) {
    const p = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      p.push([u0 + t * L, H * Math.pow(t, pow)]);
    }
    return p;
  }
  // Приземление: сверху H вниз до 0 за L (выпуклый склон)
  static landing(L, H, u0 = 0, steps = 6) {
    const p = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const k = 1 - t;
      p.push([u0 + t * L, H * (k * k * (3 - 2 * k)) * 0.15 + H * 0.85 * Math.pow(k, 1.3)]);
    }
    return p;
  }
  // Квотерпайп радиуса R с площадкой
  static quarter(R, deg = 78, deck = 3, steps = 8) {
    const p = [];
    const m = (deg * Math.PI) / 180;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * m;
      p.push([R * Math.sin(a), R * (1 - Math.cos(a))]);
    }
    const last = p[p.length - 1];
    p.push([last[0] + 0.01, last[1] + 0.25]);
    p.push([last[0] + deck, last[1] + 0.25]);
    return p;
  }
  // Лестница: из высоты H вниз n ступеней
  static stairs(H, n, tread) {
    const p = [];
    const rise = H / n;
    for (let i = 0; i < n; i++) {
      const h = H - i * rise;
      p.push([i * tread, h]);
      p.push([(i + 1) * tread, h]);
    }
    p.push([n * tread, 0.0]);
    return p;
  }

  // ---------- Монеты ----------
  coinArc(x, z, yaw, u0, u1, y0, y1, peak, n) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const u = lerp(u0, u1, t);
      const y = lerp(y0, y1, t) + peak * 4 * t * (1 - t);
      this.coinsPos.push([x + fx * u, y + 1.0, z + fz * u, 10]);
    }
  }
  coinLine(x0, z0, x1, z1, n, y = null, val = 10) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = lerp(x0, x1, t), z = lerp(z0, z1, t);
      this.coinsPos.push([x, (y ?? this.heightAt(x, z)) + 1.0, z, val]);
    }
  }

  addSpot(name, x, z, yaw, icon, desc) {
    this.spots.push({ name, x, z, yaw, icon, desc });
  }

  // ---------- Сборка мира ----------
  build() {
    this.buildTerrain();
    this.buildRoads();
    this.buildPark();
    this.buildMX();
    this.buildMega();
    this.buildConstruction();
    this.buildDowntown();
    this.buildPlaza();
    this.buildRooftops();
    this.buildLake();
    this.buildParking();
    this.buildDecor();
    this.finishMeshes();
  }

  buildTerrain() {
    const N = this.q === 'low' ? 110 : this.q === 'med' ? 160 : 200;
    const size = 1000;
    const verts = (N + 1) * (N + 1);
    const pos = new Float32Array(verts * 3);
    const splat = new Float32Array(verts * 3);
    let k = 0;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = -size / 2 + (i / N) * size, z = -size / 2 + (j / N) * size;
        pos[k * 3] = x; pos[k * 3 + 1] = terrainH(x, z); pos[k * 3 + 2] = z;
        const s = terrainSplat(x, z);
        splat[k * 3] = s[0]; splat[k * 3 + 1] = s[1]; splat[k * 3 + 2] = s[2];
        k++;
      }
    }
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const T = this.T;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: T.grass };
      sh.uniforms.tDirt = { value: T.dirt };
      sh.uniforms.tSand = { value: T.sand };
      sh.uniforms.tMacro = { value: T.macro };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec2 vTUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvTUv = position.xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tDirt, tSand, tMacro;\nvarying vec3 vSplat;\nvarying vec2 vTUv;')
        .replace('#include <map_fragment>', `
          vec2 tuv = vTUv / 5.0;
          vec3 cg = texture2D(tGrass, tuv).rgb;
          vec3 cd = texture2D(tDirt, tuv * 0.8).rgb;
          vec3 cs = texture2D(tSand, tuv).rgb;
          float macro = texture2D(tMacro, vTUv / 110.0).r * 1.3;
          vec3 tc = (cg * vSplat.x + cd * vSplat.y + cs * vSplat.z) * macro;
          diffuseColor.rgb *= tc;
        `);
    };
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  buildRoads() {
    const road = this.B('road'), asp = this.B('asphalt'), side = this.B('sidewalk');
    const L = ROAD_LINES;
    const y = 0.06;
    const ext = 307;
    // Полосы дорог
    for (const X of L) {
      // вдоль z
      road.quad([X - ROAD_HW, y, -ext], [X + ROAD_HW, y, -ext], [X + ROAD_HW, y, ext], [X - ROAD_HW, y, ext],
        [0, -ext / 12], [1, -ext / 12], [1, ext / 12], [0, ext / 12], [1, 1, 1], [0, 1, 0]);
      // вдоль x (u поперёк = z)
      road.quad([-ext, y, X - ROAD_HW], [-ext, y, X + ROAD_HW], [ext, y, X + ROAD_HW], [ext, y, X - ROAD_HW],
        [0, -ext / 12], [1, -ext / 12], [1, ext / 12], [0, ext / 12], [1, 1, 1], [0, 1, 0]);
    }
    // Перекрёстки
    for (const X of L) for (const Z of L) {
      asp.flatRect(X - ROAD_HW, Z - ROAD_HW, X + ROAD_HW, Z + ROAD_HW, y + 0.03, 12);
      // зебра
      const zb = this.B('white');
      for (let k = -3; k <= 3; k++) {
        for (const [dx, dz, rot] of [[0, -ROAD_HW - 2, 0], [0, ROAD_HW + 2, 0], [-ROAD_HW - 2, 0, 1], [ROAD_HW + 2, 0, 1]]) {
          const cx = X + dx + (rot ? 0 : k * 1.8), cz = Z + dz + (rot ? k * 1.8 : 0);
          if (Math.abs(cx) > 306 || Math.abs(cz) > 306) continue;
          const hx = rot ? 1.5 : 0.45, hz = rot ? 0.45 : 1.5;
          zb.flatRect(cx - hx, cz - hz, cx + hx, cz + hz, y + 0.035, 4);
        }
      }
    }
    // Тротуары между перекрёстками
    const sy = 0.12;
    for (const X of L) {
      for (let i = 0; i < L.length - 1; i++) {
        const a = L[i] + 11, b = L[i + 1] - 11;
        for (const sg of [-1, 1]) {
          const x0 = X + sg * 7, x1 = X + sg * 11;
          side.flatRect(Math.min(x0, x1), a, Math.max(x0, x1), b, sy, 3);
          side.flatRect(a, Math.min(X + sg * 7, X + sg * 11), b, Math.max(X + sg * 7, X + sg * 11), sy, 3);
          // бордюр
          this.B('concrete').box(X + sg * 7.1, sy / 2, (a + b) / 2, 0.25, sy + 0.04, b - a, [0.9, 0.9, 0.9], 2);
          this.B('concrete').box((a + b) / 2, sy / 2, X + sg * 7.1, b - a, sy + 0.04, 0.25, [0.9, 0.9, 0.9], 2);
          // фонари
          for (let t = a + 10; t < b - 5; t += 36) {
            this.lamps.push([X + sg * 10.2, t, sg > 0 ? -Math.PI / 2 : Math.PI / 2]);
            this.lamps.push([t, X + sg * 10.2, sg > 0 ? Math.PI : 0]);
          }
        }
      }
    }
    for (const l of this.lamps) this.cyl(l[0], l[1], 0.22, 7);
    // монеты вдоль дорог
    for (const X of [-100, 100]) {
      this.coinLine(X + 3.5, -280, X + 3.5, -120, 8);
      this.coinLine(-280, X - 3.5, -120, X - 3.5, 8);
    }
  }

  // Стант-парк в центре
  buildPark() {
    this.pads.push({ x0: -88, x1: 88, z0: -88, z1: 88, surf: SURF.CONCRETE, color: '#b9b2a6', name: 'Стант-парк' });
    this.B('concrete').flatRect(-88, -88, 88, 88, 0.03, 6);
    const W = World;
    const conc = { mat: 'concrete', surf: SURF.CONCRETE };
    const wood = { mat: 'wood', sideMat: 'graffiti', surf: SURF.WOOD };
    // Фанбокс крестом
    this.prism(0, 0, 0, [[-12, 0], [-5, 2.2], [5, 2.2], [12, 0]], 10, conc);
    this.prism(0, 0, Math.PI / 2, [[-12, 0], [-5, 2.2], [5, 2.2], [12, 0]], 10, conc);
    this.coinArc(0, 0, 0, -9, 9, 1.5, 1.5, 2.5, 5);
    // Стол: кикер -> стол -> приземление (малый)
    this.prism(-50, -40, 0, W.kicker(10, 3, -10), 6, wood);
    this.prism(-50, -40, 0, [[0, 3], [12, 3]], 6, { ...wood, sideMat: 'wood' });
    this.prism(-50, -40, 0, W.landing(12, 3, 12), 8, wood);
    this.coinArc(-50, -40, 0, 1, 13, 3.5, 3.5, 4, 6);
    // Стол (средний)
    this.prism(50, -40, 0, W.kicker(12, 4, -12), 7, wood);
    this.prism(50, -40, 0, [[0, 4], [16, 4]], 7, { ...wood, sideMat: 'wood' });
    this.prism(50, -40, 0, W.landing(16, 4, 16), 10, wood);
    this.coinArc(50, -40, 0, 2, 17, 4.5, 4.5, 6, 7);
    // Биг-эйр
    this.prism(62, 52, -Math.PI / 2, W.kicker(13, 5, -13, 7), 10, wood);
    this.prism(62, 52, -Math.PI / 2, W.landing(22, 6, 26), 14, wood);
    this.coinArc(62, 52, -Math.PI / 2, 2, 25, 5.5, 6.2, 9, 9);
    // Квотерпайпы
    this.prism(0, -79, Math.PI, W.quarter(5.5, 78, 3), 60, conc);
    this.prism(-79, 10, -Math.PI / 2, W.quarter(5.5, 78, 3), 50, conc);
    // Пирамида
    this.prism(-45, 15, 0, [[-8, 0], [0, 3], [8, 0]], 4, { ...conc, slope: 0.9 });
    this.prism(-45, 15, Math.PI / 2, [[-8, 0], [0, 3], [8, 0]], 4, { ...conc, slope: 0.9 });
    // Небольшие кикеры
    this.prism(-62, 55, Math.PI / 4, W.kicker(4, 1.3, -4), 4, wood);
    this.prism(-25, 60, 0, W.kicker(4, 1.2, -4), 4, wood);
    this.prism(25, 20, Math.PI / 2, W.kicker(5, 1.6, -5), 5, wood);
    this.prism(-20, -15, -Math.PI / 2, W.kicker(5, 1.6, -5), 5, wood);
    // Ледж
    this.boxShape(-20, 32, 0, 14, 2, 0.6, conc);
    this.boxShape(28, -8, Math.PI / 2, 12, 2, 0.6, conc);
    // Трибуны
    this.prism(0, 80, 0, [[0, 0.6], [1.6, 0.6], [1.6, 1.2], [3.2, 1.2], [3.2, 1.8], [4.8, 1.8], [4.8, 2.4], [7, 2.4]], 44, conc);
    for (let i = 0; i < 26; i++) this.spectatorSpots.push([-20 + i * 1.6 + this.rnd() * 0.6, 80.8 + (i % 4) * 1.6, Math.PI, 0.6 + (i % 4) * 0.6]);
    this.addSpot('Стант-парк', 0, 40, Math.PI, '🛹', 'Фанбокс, кикеры, биг-эйр, квотерпайпы');
  }

  // Мотокросс на севере
  buildMX() {
    const dirt = { mat: 'dirt', surf: SURF.DIRT, slope: 1.1, uvS: 5 };
    const W = World;
    // Ряд столов
    for (const x of [-62, -28, 6, 40]) {
      this.prism(x, -265, Math.PI / 2, [[-11, 0], [-6, 1.5], [-3, 2.5], [3, 2.5], [7, 1.3], [11, 0]], 7, dirt);
      this.coinArc(x, -265, Math.PI / 2, -3, 3, 2.6, 2.6, 2, 3);
    }
    // Дабл-джампы
    for (const x of [68, 22, -24]) {
      this.prism(x, -225, -Math.PI / 2, W.kicker(7, 2.6, 0, 5, 1.5), 7, dirt);
      this.prism(x, -225, -Math.PI / 2, [[20, 2.8], [23, 2.2], [30, 0]], 8, dirt);
      this.coinArc(x, -225, -Math.PI / 2, 8, 19, 3, 3, 3, 4);
    }
    // Волны
    for (let i = 0; i < 12; i++) this.prism(-70 + i * 3.8, -185, Math.PI / 2, [[0, 0], [1.7, 0.75], [3.4, 0]], 6, dirt);
    // Большой прыжок
    this.prism(72, -145, -Math.PI / 2, W.kicker(11, 4.2, -11, 6, 1.7), 10, dirt);
    this.prism(72, -145, -Math.PI / 2, [[24, 5], [28, 4.2], [36, 2], [44, 0]], 14, dirt);
    this.coinArc(72, -145, -Math.PI / 2, 1, 23, 4.4, 5.2, 7, 8);
    // Тюки сена
    const hay = { mat: 'hay', surf: SURF.DIRT };
    for (let i = 0; i < 10; i++) {
      this.boxShape(-82 + (i % 2) * 164, -280 + i * 16, 0, 1.2, 2.4, 1.0, hay);
    }
    for (let i = 0; i < 12; i++) this.spectatorSpots.push([-50 + i * 5, -245, 0, 0]);
    this.addSpot('Мотокросс', -84, -265, Math.PI / 2, '🏁', 'Столы, дабл-джампы, волны и большой прыжок');
  }

  // Мега-рампа на северо-западе
  buildMega() {
    const wood = { mat: 'wood', sideMat: 'graffiti', surf: SURF.WOOD, uvS: 4 };
    const W = World;
    // Площадка-башня
    this.boxShape(-282, -238, 0, 46, 20, 24, { mat: 'metalWall', surf: SURF.METAL, color: [0.75, 0.78, 0.82] });
    // Подъём
    this.prism(-120, -251, -Math.PI / 2, [[0, 0], [152, 24]], 8, { mat: 'wood', sideMat: 'metalWall', surf: SURF.WOOD, color: [1, 1, 1] });
    // Спуск + разгон + трамплин
    const prof = [[0, 24], [4, 22.6], [8, 19.8], [14, 14.3], [20, 8.8], [26, 4.3], [32, 1.5], [38, 0.25], [44, 0], [60, 0], [63, 0.6], [66, 1.6], [69, 3.0], [72, 5.0]];
    this.prism(-272, -224, Math.PI / 2, prof, 12, wood);
    // Приземление
    this.prism(-272, -224, Math.PI / 2, [[92, 5.6], [98, 4.7], [106, 3.1], [116, 1.4], [126, 0.3], [134, 0]], 16, wood);
    // Квотерпайп в конце
    this.prism(-128, -224, Math.PI / 2, W.quarter(6, 76, 2.5, 9), 16, { mat: 'concrete', surf: SURF.CONCRETE });
    this.coinArc(-272, -224, Math.PI / 2, 74, 94, 6, 6.2, 8, 9);
    this.coinLine(-268, -251, -150, -251, 10, null);
    for (let i = 0; i < 14; i++) this.spectatorSpots.push([-170 + i * 3, -210, Math.PI, 0]);
    for (let i = 0; i < 10; i++) this.spectatorSpots.push([-170 + i * 3, -238, 0, 0]);
    this.addSpot('Мега-рампа (старт)', -277, -224, Math.PI / 2, '🚀', 'Высота 24 м! Разгон, огромный прыжок и квотерпайп');
    this.addSpot('Холмы', -200, -160, 0, '⛰️', 'Холмистая трава для полётов');
    this.megaTop = { x: -277, z: -224, y: 24 };
  }

  // Стройка / контейнеры на северо-востоке
  buildConstruction() {
    const cols = [[0.75, 0.2, 0.15], [0.15, 0.35, 0.7], [0.2, 0.55, 0.3], [0.9, 0.5, 0.1], [0.55, 0.55, 0.58], [0.85, 0.75, 0.2]];
    const cont = (x, z, yaw, h, ci) => this.boxShape(x, z, yaw, 12.2, 2.44, h, { mat: 'metal', surf: SURF.METAL, color: cols[ci % cols.length], uvS: 6.1 });
    const wood = { mat: 'wood', surf: SURF.WOOD };
    // Ряд контейнеров с разрывами
    for (let i = 0; i < 5; i++) cont(140 + i * 18.5, -255, Math.PI / 2, 2.6, i);
    this.prism(133.9, -255, Math.PI / 2, [[-9, 0], [0, 2.6]], 2.6, wood);
    this.coinLine(140, -255, 214, -255, 10, 2.6);
    // Двухъярусная стопка с рампой
    cont(160, -220, Math.PI / 2, 5.2, 1); cont(172.2, -220, Math.PI / 2, 5.2, 2);
    this.prism(154, -220, Math.PI / 2, [[-16, 0], [0, 5.2]], 2.6, wood);
    this.prism(178.3, -220, Math.PI / 2, World.kicker(3, 0.9, -3, 3, 1.5), 2.4, { ...wood, baseY: 5.2 });
    this.coinArc(178.3, -220, Math.PI / 2, 1, 22, 6.5, 2, 4, 6);
    // Стена контейнеров
    for (let i = 0; i < 4; i++) cont(246 + i * 2.5, -262, 0, 2.6, i + 2);
    for (let i = 0; i < 3; i++) cont(246 + i * 2.5, -200, 0, 2.6, i);
    this.prism(249.75, -268.1, 0, [[-8, 0], [0, 2.6]], 10, wood);
    // Кучи песка
    const sand = { mat: 'sandpile', surf: SURF.SAND, slope: 0.8, uvS: 5 };
    this.prism(200, -170, 0.4, [[-9, 0], [-2, 3.8], [2, 3.8], [9, 0]], 3, sand);
    this.prism(150, -150, -0.8, [[-7, 0], [0, 3], [7, 0]], 2, sand);
    this.prism(240, -140, 1.2, [[-10, 0], [-1, 4.5], [1, 4.5], [10, 0]], 4, sand);
    this.prism(270, -160, 0, [[-6, 0], [0, 2.4], [6, 0]], 2, sand);
    // Трубы (декор + препятствие)
    for (let i = 0; i < 4; i++) {
      const x = 130 + i * 3.2, z = -185;
      this.boxShape(x, z, 0, 6, 2.6, 2.6, { invisible: true, surf: SURF.CONCRETE });
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 1.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1));
      appendGeometry(this.B('concrete'), new THREE.CylinderGeometry(1.3, 1.3, 6, 14, 1, true), m, [0.85, 0.85, 0.85]);
      appendGeometry(this.B('concrete'), new THREE.CylinderGeometry(1.05, 1.05, 6.01, 14, 1, true).scale(-1, 1, 1), m, [0.4, 0.4, 0.4]);
    }
    // Кран (декор)
    const cm = this.B('crane');
    for (let i = 0; i < 12; i++) cm.box(225, i * 3 + 1.5, -235, 2.2, 3, 2.2, [1, 0.75, 0.1], 3);
    cm.box(232, 37, -235, 34, 1.6, 1.6, [1, 0.75, 0.1], 3);
    cm.box(213, 36.5, -235, 4, 3, 3, [0.4, 0.4, 0.45], 3);
    this.cyl(225, -235, 1.6, 40);
    this.addSpot('Стройка', 125, -255, Math.PI / 2, '🏗️', 'Контейнеры, разрывы и кучи песка');
  }

  // Здания по периметру прямоугольника
  cityRing(x0, x1, z0, z1, hMin, hMax, depth, seed) {
    const rnd = mulberry32(seed);
    const sides = [
      [x0, z0, x1, z0, 0], [x1, z0, x1, z1, 1], [x1, z1, x0, z1, 2], [x0, z1, x0, z0, 3],
    ];
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      // внутрь: поворот на 90°
      const nx = -dz, nz = dx;
      let t = depth + 2;
      while (t < len - depth - 6) {
        const w = 24 + rnd() * 16;
        if (t + w > len - depth) break;
        const c = t + w / 2;
        const px = ax + dx * c + nx * (depth / 2), pz = az + dz * c + nz * (depth / 2);
        const h = Math.round((hMin + rnd() * (hMax - hMin)) / 3.5) * 3.5;
        const axisX = Math.abs(dx) > 0.5;
        this.building(px, pz, axisX ? w : depth, axisX ? depth : w, h, (rnd() * 3) | 0, rnd);
        t += w + 6 + rnd() * 8;
      }
    }
  }

  building(x, z, sx, sz, h, type, rnd) {
    const tints = [[1, 1, 1], [0.95, 0.92, 0.85], [0.88, 0.92, 1], [1, 0.9, 0.82], [0.9, 0.95, 0.9]];
    const col = tints[(rnd() * tints.length) | 0];
    const fb = this.B('facade' + type);
    const y0 = terrainH(x, z);
    fb.box(x, y0 + h / 2, z, sx, h, sz, col, 8, 0, { noTop: true, vScale: 7 });
    this.B('roof').box(x, y0 + h + 0.25, z, sx + 0.6, 0.5, sz + 0.6, [1, 1, 1], 6, 0, {});
    // кондиционеры/надстройки
    const n = 1 + ((rnd() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const w = 2 + rnd() * 3;
      this.B('roof').box(x + (rnd() - 0.5) * (sx - 6), y0 + h + 0.5 + 0.75, z + (rnd() - 0.5) * (sz - 6), w, 1.5, w * 0.8, [0.8, 0.8, 0.82], 3);
    }
    this.addShape({
      type: 'box', x, z, surf: SURF.CONCRETE, top: y0 + h + 0.5,
      bounds: [x - sx / 2 - 0.3, z - sz / 2 - 0.3, x + sx / 2 + 0.3, z + sz / 2 + 0.3],
      heightAt(px, pz) {
        return Math.abs(px - x) <= sx / 2 + 0.3 && Math.abs(pz - z) <= sz / 2 + 0.3 ? y0 + h + 0.5 : -Infinity;
      },
    });
  }

  // Деловой центр на западе
  buildDowntown() {
    this.cityRing(-288, -112, -88, 88, 24, 70, 26, 501);
    this.pads.push({ x0: -230, x1: -170, z0: -30, z1: 30, surf: SURF.CONCRETE, color: '#c9c2b6', name: 'Центр' });
    this.B('sidewalk').flatRect(-232, -32, -168, 32, 0.04, 3);
    const conc = { mat: 'concrete', surf: SURF.CONCRETE };
    // приподнятая площадь с лестницей и пандусами
    this.boxShape(-200, 0, 0, 30, 30, 1.8, conc);
    this.prism(-200, -15, Math.PI, World.stairs(1.8, 6, 0.5), 12, conc);
    this.prism(-200, 15, 0, [[0, 1.8], [12, 0]], 14, conc);
    this.prism(-185, 0, Math.PI / 2, [[0, 1.8], [2, 2.3]], 10, { mat: 'wood', surf: SURF.WOOD });
    // фонтан
    this.boxShape(-200, 0, 0, 8, 8, 2.6, { mat: 'concrete', surf: SURF.CONCRETE, color: [0.95, 0.95, 1] });
    const wm = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24).rotateX(-Math.PI / 2), null);
    wm.position.set(-200, 2.62, 0);
    this.waterMeshes.push(wm);
    // клумбы
    for (const [x, z] of [[-224, -24], [-176, -24], [-224, 24], [-176, 24]]) {
      this.boxShape(x, z, 0, 5, 5, 0.6, { mat: 'concrete', surf: SURF.CONCRETE });
      this.treeSpots.push([x, z, 0.6]);
    }
    this.coinArc(-185, 0, Math.PI / 2, 2, 14, 2.3, 0, 2.5, 5);
    this.addSpot('Центр города', -200, 46, Math.PI, '🏙️', 'Небоскрёбы и площадь с фонтаном');
  }

  // Площадь со ступенями на востоке
  buildPlaza() {
    this.cityRing(112, 288, -88, 88, 12, 32, 22, 777);
    this.pads.push({ x0: 140, x1: 260, z0: -60, z1: 60, surf: SURF.CONCRETE, color: '#c9c2b6', name: 'Площадь' });
    this.B('concrete').flatRect(140, -60, 260, 60, 0.04, 6);
    const conc = { mat: 'concrete', surf: SURF.CONCRETE };
    // Платформа + 10 ступеней
    this.boxShape(200, -30, 0, 24, 12, 3, conc);
    this.prism(200, -48, 0, [[0, 0], [12, 3]], 10, conc);
    this.prism(200, -24, 0, World.stairs(3, 10, 0.45), 14, conc);
    this.coinArc(200, -24, 0, 0, 12, 3.2, 0.2, 2, 6);
    // Банки
    this.prism(160, 20, Math.PI / 2, [[0, 0], [4, 2.2], [6, 2.2]], 12, conc);
    this.prism(240, 20, -Math.PI / 2, [[0, 0], [4, 2.2], [6, 2.2]], 12, conc);
    // Кикер на банк
    this.prism(180, 45, Math.PI / 2, World.kicker(6, 2, -6), 6, { mat: 'wood', sideMat: 'graffiti', surf: SURF.WOOD });
    this.prism(180, 45, Math.PI / 2, World.landing(10, 2.4, 14), 8, { mat: 'wood', sideMat: 'graffiti', surf: SURF.WOOD });
    this.coinArc(180, 45, Math.PI / 2, 1, 14, 2.2, 2.5, 3, 5);
    // Ледж-манульники
    this.boxShape(220, 0, 0, 3, 16, 0.5, conc);
    this.boxShape(175, -5, 0, 3, 12, 0.5, conc);
    for (let i = 0; i < 10; i++) this.spectatorSpots.push([186 + i * 3, -16, 0, 0]);
    this.addSpot('Площадь', 200, -55, 0, '🏛️', '10 ступеней, банки, ледж');
  }

  // Крыши на юго-западе
  buildRooftops() {
    const rnd = mulberry32(909);
    // Маршрут по крышам
    const roofB = (x, z, sx, sz, h, type) => this.building(x, z, sx, sz, h, type, rnd);
    roofB(-250, 150, 30, 30, 9, 2);
    roofB(-250, 190, 30, 24, 8, 1);
    roofB(-250, 236, 30, 26, 7, 0);
    // Пандус на первую крышу
    this.prism(-195, 150, -Math.PI / 2, [[0, 0], [40, 9.5]], 8, { mat: 'wood', sideMat: 'metalWall', surf: SURF.WOOD });
    // Кикер на второй крыше
    this.prism(-250, 196, 0, World.kicker(6, 1.4, -6, 4, 1.6), 6, { mat: 'wood', surf: SURF.WOOD, baseY: 8.5 });
    this.coinArc(-250, 160, 0, 6, 17, 9.5, 8.5, 3, 4);
    this.coinArc(-250, 196, 0, 1, 25, 10, 7.5, 4, 6);
    // Остальные дома
    this.cityRing(-288, -112, 112, 288, 10, 26, 20, 313);
    for (let i = 0; i < 40; i++) {
      const x = -200 + rnd() * 70, z = 175 + rnd() * 90;
      this.treeSpots.push([x, z, 0]);
    }
    this.addSpot('Крыши', -190, 150, -Math.PI / 2, '🏠', 'Заезд на крыши и прыжки между домами');
  }

  // Озеро на юге
  buildLake() {
    const wood = { mat: 'wood', sideMat: 'graffiti', surf: SURF.WOOD };
    this.prism(0, 150, 0, World.kicker(11, 3.4, -6, 6, 1.6), 6, wood);
    this.prism(0, 165, 0, [[0, 2.9], [5, 2.6], [14, 1.8], [26, 1.2]], 9, { ...wood, baseY: terrainH(0, 192) - 1.2, bottom: -6 });
    this.prism(0, 210, 0, World.kicker(10, 3.0, -5, 6, 1.6), 6, { ...wood, baseY: terrainH(0, 207) });
    this.prism(0, 227, 0, World.landing(22, 2.9, 0), 9, { ...wood, baseY: 0, bottom: -6 });
    this.coinArc(0, 150, 0, 6, 21, 3.6, 3.5, 5, 7);
    this.coinArc(0, 210, 0, 6, 22, 3.3, 3.2, 5, 7);
    // Пирс
    this.boxShape(-56, 200, Math.PI / 2, 30, 4, 1.0, { mat: 'wood', surf: SURF.WOOD, baseY: WATER_LEVEL + 0.2, bottom: -4 });
    this.prism(-41, 200, Math.PI / 2, World.kicker(4, 1.2, 0, 3), 4, { mat: 'wood', surf: SURF.WOOD, baseY: WATER_LEVEL + 1.2 });
    const wm = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), null);
    wm.scale.set(76, 1, 46);
    wm.position.set(0, WATER_LEVEL, 200);
    this.waterMeshes.push(wm);
    for (let i = 0; i < 30; i++) {
      const a = this.rnd() * Math.PI * 2;
      const r = 1.12 + this.rnd() * 0.2;
      this.treeSpots.push([Math.cos(a) * 76 * r, 200 + Math.sin(a) * 46 * r, 0, 'palm']);
    }
    for (let i = 0; i < 12; i++) this.spectatorSpots.push([20 + i * 2.5, 142, Math.PI / 2, 0]);
    this.addSpot('Озеро', 0, 112, 0, '🌊', 'Прыжки через воду на остров и обратно');
  }

  // Парковка на юго-востоке: прыжки через машины
  buildParking() {
    this.pads.push({ x0: 116, x1: 284, z0: 116, z1: 284, surf: SURF.ASPHALT, color: '#55575c', name: 'Парковка' });
    this.B('asphalt').flatRect(116, 116, 284, 284, 0.03, 12);
    const wh = this.B('white');
    for (const rz of [143, 185, 220, 255]) {
      for (let x = 125; x <= 275; x += 3) wh.flatRect(x - 0.06, rz - 3, x + 0.06, rz + 3, 0.045, 4);
    }
    const rnd = mulberry32(4242);
    for (const rz of [143, 185, 220, 255]) {
      for (let x = 126.5; x < 275; x += 3) {
        if (rnd() < 0.25 && ![150, 210, 255].some((k) => Math.abs(x - k) < 3)) continue;
        this.parked.push([x, rz + (rnd() - 0.5) * 0.3, (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.06, (rnd() * 1000) | 0]);
      }
    }
    for (const p of this.parked) {
      this.boxShape(p[0], p[1], p[2], 4.4, 1.8, 1.45, { invisible: true, surf: SURF.METAL, name: 'car' }).isCar = true;
    }
    const wood = { mat: 'wood', sideMat: 'graffiti', surf: SURF.WOOD };
    // Трамплины через ряды машин (вдоль +z)
    for (const [x, z0] of [[150, 135], [210, 168], [255, 135]]) {
      this.prism(x, z0, 0, World.kicker(9, 3.2, -9, 6, 1.6), 6, wood);
      this.coinArc(x, z0, 0, 2, 22, 3.2, 1, 6, 7);
    }
    this.prism(210, 168, 0, World.landing(12, 3, 27), 8, wood);
    for (let i = 0; i < 10; i++) this.spectatorSpots.push([120, 150 + i * 6, Math.PI / 2, 0]);
    this.addSpot('Парковка', 150, 112, 0, '🚗', 'Прыгай через ряды машин');
  }

  buildDecor() {
    const rnd = this.rnd;
    // Деревья по свободной траве
    const free = (x, z) => {
      for (const L of ROAD_LINES) {
        if (Math.abs(x - L) < 14 && Math.abs(z) < 315) return false;
        if (Math.abs(z - L) < 14 && Math.abs(x) < 315) return false;
      }
      const inZone = (x0, x1, z0, z1) => x > x0 && x < x1 && z > z0 && z < z1;
      if (inZone(-90, 90, -90, 90)) return false; // парк
      if (inZone(-90, 90, -290, -110)) return false; // MX
      if (inZone(-295, -105, -265, -205)) return false; // мега
      if (inZone(105, 295, -295, -105)) return false; // стройка
      if (inZone(-295, -105, -95, 95)) return false; // центр
      if (inZone(105, 295, -95, 95)) return false; // площадь
      if (inZone(-295, -170, 105, 295)) return false; // крыши
      if (inZone(105, 295, 105, 295)) return false; // парковка
      if (Math.hypot(x / 90, (z - 200) / 58) < 1) return false; // озеро
      if (Math.max(Math.abs(x), Math.abs(z)) > 450) return false;
      return true;
    };
    const target = this.q === 'low' ? 260 : this.q === 'med' ? 420 : 600;
    let tries = 0;
    while (this.treeSpots.length < target && tries++ < 20000) {
      const x = (rnd() - 0.5) * 900, z = (rnd() - 0.5) * 900;
      if (!free(x, z)) continue;
      // деревья группами
      if (fbm2(x / 60, z / 60, 2, 99) < 0.42 && rnd() < 0.8) continue;
      this.treeSpots.push([x, z, terrainH(x, z) - 0.1]);
    }
    for (const t of this.treeSpots) {
      if (t[2] === 0) t[2] = terrainH(t[0], t[1]) - 0.1;
      this.cyl(t[0], t[1], 0.4, 8);
    }
    // монеты на холмах
    for (let i = 0; i < 24; i++) {
      const x = -260 + rnd() * 130, z = -180 + rnd() * 50;
      this.coinsPos.push([x, terrainH(x, z) + 1.2, z, 10]);
    }
    // Баннеры
    const bn = this.B('banner');
    const banners = [[0, 86.5, 0], [-86.5, -40, Math.PI / 2], [86.5, 20, -Math.PI / 2], [-200, -212, 0], [0, -290, 0], [200, -290, 0], [26, 136, 0]];
    for (const [x, z, yaw] of banners) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const y = terrainH(x, z);
      const w = 12, h = 3, y0 = y + 2.5;
      const P = (u, v) => [x + c * u, y0 + v, z - s * u];
      bn.quad(P(-w / 2, 0), P(w / 2, 0), P(w / 2, h), P(-w / 2, h), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], [s, 0, c]);
      bn.quad(P(w / 2, 0), P(-w / 2, 0), P(-w / 2, h), P(w / 2, h), [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], [-s, 0, -c]);
      for (const u of [-w / 2, w / 2]) this.B('metalWall').box(x + c * u, y + 2.75, z - s * u, 0.25, 5.5, 0.25, [0.6, 0.6, 0.65], 2);
    }
  }

  finishMeshes() {
    const T = this.T;
    const q = this.q;
    const shadows = q !== 'low';
    const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
    const M = this.mats;
    M.wood = std({ map: T.wood, roughness: 0.8 });
    M.graffiti = std({ map: T.graffiti, roughness: 0.75 });
    M.concrete = std({ map: T.concrete, roughness: 0.9 });
    M.dirt = std({ map: T.dirt, roughness: 1 });
    M.sandpile = std({ map: T.sand, roughness: 1 });
    M.metal = std({ map: T.metal, roughness: 0.55, metalness: 0.35 });
    M.metalWall = std({ map: T.metal, roughness: 0.5, metalness: 0.4 });
    M.facade0 = std({ map: T.facades[0], roughness: 0.35, metalness: 0.2 });
    M.facade1 = std({ map: T.facades[1], roughness: 0.8 });
    M.facade2 = std({ map: T.facades[2], roughness: 0.7 });
    M.roof = std({ map: T.roof, roughness: 0.95 });
    M.road = std({ map: T.road, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    M.asphalt = std({ map: T.asphalt, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    M.sidewalk = std({ map: T.sidewalk, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    M.white = std({ color: 0xf2f2ee, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    M.crane = std({ map: T.metal, roughness: 0.5, metalness: 0.3 });
    M.hay = std({ map: T.wood, color: 0xe8c86a, roughness: 1 });
    M.banner = std({ map: T.banner, roughness: 0.6, side: THREE.FrontSide });
    for (const key in this.builders) {
      const b = this.builders[key];
      if (!b.count) continue;
      const mesh = new THREE.Mesh(b.build(), M[key] || M.concrete);
      mesh.receiveShadow = true;
      mesh.castShadow = shadows && !['road', 'asphalt', 'sidewalk', 'white'].includes(key);
      mesh.name = 'world_' + key;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
    }
    // Вода
    const water = new THREE.MeshStandardMaterial({
      color: 0x2d6f8a, roughness: 0.08, metalness: 0.1, normalMap: T.waterNormal,
      transparent: true, opacity: 0.88, normalScale: new THREE.Vector2(0.35, 0.35),
    });
    T.waterNormal.repeat.set(12, 12);
    this.waterMat = water;
    for (const wm of this.waterMeshes) { wm.material = water; this.scene.add(wm); }
    this.builders = null;
  }

  update(dt, t) {
    if (this.T.waterNormal) {
      this.T.waterNormal.offset.x = t * 0.012;
      this.T.waterNormal.offset.y = t * 0.007;
    }
  }
}
