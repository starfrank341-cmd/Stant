// Небо, свет, туман, отражения окружения
import * as THREE from 'three';
import { tileFbm } from './util.js';

export const SUN_DIR = new THREE.Vector3(-0.8, 0.3, -0.52).normalize();
const HORIZON = new THREE.Color(0xf09060);
const FOG = new THREE.Color(0xc99486);

// Вытянутые закатные облака (альфа)
function cloudTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const n = tileFbm(u * 10, v * 2.2 + tileFbm(u * 4, v, 4, 2, 9) * 0.6, 10, 5, 55);
    const band = Math.sin(Math.PI * Math.min(1, v * 1.15)) ; // облака в середине полосы
    const dens = Math.max(0, (n - 0.47) * 3.4) * (0.35 + 0.65 * band);
    const i = (y * W + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.min(255, dens * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function makeSky() {
  const geo = new THREE.SphereGeometry(1, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSun: { value: SUN_DIR },
      uClouds: { value: cloudTexture() },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uSun;
      uniform sampler2D uClouds;
      uniform float uTime;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec2 dz = normalize(d.xz + 1e-5), sz = normalize(uSun.xz);
        float s = dot(dz, sz) * 0.5 + 0.5; // близость к солнцу по азимуту
        vec3 hor = mix(vec3(0.85, 0.5, 0.48), vec3(1.0, 0.6, 0.25), pow(s, 2.0));
        vec3 mid = mix(vec3(0.45, 0.36, 0.58), vec3(0.98, 0.42, 0.3), pow(s, 3.0));
        vec3 zen = vec3(0.1, 0.16, 0.4);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.12, h));
        col = mix(col, zen, smoothstep(0.08, 0.55, h));
        float sunAmt = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.55, 0.2) * pow(sunAmt, 6.0) * 0.55;
        col += vec3(1.0, 0.8, 0.5) * pow(sunAmt, 120.0) * 1.2;
        col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9990, 0.9996, sunAmt) * 6.0;
        // облака
        if (d.y > 0.0) {
          vec2 cuv = vec2(atan(d.x, d.z) / 6.2831 + uTime * 0.0015, clamp(h / 0.42, 0.0, 1.0));
          float c = min(1.0, texture2D(uClouds, cuv).a * 1.4) * smoothstep(0.0, 0.04, d.y) * (1.0 - smoothstep(0.32, 0.42, h));
          float lit = pow(s, 2.5);
          vec3 dark = mix(vec3(0.42, 0.28, 0.42), vec3(0.62, 0.32, 0.36), lit);
          vec3 bright = mix(vec3(1.0, 0.6, 0.55), vec3(1.0, 0.82, 0.5), lit);
          float rim = pow(sunAmt, 10.0);
          vec3 cc = mix(dark, bright, clamp(0.35 + lit * 0.5 + rim, 0.0, 1.0));
          col = mix(col, cc, c * 0.92);
        }
        if (d.y < 0.0) col = mix(hor * 0.85, vec3(0.35, 0.27, 0.3), min(-d.y * 4.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.scale.setScalar(1400);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

export function setupLights(scene, quality) {
  const hemi = new THREE.HemisphereLight(0xd9d2e0, 0x4a4038, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb27a, 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  if (quality !== 'low') {
    sun.castShadow = true;
    const s = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(s, s);
    const r = quality === 'high' ? 45 : 32;
    const cam = sun.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 1; cam.far = 320;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun);
  scene.add(sun.target);
  scene.fog = new THREE.Fog(FOG, 160, quality === 'low' ? 520 : 900);
  return { hemi, sun };
}

// Карта окружения для металлических красок
export function makeEnvMap(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky = makeSky();
  sky.scale.setScalar(50);
  envScene.add(sky);
  // земля
  const g = new THREE.Mesh(new THREE.CircleGeometry(40, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a4038 }));
  g.position.y = -2;
  envScene.add(g);
  const rt = pm.fromScene(envScene, 0.02);
  pm.dispose();
  return rt.texture;
}

// Слежение тени за игроком с привязкой к текселям (без дрожания)
const _v = new THREE.Vector3();
export function updateSun(light, target) {
  if (!light.castShadow) return;
  const cam = light.shadow.camera;
  const texel = (cam.right - cam.left) / light.shadow.mapSize.x;
  _v.copy(target);
  // привязка в плоскости света
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), SUN_DIR);
  const qi = q.clone().invert();
  _v.applyQuaternion(qi);
  _v.x = Math.round(_v.x / texel) * texel;
  _v.y = Math.round(_v.y / texel) * texel;
  _v.applyQuaternion(q);
  light.target.position.copy(_v);
  light.position.copy(_v).addScaledVector(SUN_DIR, 150);
  light.target.updateMatrixWorld();
}
