// Построитель объединённой геометрии: всё статичное в один BufferGeometry на материал
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

export class GeoBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = [];
  }
  get count() { return this.pos.length / 3; }

  // Четырёхугольник a,b,c,d (массивы [x,y,z]); hint — направление «наружу»
  quad(a, b, c, d, uva, uvb, uvc, uvd, color = [1, 1, 1], hint = null) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-12) {
      _b.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
      _n.crossVectors(_a, _b);
    }
    _n.normalize();
    if (hint && _n.x * hint[0] + _n.y * hint[1] + _n.z * hint[2] < 0) {
      // разворачиваем порядок
      [b, d] = [d, b]; [uvb, uvd] = [uvd, uvb];
      _n.negate();
    }
    const P = this.pos, N = this.nor, U = this.uv, C = this.col;
    const push = (p, t) => {
      P.push(p[0], p[1], p[2]); N.push(_n.x, _n.y, _n.z); U.push(t[0], t[1]); C.push(color[0], color[1], color[2]);
    };
    push(a, uva); push(b, uvb); push(c, uvc);
    push(a, uva); push(c, uvc); push(d, uvd);
  }

  // Ось-ориентированный (с поворотом yaw) ящик. uvScale — метров на повтор текстуры
  box(cx, cy, cz, sx, sy, sz, color = [1, 1, 1], uvScale = 4, yaw = 0, opts = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const us = uvScale, vs = opts.vScale || uvScale;
    const faces = [
      // +x
      [W(hx, -hy, -hz), W(hx, -hy, hz), W(hx, hy, hz), W(hx, hy, -hz), [c, 0, -s], sz, sy],
      // -x
      [W(-hx, -hy, hz), W(-hx, -hy, -hz), W(-hx, hy, -hz), W(-hx, hy, hz), [-c, 0, s], sz, sy],
      // +z
      [W(hx, -hy, hz), W(-hx, -hy, hz), W(-hx, hy, hz), W(hx, hy, hz), [s, 0, c], sx, sy],
      // -z
      [W(-hx, -hy, -hz), W(hx, -hy, -hz), W(hx, hy, -hz), W(-hx, hy, -hz), [-s, 0, -c], sx, sy],
    ];
    if (!opts.noSides) for (const f of faces) {
      const u1 = f[5] / us, v1 = f[6] / vs;
      const v0 = opts.vOffset || 0;
      this.quad(f[0], f[1], f[2], f[3], [0, v0], [u1, v0], [u1, v0 + v1], [0, v0 + v1], color, f[4]);
    }
    if (!opts.noTop) {
      const a = W(-hx, hy, -hz), b = W(hx, hy, -hz), d = W(-hx, hy, hz), e = W(hx, hy, hz);
      const tu = opts.topScale || uvScale;
      this.quad(a, b, e, d, [0, 0], [sx / tu, 0], [sx / tu, sz / tu], [0, sz / tu], color, [0, 1, 0]);
    }
    if (opts.bottom) {
      const a = W(-hx, -hy, -hz), b = W(hx, -hy, -hz), d = W(-hx, -hy, hz), e = W(hx, -hy, hz);
      this.quad(a, b, e, d, [0, 0], [1, 0], [1, 1], [0, 1], color, [0, -1, 0]);
    }
  }

  // Горизонтальный прямоугольник (для дорог/площадок). uv в метрах/uvScale или явные
  flatRect(x0, z0, x1, z1, y, uvScale = 8, color = [1, 1, 1], uvRot = false) {
    const a = [x0, y, z0], b = [x1, y, z0], c = [x1, y, z1], d = [x0, y, z1];
    let ua, ub, uc, ud;
    if (uvRot) {
      // u поперёк (по x от 0..1), v вдоль z
      ua = [0, z0 / uvScale]; ub = [1, z0 / uvScale]; uc = [1, z1 / uvScale]; ud = [0, z1 / uvScale];
    } else {
      ua = [x0 / uvScale, z0 / uvScale]; ub = [x1 / uvScale, z0 / uvScale];
      uc = [x1 / uvScale, z1 / uvScale]; ud = [x0 / uvScale, z1 / uvScale];
    }
    this.quad(a, b, c, d, ua, ub, uc, ud, color, [0, 1, 0]);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Добавить в построитель произвольную THREE-геометрию с матрицей и цветом
export function appendGeometry(builder, geom, matrix, color = [1, 1, 1]) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(matrix);
    nn.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
    builder.pos.push(v.x, v.y, v.z);
    builder.nor.push(nn.x, nn.y, nn.z);
    if (uv) builder.uv.push(uv.getX(i), uv.getY(i)); else builder.uv.push(0, 0);
    builder.col.push(color[0], color[1], color[2]);
  }
}
