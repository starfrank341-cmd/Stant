// Общие утилиты: математика, случайные числа, шум
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

// Детерминированный генератор случайных чисел
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Хэш для value noise
function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

// Тайлящийся value noise (period в клетках решётки)
export function tileNoise(x, y, period, seed = 1) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const p = period;
  const x0 = ((ix % p) + p) % p, y0 = ((iy % p) + p) % p;
  const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function tileFbm(x, y, period, octaves = 4, seed = 1) {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileNoise(x * f, y * f, period * f, seed + i * 17);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

// Нетайлящийся гладкий шум для рельефа
export function noise2(x, y, seed = 7) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
export function fbm2(x, y, oct = 4, seed = 7) {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise2(x * f, y * f, seed + i * 31);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

export function formatNum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
