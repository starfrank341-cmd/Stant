// Небо, свет, туман, отражения окружения
import * as THREE from 'three';
import { tileFbm } from './util.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.72).normalize();
const HORIZON = new THREE.Color(0xf0cfae);
const ZENITH = new THREE.Color(0x2f6fc4);

function cloudTexture() {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = tileFbm(x / W * 12, y / H * 3, 12, 5, 55);
    const v = Math.max(0, (n - 0.5) * 3.2);
    const i = (y * W + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.min(255, v * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function makeSky() {
  const geo = new THREE.SphereGeometry(1, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSun: { value: SUN_DIR },
      uHorizon: { value: HORIZON },
      uZenith: { value: ZENITH },
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
      uniform vec3 uSun, uHorizon, uZenith;
      uniform sampler2D uClouds;
      uniform float uTime;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        float sunAmt = max(dot(d, uSun), 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
        col = mix(col, vec3(1.0, 0.78, 0.55), pow(sunAmt, 6.0) * 0.55 * (1.0 - h));
        col += vec3(1.0, 0.85, 0.6) * pow(sunAmt, 900.0) * 6.0;
        col += vec3(1.0, 0.8, 0.5) * pow(sunAmt, 40.0) * 0.4;
        // облака
        if (d.y > 0.0) {
          vec2 cuv = vec2(atan(d.x, d.z) / 6.2831 + uTime * 0.002, 1.0 - h * 2.2);
          float c = texture2D(uClouds, cuv).a * smoothstep(0.0, 0.12, d.y) * (1.0 - smoothstep(0.35, 0.5, h));
          vec3 cc = mix(vec3(1.0, 0.92, 0.85), vec3(1.0, 0.75, 0.55), pow(sunAmt, 3.0));
          col = mix(col, cc, c * 0.85);
        }
        // под горизонтом
        if (d.y < 0.0) col = mix(uHorizon, vec3(0.55, 0.6, 0.62), min(-d.y * 4.0, 1.0));
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
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5b4a38, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2bf, 2.6);
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
  scene.fog = new THREE.Fog(HORIZON.clone().lerp(new THREE.Color(0xa9c3dd), 0.65), 150, quality === 'low' ? 420 : 680);
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
  const g = new THREE.Mesh(new THREE.CircleGeometry(40, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5d6b4c }));
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
