// Эффекты: пыль, брызги, искры (пул частиц, без аллокаций), следы шин
import * as THREE from 'three';

export class Particles {
  constructor(scene, tex, max = 700) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: tex }, scale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a);
          if (gl_FragColor.a < 0.01) discard; }`,
    });
    this.mat = m;
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = g;
  }

  setScale(h) { this.mat.uniforms.scale.value = h * 0.6; }

  emit(x, y, z, vx, vy, vz, size, life, r, g, b, a, grow = 1, grav = -1) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.alpha0[i] = a; this.grow[i] = grow; this.grav[i] = grav;
  }

  dust(x, y, z, vx, vz, amt, col) {
    for (let k = 0; k < amt; k++) {
      this.emit(x + (Math.random() - 0.5) * 0.3, y + 0.1, z + (Math.random() - 0.5) * 0.3,
        vx * 0.3 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, vz * 0.3 + (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 0.5, 0.9 + Math.random() * 0.7, col[0], col[1], col[2], 0.45, 2.2, -0.3);
    }
  }

  burst(x, y, z, n, col, speed = 4, size = 0.8) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y + 0.2, z, Math.cos(a) * s, 0.5 + Math.random() * 1.5, Math.sin(a) * s,
        size * (0.6 + Math.random() * 0.6), 0.8 + Math.random() * 0.8, col[0], col[1], col[2], 0.55, 2.0, -0.5);
    }
  }

  splash(x, y, z) {
    for (let k = 0; k < 70; k++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5;
      this.emit(x, y, z, Math.cos(a) * s, 4 + Math.random() * 7, Math.sin(a) * s, 0.35 + Math.random() * 0.4, 1.2, 0.85, 0.95, 1, 0.8, 0.6, 14);
    }
  }

  sparks(x, y, z, n) {
    for (let k = 0; k < n; k++) {
      this.emit(x, y, z, (Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8, 0.12, 0.5 + Math.random() * 0.4, 1, 0.75, 0.3, 1, 0.2, 12);
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.col[i * 4 + 3] !== 0) { this.col[i * 4 + 3] = 0; any = true; } continue; }
      any = true;
      this.life[i] -= dt;
      const t = this.life[i] / this.maxLife[i];
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const damp = Math.exp(-1.5 * dt);
      this.vel[i * 3] *= damp; this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt * this.size[i] * 0.5;
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, t * 2);
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.geo.attributes.size.needsUpdate = true;
    }
  }
}

// Следы шин — кольцевой буфер четырёхугольников
export class Skids {
  constructor(scene, max = 400) {
    this.max = max;
    this.pos = new Float32Array(max * 6 * 3);
    this.alpha = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.05,0.05,0.05,vA*0.55); }',
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.geo = g;
    this.i = 0;
    this.last = null;
  }
  add(x, y, z, yaw, w = 0.13) {
    if (!this.last) { this.last = [x, y, z]; return; }
    const [lx, ly, lz] = this.last;
    const dx = x - lx, dz = z - lz;
    if (dx * dx + dz * dz < 0.09) return;
    if (dx * dx + dz * dz > 4) { this.last = [x, y, z]; return; }
    const c = Math.cos(yaw) * w, s = -Math.sin(yaw) * w;
    const k = this.i * 18;
    const P = this.pos;
    const v = [[lx - c, ly, lz - s], [lx + c, ly, lz + s], [x + c, y, z + s], [lx - c, ly, lz - s], [x + c, y, z + s], [x - c, y, z - s]];
    for (let j = 0; j < 6; j++) { P[k + j * 3] = v[j][0]; P[k + j * 3 + 1] = v[j][1] + 0.03; P[k + j * 3 + 2] = v[j][2]; this.alpha[this.i * 6 + j] = 1; }
    this.i = (this.i + 1) % this.max;
    this.last = [x, y, z];
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
  break() { this.last = null; }
  update(dt) {
    // медленное исчезновение
    let ch = false;
    for (let i = 0; i < this.alpha.length; i++) {
      if (this.alpha[i] > 0) { this.alpha[i] = Math.max(0, this.alpha[i] - dt * 0.04); ch = true; }
    }
    if (ch) this.geo.attributes.alpha.needsUpdate = true;
  }
}
