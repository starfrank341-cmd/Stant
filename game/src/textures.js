// Процедурные текстуры, рисуются на canvas при загрузке (никаких внешних файлов)
import * as THREE from 'three';
import { mulberry32, tileFbm, tileNoise, clamp } from './util.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Заполнить пиксели функцией fn(u,v) -> [r,g,b] (u,v в 0..1)
function pixels(c, fn) {
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const col = fn(x / c.width, y / c.height, x, y);
      d[i++] = clamp(col[0], 0, 255);
      d[i++] = clamp(col[1], 0, 255);
      d[i++] = clamp(col[2], 0, 255);
      d[i++] = col[3] === undefined ? 255 : col[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx;
}

function toTex(c, { repeat = true, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Рисуем «трещины» случайными ломаными
function cracks(ctx, size, rnd, n, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i < n; i++) {
    let x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    const len = 8 + rnd() * 20;
    for (let k = 0; k < len; k++) {
      a += (rnd() - 0.5) * 1.2;
      x += Math.cos(a) * 3; y += Math.sin(a) * 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function speckles(ctx, size, rnd, n, colors, rMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    const r = 0.5 + rnd() * rMax;
    const x = rnd() * size, y = rnd() * size;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // повтор по краям для бесшовности
    if (x < rMax) { ctx.beginPath(); ctx.arc(x + size, y, r, 0, 7); ctx.fill(); }
    if (y < rMax) { ctx.beginPath(); ctx.arc(x, y + size, r, 0, 7); ctx.fill(); }
  }
}

export function asphaltCanvas(S, seed = 3) {
  const c = canvas(S);
  const rnd = mulberry32(seed);
  const ctx = pixels(c, (u, v) => {
    const n = tileFbm(u * 16, v * 16, 16, 4, seed);
    const g = tileNoise(u * 128, v * 128, 128, seed + 5);
    const b = 52 + n * 34 + g * 14;
    return [b, b + 1, b + 4];
  });
  speckles(ctx, S, rnd, S * 3, ['rgba(160,160,165,0.5)', 'rgba(20,20,22,0.55)', 'rgba(110,105,100,0.5)'], S / 300);
  cracks(ctx, S, rnd, 5, 'rgba(15,15,15,0.55)', S / 400);
  // пятна
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S, y = rnd() * S, r = S * (0.05 + rnd() * 0.12);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(20,20,25,0.25)'); gr.addColorStop(1, 'rgba(20,20,25,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

export function makeTextures(q) {
  const S = q === 'low' ? 256 : 512;
  const aniso = q === 'low' ? 1 : q === 'med' ? 4 : 8;
  const T = {};

  // --- Асфальт ---
  const asp = asphaltCanvas(S, 3);
  T.asphalt = toTex(asp, { aniso });

  // --- Дорога с разметкой (u поперёк, v вдоль) ---
  {
    const c = canvas(S);
    const ctx = c.getContext('2d');
    ctx.drawImage(asp, 0, 0);
    ctx.fillStyle = 'rgba(235,235,230,0.92)';
    ctx.fillRect(S * 0.05, 0, S * 0.018, S);
    ctx.fillRect(S * 0.932, 0, S * 0.018, S);
    ctx.fillStyle = 'rgba(245,200,60,0.95)';
    ctx.fillRect(S * 0.49, 0, S * 0.02, S * 0.55);
    // потёртость разметки
    const rnd = mulberry32(9);
    for (let i = 0; i < S * 2; i++) {
      ctx.fillStyle = 'rgba(60,60,62,0.6)';
      ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    T.road = toTex(c, { aniso });
  }

  // --- Тротуарная плитка ---
  {
    const c = canvas(S);
    const ctx = pixels(c, (u, v) => {
      const n = tileFbm(u * 8, v * 8, 8, 3, 21);
      const b = 150 + n * 40;
      return [b, b - 4, b - 10];
    });
    ctx.strokeStyle = 'rgba(70,65,60,0.7)';
    ctx.lineWidth = S / 170;
    const k = 4;
    for (let i = 0; i <= k; i++) {
      ctx.beginPath(); ctx.moveTo(0, (i * S) / k); ctx.lineTo(S, (i * S) / k); ctx.stroke();
      for (let j = 0; j < k; j++) {
        const off = (i % 2) * (S / k / 2);
        ctx.beginPath(); ctx.moveTo(((j * S) / k + off) % S, (i * S) / k);
        ctx.lineTo(((j * S) / k + off) % S, ((i + 1) * S) / k); ctx.stroke();
      }
    }
    T.sidewalk = toTex(c, { aniso });
  }

  // --- Трава ---
  {
    const c = canvas(S);
    const rnd = mulberry32(31);
    const ctx = pixels(c, (u, v) => {
      const n = tileFbm(u * 8, v * 8, 8, 5, 41);
      const m = tileNoise(u * 64, v * 64, 64, 43);
      return [62 + n * 40 + m * 12, 105 + n * 55 + m * 18, 38 + n * 20];
    });
    for (let i = 0; i < S * 14; i++) {
      const x = rnd() * S, y = rnd() * S;
      const l = S / 90 + rnd() * S / 60;
      const g = 80 + rnd() * 90;
      ctx.strokeStyle = `rgba(${g * 0.55 | 0},${g | 0},${g * 0.3 | 0},0.55)`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * l * 0.6, y - l); ctx.stroke();
    }
    speckles(ctx, S, rnd, S / 4, ['rgba(230,220,120,0.6)', 'rgba(255,255,255,0.5)'], 1.2);
    T.grass = toTex(c, { aniso });
  }

  // --- Земля / грязь ---
  {
    const c = canvas(S);
    const rnd = mulberry32(51);
    const ctx = pixels(c, (u, v) => {
      const n = tileFbm(u * 8, v * 8, 8, 5, 61);
      const m = tileNoise(u * 96, v * 96, 96, 63);
      return [120 + n * 50 + m * 18, 82 + n * 36 + m * 12, 52 + n * 22 + m * 8];
    });
    speckles(ctx, S, rnd, S * 2, ['rgba(70,50,35,0.7)', 'rgba(170,140,110,0.6)', 'rgba(140,130,120,0.8)'], S / 200);
    // следы шин
    ctx.strokeStyle = 'rgba(60,40,25,0.25)';
    ctx.lineWidth = S / 40;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const x0 = rnd() * S;
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(x0 + (rnd() - 0.5) * S * 0.3, S * 0.33, x0 + (rnd() - 0.5) * S * 0.3, S * 0.66, x0, S);
      ctx.stroke();
    }
    T.dirt = toTex(c, { aniso });
  }

  // --- Песок ---
  {
    const c = canvas(S);
    const ctx = pixels(c, (u, v) => {
      const n = tileFbm(u * 8, v * 8, 8, 4, 71);
      const r = tileFbm(u * 4 + v * 10, v * 2, 4, 2, 73); // рябь
      const m = tileNoise(u * 128, v * 128, 128, 77);
      return [205 + n * 30 + m * 14 - r * 10, 182 + n * 26 + m * 12 - r * 10, 135 + n * 20 + m * 8];
    });
    T.sand = toTex(c, { aniso });
  }

  // --- Бетон с плитами ---
  {
    const c = canvas(S);
    const rnd = mulberry32(81);
    const ctx = pixels(c, (u, v) => {
      const n = tileFbm(u * 8, v * 8, 8, 5, 83);
      const m = tileNoise(u * 128, v * 128, 128, 85);
      const b = 160 + n * 45 + m * 14;
      return [b, b - 2, b - 6];
    });
    ctx.strokeStyle = 'rgba(80,80,80,0.6)';
    ctx.lineWidth = S / 200;
    ctx.strokeRect(0, 0, S, S);
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
    cracks(ctx, S, rnd, 4, 'rgba(60,60,60,0.4)', 1);
    for (let i = 0; i < 8; i++) {
      const x = rnd() * S, y = rnd() * S, r = S * (0.03 + rnd() * 0.1);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(60,55,50,0.18)'); gr.addColorStop(1, 'rgba(60,55,50,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    T.concrete = toTex(c, { aniso });
  }

  // --- Дерево (доски рамп) ---
  {
    const c = canvas(S);
    const planks = 8;
    const ctx = pixels(c, (u, v) => {
      const p = Math.floor(v * planks);
      const grain = tileFbm(u * 2, v * 64, 2, 3, 91 + p) * 0.6 + tileNoise(u * 4, v * 256, 4, 95) * 0.4;
      const tone = 0.85 + ((p * 7919) % 13) / 13 * 0.3;
      return [(150 + grain * 70) * tone, (100 + grain * 50) * tone, (60 + grain * 30) * tone];
    });
    ctx.fillStyle = 'rgba(40,25,15,0.8)';
    for (let i = 0; i <= planks; i++) ctx.fillRect(0, (i * S) / planks - 1, S, 2);
    const rnd = mulberry32(97);
    ctx.fillStyle = 'rgba(50,50,55,0.9)';
    for (let i = 0; i < planks; i++) {
      const y = (i + 0.5) * S / planks;
      for (const x of [S * 0.08, S * 0.5, S * 0.92]) {
        ctx.beginPath(); ctx.arc(x + (rnd() - 0.5) * 3, y, S / 220, 0, 7); ctx.fill();
      }
    }
    T.wood = toTex(c, { aniso });
  }

  // --- Металл (контейнеры), нейтральный, красится цветом вершин ---
  {
    const c = canvas(S);
    const rnd = mulberry32(101);
    const ctx = pixels(c, (u, v) => {
      const rib = Math.sin(u * Math.PI * 2 * 24);
      const n = tileFbm(u * 8, v * 8, 8, 4, 103);
      const b = 190 + rib * 26 + n * 40;
      return [b, b, b];
    });
    // ржавчина
    for (let i = 0; i < 30; i++) {
      const x = rnd() * S, y = rnd() * S, r = S * (0.01 + rnd() * 0.05);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(120,60,20,0.5)'); gr.addColorStop(1, 'rgba(120,60,20,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.fillStyle = 'rgba(60,60,60,0.8)';
    ctx.fillRect(0, 0, S, S / 60); ctx.fillRect(0, S - S / 60, S, S / 60);
    T.metal = toTex(c, { aniso });
  }

  // --- Фасады зданий ---
  T.facades = [facadeOffice(S), facadeBrick(S), facadePlaster(S)].map((c) => toTex(c, { aniso }));

  // --- Витрины первого этажа: вывеска + стекло (тайл 8 м x 4.2 м) ---
  {
    const W = S, H = S / 2;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const rnd = mulberry32(241);
    ctx.fillStyle = '#d8d2c8'; ctx.fillRect(0, 0, W, H);
    const signs = ['#c1121f', '#1d4ed8', '#16a34a', '#f59e0b', '#7c3aed', '#0f766e', '#111827'];
    for (let k = 0; k < 2; k++) {
      const x0 = k * W / 2;
      ctx.fillStyle = signs[(rnd() * signs.length) | 0];
      ctx.fillRect(x0 + W * 0.02, H * 0.05, W * 0.46, H * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 5; i++) ctx.fillRect(x0 + W * (0.06 + i * 0.075), H * 0.1, W * 0.05, H * 0.1);
      const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
      g.addColorStop(0, '#9fb8cc'); g.addColorStop(0.5, '#3a4f66'); g.addColorStop(1, '#1d2633');
      ctx.fillStyle = g; ctx.fillRect(x0 + W * 0.03, H * 0.32, W * 0.44, H * 0.68);
      ctx.fillStyle = 'rgba(255,230,170,0.35)';
      ctx.fillRect(x0 + W * 0.05, H * 0.6, W * 0.4, H * 0.4);
      ctx.fillStyle = '#2b2b2e';
      ctx.fillRect(x0 + W * 0.03, H * 0.3, W * 0.44, H * 0.03);
      ctx.fillRect(x0 + W * 0.24, H * 0.32, W * 0.015, H * 0.68);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.moveTo(x0 + W * 0.05, H); ctx.lineTo(x0 + W * 0.2, H * 0.35); ctx.lineTo(x0 + W * 0.26, H * 0.35); ctx.lineTo(x0 + W * 0.1, H); ctx.fill();
    }
    T.shop = toTex(c, { aniso });
  }

  // --- Крыша ---
  {
    const c = canvas(S / 2);
    pixels(c, (u, v) => {
      const n = tileFbm(u * 8, v * 8, 8, 4, 111);
      const m = tileNoise(u * 128, v * 128, 128, 113);
      const b = 80 + n * 30 + m * 30;
      return [b, b, b + 3];
    });
    T.roof = toTex(c, { aniso });
  }

  // --- Шум для макро-вариаций рельефа ---
  {
    const c = canvas(128);
    pixels(c, (u, v) => {
      const n = tileFbm(u * 4, v * 4, 4, 4, 121);
      const b = 200 + (n - 0.5) * 110;
      return [b, b, b];
    });
    T.macro = toTex(c, { srgb: false, aniso: 1 });
  }

  // --- Нормаль воды (тайлящийся шум -> нормали) ---
  {
    const N = 256;
    const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = tileFbm(x / N * 8, y / N * 8, 8, 4, 131);
    const c = canvas(N);
    pixels(c, (u, v, x, y) => {
      const l = h[y * N + ((x + N - 1) % N)], r = h[y * N + ((x + 1) % N)];
      const t = h[((y + N - 1) % N) * N + x], b = h[((y + 1) % N) * N + x];
      const nx = (l - r) * 6, ny = (t - b) * 6;
      const len = Math.hypot(nx, ny, 1);
      return [(nx / len * 0.5 + 0.5) * 255, (ny / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255];
    });
    T.waterNormal = toTex(c, { srgb: false, aniso: 2 });
  }

  // --- Шина с протектором ---
  {
    const c = canvas(256, 64);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1c1c1e'; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#2e2e31';
    for (let i = 0; i < 32; i++) {
      const x = i * 8;
      ctx.fillRect(x, (i % 2) * 8 + 8, 5, 18);
      ctx.fillRect(x + 2, 38 - (i % 2) * 8, 5, 18);
    }
    T.tire = toTex(c, { aniso: 2 });
  }

  // --- Мягкая частица ---
  {
    const c = canvas(64);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    T.particle = toTex(c, { repeat: false });
  }

  // --- Тень-пятно ---
  {
    const c = canvas(64);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.6)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    T.blob = toTex(c, { repeat: false });
  }

  // --- Листва (кластер листьев с альфой) ---
  {
    const N = q === 'low' ? 128 : 256;
    const c = canvas(N);
    const ctx = c.getContext('2d');
    const rnd = mulberry32(401);
    for (let i = 0; i < N * 1.6; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * N * 0.46;
      const x = N / 2 + Math.cos(a) * r, y = N / 2 + Math.sin(a) * r * 0.9;
      const shade = 0.55 + (1 - r / (N * 0.46)) * 0.25 + rnd() * 0.25;
      const g = 110 + rnd() * 60;
      ctx.fillStyle = `rgb(${(g * 0.55 * shade) | 0},${(g * shade) | 0},${(g * 0.32 * shade) | 0})`;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * 6.28);
      ctx.beginPath(); ctx.ellipse(0, 0, N / 40 + rnd() * N / 50, N / 90 + rnd() * N / 120, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    T.leaves = toTex(c, { repeat: false, aniso: 1 });
  }
  // --- Пальмовый лист: центральная жилка и листочки ---
  {
    const W = q === 'low' ? 256 : 512, H = W / 4;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const rnd = mulberry32(411);
    ctx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const t = i / 46;
      const x = W * (0.04 + t * 0.94);
      const len = H * 0.48 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)) * (0.85 + rnd() * 0.25);
      for (const sg of [-1, 1]) {
        const g = 95 + rnd() * 50;
        ctx.strokeStyle = `rgb(${(g * 0.6) | 0},${g | 0},${(g * 0.3) | 0})`;
        ctx.lineWidth = W / 120;
        ctx.beginPath(); ctx.moveTo(x, H / 2);
        ctx.quadraticCurveTo(x + len * 0.3, H / 2 + sg * len * 0.5, x + len * 0.55, H / 2 + sg * len);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#7a7a3a'; ctx.lineWidth = W / 110;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    T.frond = toTex(c, { repeat: false, aniso: 2 });
  }
  // --- Кора: дерево и пальма ---
  {
    const c = canvas(128);
    pixels(c, (u, v) => {
      const n = tileFbm(u * 4, v * 16, 4, 4, 421);
      const b = 70 + n * 50;
      return [b * 1.05, b * 0.82, b * 0.62];
    });
    T.bark = toTex(c, { aniso: 1 });
    const c2 = canvas(128);
    pixels(c2, (u, v) => {
      const ring = Math.pow(Math.abs(Math.sin(v * Math.PI * 6)), 0.4);
      const n = tileFbm(u * 8, v * 8, 8, 3, 431);
      const b = 95 + n * 40 - (1 - ring) * 45;
      return [b * 1.08, b * 0.92, b * 0.72];
    });
    T.palmBark = toTex(c2, { aniso: 1 });
  }

  // --- Граффити для рамп ---
  T.graffiti = toTex(graffiti(S), { aniso });

  // --- Баннер STANT ---
  {
    const c = canvas(512, 128);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0, '#ff3b30'); g.addColorStop(0.5, '#ff9500'); g.addColorStop(1, '#ff2d55');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 16; i++) ctx.fillRect(i * 40 - 10, 0, 14, 128);
    ctx.font = 'italic 900 86px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#111';
    ctx.strokeText('STANT', 256, 66);
    ctx.fillStyle = '#fff'; ctx.fillText('STANT', 256, 66);
    T.banner = toTex(c, { repeat: false });
  }

  // --- Номер на табличке байка ---
  T.makeNumber = (num, bg = '#ffffff', fg = '#111111') => {
    const c = canvas(128);
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 128, 128);
    ctx.font = '900 84px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = fg; ctx.fillText(String(num), 64, 70);
    return toTex(c, { repeat: false });
  };

  return T;
}

function windowGlass(ctx, x, y, w, h, rnd, lit) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  if (lit) {
    g.addColorStop(0, '#f6e7b8'); g.addColorStop(1, '#d9b56d');
  } else {
    g.addColorStop(0, '#9fc3e6'); g.addColorStop(0.45, '#3d5d82'); g.addColorStop(1, '#1d2c44');
  }
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // блик
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.moveTo(x, y + h * 0.6); ctx.lineTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.75, y); ctx.lineTo(x, y + h * 0.95); ctx.fill();
  // шторы
  if (!lit && rnd() < 0.35) {
    const cols = ['#c9b79c', '#8a6f5a', '#d8d0c0', '#6d7f8c', '#a14d43'];
    ctx.fillStyle = cols[(rnd() * cols.length) | 0];
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, w * (0.2 + rnd() * 0.4), h);
    ctx.globalAlpha = 1;
  }
}

// Стеклянный офис: тайл = 2 окна x 2 этажа
function facadeOffice(S) {
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(201);
  ctx.fillStyle = '#c8ccd2'; ctx.fillRect(0, 0, S, S);
  const cw = S / 2, ch = S / 2;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x = i * cw, y = j * ch;
    windowGlass(ctx, x + cw * 0.06, y + ch * 0.1, cw * 0.88, ch * 0.72, rnd, rnd() < 0.08);
    ctx.fillStyle = '#7b828c';
    ctx.fillRect(x + cw * 0.49, y + ch * 0.1, cw * 0.02, ch * 0.72);
    ctx.fillStyle = '#e3e6ea';
    ctx.fillRect(x, y + ch * 0.84, cw, ch * 0.05);
  }
  return c;
}

function facadeBrick(S) {
  const c = canvas(S);
  const rnd = mulberry32(211);
  const ctx = pixels(c, (u, v) => {
    const row = Math.floor(v * 32);
    const off = (row % 2) * 0.5;
    const col = Math.floor(u * 16 + off);
    const bu = (u * 16 + off) % 1, bv = (v * 32) % 1;
    const mortar = bu < 0.06 || bv < 0.1;
    const t = ((col * 92821 + row * 68917) % 100) / 100;
    const n = tileNoise(u * 64, v * 64, 64, 213) * 20;
    if (mortar) return [175 + n, 165 + n, 150 + n];
    return [150 + t * 50 + n, 70 + t * 22 + n * 0.5, 50 + t * 12];
  });
  const cw = S / 2, ch = S / 2;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x = i * cw, y = j * ch;
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(x + cw * 0.22, y + ch * 0.17, cw * 0.56, ch * 0.62);
    windowGlass(ctx, x + cw * 0.26, y + ch * 0.2, cw * 0.48, ch * 0.56, rnd, rnd() < 0.1);
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(x + cw * 0.49, y + ch * 0.2, cw * 0.02, ch * 0.56);
    ctx.fillRect(x + cw * 0.18, y + ch * 0.78, cw * 0.64, ch * 0.05);
  }
  return c;
}

function facadePlaster(S) {
  const c = canvas(S);
  const rnd = mulberry32(221);
  const ctx = pixels(c, (u, v) => {
    const n = tileFbm(u * 8, v * 8, 8, 4, 223);
    const b = 225 + n * 25;
    return [b, b - 6, b - 16];
  });
  const cw = S / 2, ch = S / 2;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x = i * cw, y = j * ch;
    windowGlass(ctx, x + cw * 0.2, y + ch * 0.12, cw * 0.6, ch * 0.6, rnd, rnd() < 0.1);
    ctx.strokeStyle = '#fafafa'; ctx.lineWidth = S / 100;
    ctx.strokeRect(x + cw * 0.2, y + ch * 0.12, cw * 0.6, ch * 0.6);
    // балкон
    ctx.fillStyle = 'rgba(80,80,90,0.85)';
    ctx.fillRect(x + cw * 0.12, y + ch * 0.72, cw * 0.76, ch * 0.04);
    for (let k = 0; k < 9; k++) ctx.fillRect(x + cw * (0.13 + k * 0.09), y + ch * 0.62, S / 300 + 1, ch * 0.1);
    ctx.fillRect(x + cw * 0.12, y + ch * 0.6, cw * 0.76, ch * 0.02);
  }
  return c;
}

function graffiti(S) {
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.drawImage(woodBase(S), 0, 0);
  const rnd = mulberry32(301);
  const cols = ['#ff2d55', '#34c759', '#0a84ff', '#ffcc00', '#af52de', '#ff9500', '#5ac8fa'];
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = cols[(rnd() * cols.length) | 0];
    ctx.beginPath();
    const x = rnd() * S, y = rnd() * S, r = S * (0.04 + rnd() * 0.12);
    ctx.ellipse(x, y, r, r * (0.4 + rnd()), rnd() * 3, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = `italic 900 ${S / 4.2}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(-0.15);
  ctx.lineWidth = S / 40; ctx.strokeStyle = '#111'; ctx.strokeText('STANT', 0, 0);
  const g = ctx.createLinearGradient(-S / 2, 0, S / 2, 0);
  g.addColorStop(0, '#ffcc00'); g.addColorStop(1, '#ff2d55');
  ctx.fillStyle = g; ctx.fillText('STANT', 0, 0);
  ctx.restore();
  return c;
}

function woodBase(S) {
  const c = canvas(S);
  pixels(c, (u, v) => {
    const n = tileFbm(u * 8, v * 8, 8, 4, 311);
    const b = 60 + n * 30;
    return [b, b, b + 6];
  });
  return c;
}
