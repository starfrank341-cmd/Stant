// STANT — питбайк стант. Точка входа: загрузка, игровой цикл, камера, режимы
import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { World, SURF } from './world.js';
import { makeSky, setupLights, makeEnvMap, updateSun } from './env.js';
import { BikeModel, BIKES, makeBlob } from './bike.js';
import { Player, G } from './player.js';
import { Tricks } from './tricks.js';
import { Save } from './save.js';
import { Audio } from './audio.js';
import { Particles, Skids } from './fx.js';
import { Traffic, People } from './traffic.js';
import { Props } from './props.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Minimap } from './minimap.js';
import { clamp, damp, wrapAngle, lerp } from './util.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const TIPS = [
  'Жми ГАЗ, а левым стиком рули влево-вправо',
  'Стик ВНИЗ — наклон назад: вилли на земле и бэкфлип в воздухе',
  'Стик ВВЕРХ + ТОРМОЗ — стоппи. В воздухе стик вверх — фронтфлип',
  'Зажми ПРЫЖОК и отпусти — подскок. На краю трамплина — выше!',
  'Фиолетовые кнопки — трюки: держи их на вилли (очки ×2) или в полёте. ⇄ — сменить набор трюков',
  'Газ + тормоз на месте — бёрнаут (стиком крути пончик). Тормоз + резкий поворот на скорости — дрифт',
  'В полёте стик в стороны — вращение 360°. Камеру крути пальцем справа, 🎥 — сменить вид',
  'Приземляйся ровно на колёса — очки комбо превращаются в монеты',
  'Карта и телепорт к местам для трюков — в меню паузы ❚❚',
];

// Виды камеры (кнопка 🎥); палец по экрану — свободный поворот
const CAM_MODES = [
  { name: 'Сзади', dist: 5.4, h: 2.0, side: 0, look: 0.55, ahead: 1.4, fov: 60, speedK: 0.06, auto: true },
  { name: 'Сбоку', dist: 4.8, h: 0.75, side: Math.PI * 0.42, look: 0.45, ahead: 0.6, fov: 52, speedK: 0.03 },
  { name: 'Низко сзади', dist: 3.6, h: 0.65, side: 0.25, look: 0.75, ahead: 2.0, fov: 64, speedK: 0.04 },
  { name: 'Издалека', dist: 10, h: 3.8, side: 0, look: 0.6, ahead: 1.5, fov: 55, speedK: 0.08, auto: true },
  { name: 'Кино', dist: 7, h: 1.3, side: 0, look: 0.5, ahead: 0, fov: 50, speedK: 0.02, orbit: true },
];

const DUST = {
  [SURF.DIRT]: [0.55, 0.42, 0.3], [SURF.SAND]: [0.86, 0.78, 0.6], [SURF.GRASS]: [0.42, 0.48, 0.3],
  [SURF.ASPHALT]: [0.7, 0.7, 0.72], [SURF.CONCRETE]: [0.78, 0.76, 0.72], [SURF.WOOD]: [0.7, 0.6, 0.5], [SURF.METAL]: [0.7, 0.7, 0.72],
};

function autoQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|Mobile|iPhone|iPad/i.test(navigator.userAgent);
  if (mem <= 3 || cores <= 4) return 'low';
  if (mem >= 8 && cores >= 8 && !mobile) return 'high';
  return 'med';
}

class Game {
  constructor() {
    this.save = new Save();
    const sq = this.save.data.settings.quality;
    this.quality = sq === 'auto' ? autoQuality() : sq;
    this.audio = new Audio();
    this.audio.enabled = this.save.data.settings.sound;
    this.input = new Input();
    this.input.sens = this.save.data.settings.sens;
    this.input.onPause = () => (this.state === 'play' ? this.pause() : this.state === 'pause' && this.resume());
    this.ui = new UI(this);
    this.state = 'loading';
    this.timeScale = 1;
    this.slowPulse = 0;
    this.shake = 0;
    this.dynScale = 1;
    this.frameEma = 1 / 60;
    this.tipI = 0;
    this.init().catch((e) => {
      console.error(e);
      this.ui.loading(1, 'Ошибка: ' + e.message);
    });
  }

  async init() {
    const q = this.quality;
    const ui = this.ui;
    ui.loading(0.05, 'Запуск графики...');
    await nextFrame();
    const canvas = document.getElementById('gl');
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q === 'high', powerPreference: 'high-performance', stencil: false }));
    this.basePR = Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : q === 'med' ? 1.5 : 2);
    renderer.setPixelRatio(this.basePR);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = q !== 'low';
    renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    ui.loading(0.12, 'Рисую текстуры...');
    await nextFrame();
    const T = (this.T = makeTextures(q));

    ui.loading(0.3, 'Строю город и трамплины...');
    await nextFrame();
    const scene = (this.scene = new THREE.Scene());
    this.sky = makeSky();
    scene.add(this.sky);
    const env = makeEnvMap(renderer);
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    const L = setupLights(scene, q);
    this.sun = L.sun;
    const world = (this.world = new World(scene, T, q));

    ui.loading(0.55, 'Сажаю деревья и выпускаю машины...');
    await nextFrame();
    this.props = new Props(scene, world, T, q);
    this.traffic = new Traffic(scene, world, q);
    this.people = new People(scene, world, q);
    this.particles = new Particles(scene, T.particle, q === 'low' ? 350 : 700);
    this.skids = new Skids(scene, q === 'low' ? 200 : 400);

    ui.loading(0.75, 'Собираю питбайк...');
    await nextFrame();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 1600);
    this.player = new Player(world, BIKES[0], {});
    this.blob = makeBlob(T);
    scene.add(this.blob);
    this.applyBike();
    const spawn = world.spots[0];
    this.player.reset(spawn.x, spawn.z, spawn.yaw);
    this.camPos = new THREE.Vector3(spawn.x, 3, spawn.z + 6);
    this.camLook = new THREE.Vector3();
    this.camYaw = spawn.yaw;
    this.camSide = 0;
    this.menuAngle = 0;
    this.camMode = this.save.data.settings.camMode || 0;
    this.camOrbit = 0; this.camPitch = 0;
    this.bindCamera();
    this.tricks = new Tricks(this.save, {
      onTrick: (n, p, c) => { this.ui.combo(c, this.tricks.mult); },
      onBank: (c, m, total, coins) => {
        this.ui.combo(null);
        this.ui.bank(`+ ◉ ${coins}`);
        this.audio.bank(total > 3000);
        this.people.cheerNear(this.player.pos.x, this.player.pos.z);
      },
      onLost: () => { this.ui.combo(null); this.ui.bank('Комбо потеряно', true); this.audio.lost(); },
      onMission: (m) => {
        setTimeout(() => { this.ui.toast('ЗАДАНИЕ!', `${m.name} · ◉ ${m.reward}`); this.audio.bank(true); }, 900);
        this.ui.updateMissionBadge();
      },
    });
    this.minimap = new Minimap(world);
    this.buildGarage(env);

    ui.loading(0.92, 'Прогрев шейдеров...');
    await nextFrame();
    this.updateBikeVisual(0);
    this.updateCamera(0.016, true);
    renderer.compile(scene, this.camera);
    renderer.render(scene, this.camera);

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'play') this.pause();
        if (this.audio.ctx) this.audio.ctx.suspend();
        this.save.flush();
      } else if (this.audio.ctx && this.state !== 'loading') this.audio.ctx.resume();
    });
    // Кнопка «Назад» Android: пауза / назад; в главном меню — выход
    window.onAndroidBack = () => {
      if (document.getElementById('confirm').classList.contains('show')) { document.getElementById('cno').click(); return true; }
      if (this.state === 'play') this.pause();
      else if (this.ui.screen === 'pause') this.resume();
      else if (this.ui.screen === 'menu' || this.ui.screen === 'loading') return false;
      else this.ui.back();
      return true;
    };
    document.getElementById('fps').style.display = this.save.data.settings.fps ? '' : 'none';
    ui.loading(1, 'Готово!');
    this.toMenu();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // Поворот камеры пальцем по свободной части экрана + кнопка смены вида
  bindCamera() {
    const zone = document.getElementById('camzone');
    let drag = null, lastTap = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (drag) return;
      zone.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, o: this.camOrbit, p: this.camPitch };
      const now = performance.now();
      if (now - lastTap < 300) { this.camOrbit = 0; this.camPitch = 0; }
      lastTap = now;
    });
    zone.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.camOrbit = drag.o - (e.clientX - drag.x) * 0.009;
      this.camPitch = clamp(drag.p + (e.clientY - drag.y) * 0.004, -0.12, 0.9);
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    document.getElementById('cambtn').addEventListener('click', () => {
      this.camMode = (this.camMode + 1) % CAM_MODES.length;
      this.camOrbit = 0; this.camPitch = 0;
      this.save.data.settings.camMode = this.camMode; this.save.changed();
      this.ui.toast('КАМЕРА', CAM_MODES[this.camMode].name);
      this.audio.click();
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.gCam.aspect = w / h; this.gCam.updateProjectionMatrix();
    this.particles.setScale(h * this.renderer.getPixelRatio());
  }

  // ---------- Гараж ----------
  buildGarage(env) {
    const s = (this.gScene = new THREE.Scene());
    s.background = new THREE.Color(0x15151a);
    s.environment = env;
    s.environmentIntensity = 0.8;
    s.fog = new THREE.Fog(0x15151a, 8, 22);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: this.T.concrete, color: 0x6a6a72, roughness: 0.6, metalness: 0.2 }));
    s.add(floor);
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.3, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.25, metalness: 0.9 }));
    disk.position.y = 0.04;
    s.add(disk);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.025, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a1f }));
    ring.position.y = 0.085;
    s.add(ring);
    // неоновые полосы
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4, 0.08), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff5a1f : 0xffb020 }));
      m.position.set(Math.cos(a) * 10, 2, Math.sin(a) * 10);
      s.add(m);
    }
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 8, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x202026, side: THREE.BackSide, roughness: 0.9 }));
    wall.position.y = 4;
    s.add(wall);
    s.add(new THREE.HemisphereLight(0xffffff, 0x333333, 0.6));
    const key = new THREE.SpotLight(0xffffff, 120, 20, 0.6, 0.5);
    key.position.set(3, 6, 4); s.add(key);
    const rim = new THREE.SpotLight(0xff8a3a, 80, 20, 0.7, 0.6);
    rim.position.set(-4, 4, -4); s.add(rim);
    const fill = new THREE.DirectionalLight(0x9fc3ff, 0.8);
    fill.position.set(-3, 2, 5); s.add(fill);
    this.gTurn = new THREE.Group();
    this.gTurn.position.y = 0.08;
    s.add(this.gTurn);
    this.gCam = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 50);
    this.gAngle = 0.8; this.gHeight = 1.1; this.gDrag = null;
    const cv = document.getElementById('gl');
    cv.addEventListener('pointerdown', (e) => { if (this.ui.screen === 'garage') this.gDrag = { x: e.clientX, a: this.gAngle }; });
    cv.addEventListener('pointermove', (e) => { if (this.gDrag) this.gAngle = this.gDrag.a - (e.clientX - this.gDrag.x) * 0.01; });
    window.addEventListener('pointerup', () => (this.gDrag = null));
    this.garageView = null;
  }

  setGarageView(id) {
    this.garageView = id;
    if (this.gBike) { this.gTurn.remove(this.gBike.group); this.gBike = null; }
    if (!id) return;
    const def = BIKES.find((b) => b.id === id);
    this.gBike = new BikeModel(this.T, def, this.save.data.bikes[id].paint);
    this.gBike.group.position.y = 0.55;
    this.gBike.group.traverse((o) => (o.castShadow = false));
    this.gTurn.add(this.gBike.group);
    this.gBike.update(0.1, { wheelSpeed: 0, frontSpeed: 0, steerVis: 0.3, compress: 0, pose: null, crashed: false, lean: 0, seated: true });
  }
  previewPaint(p) { if (this.gBike) this.gBike.setPaint(p); }
  focusPart(part) { this.gHeight = part === 'helmet' || part === 'suit' ? 1.6 : part === 'rims' ? 0.7 : 1.1; }

  // Пересобрать модель байка игрока (после покупки/покраски/улучшения)
  applyBike(rebuild = true) {
    if (this.rag) this.endRagdoll();
    const d = this.save.data;
    const def = BIKES.find((b) => b.id === d.current);
    const bk = d.bikes[def.id];
    this.player.setBike(def, bk.upg);
    this.audio.setMotor(def.motor);
    if (rebuild || !this.bike || this.bike.def !== def) {
      if (this.bike) this.scene.remove(this.bike.group);
      this.bike = new BikeModel(this.T, def, bk.paint);
      this.bike.group.traverse((o) => { if (o.isMesh) o.castShadow = this.quality !== 'low'; });
      this.scene.add(this.bike.group);
    } else this.bike.setPaint(bk.paint);
    if (this.player) {
      const p = this.player;
      p.reset(p.base.x, p.base.y, p.yaw);
    }
  }

  // ---------- Режимы ----------
  onScreen(name) {
    if (name === 'play') this.state = 'play';
    else if (name === 'menu') this.state = 'menu';
    else if (name === 'garage') { this.state = 'garage'; if (!this.garageView) this.setGarageView(this.save.data.current); }
    else if (this.state === 'play') this.state = 'pause';
    this.input.enabled = name === 'play';
    if (name !== 'play') this.input.reset();
  }
  toMenu() {
    this.ui.setScreen('menu');
    this.audio.engine(0, 1, 0, false, false);
  }
  startPlay() {
    this.audio.start();
    this.audio.setEnabled(this.save.data.settings.sound);
    this.ui.setScreen('play');
    if (!this.save.data.tutorial) {
      this.tipI = 0;
      this.tipT = 0.5;
    } else this.tipT = -1;
  }
  pause() {
    if (this.state !== 'play') return;
    this.ui.show('pause');
    this.audio.engine(0, 1, 0, false, false);
  }
  resume() {
    this.ui.setScreen('play');
    this.last = performance.now();
  }
  teleport(spot) {
    if (this.rag) this.endRagdoll();
    this.player.reset(spot.x, spot.z, spot.yaw);
    this.tricks.crash();
    this.ui.combo(null);
    this.skids.break();
    this.camYaw = spot.yaw;
    this.updateBikeVisual(0);
    this.updateCamera(0.016, true);
    this.resume();
    this.ui.toast(spot.name.toUpperCase());
  }

  // ---------- Цикл ----------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.perf(dt);
    const st = this.state;
    if (st === 'play') {
      this.simulate(dt);
      this.renderer.render(this.scene, this.camera);
    } else if (st === 'menu') {
      this.world.update(dt, now / 1000);
      this.traffic.update(dt, null);
      this.people.update(dt, null);
      this.props.updateCoins(dt, null);
      this.bike.update(dt, { wheelSpeed: 0, frontSpeed: 0, steerVis: 0.25, compress: 0, pose: null, crashed: false, lean: 0, seated: true, idle: true });
      this.menuAngle += dt * 0.12;
      const p = this.player.pos;
      this.camera.position.set(p.x + Math.sin(this.menuAngle) * 6.5, p.y + 1.6, p.z + Math.cos(this.menuAngle) * 6.5);
      this.camera.lookAt(p.x, p.y + 0.2, p.z);
      this.camera.fov = 50; this.camera.updateProjectionMatrix();
      this.sky.position.copy(this.camera.position);
      updateSun(this.sun, p);
      this.renderer.render(this.scene, this.camera);
    } else if (st === 'garage') {
      if (!this.gDrag) this.gAngle += dt * 0.25;
      this.gCam.position.set(Math.sin(this.gAngle) * 4.2 + 0.0, lerp(this.gCam.position.y || 1.1, this.gHeight, 0.05), Math.cos(this.gAngle) * 4.2);
      this.gCam.lookAt(0, 0.6, 0);
      // байк смещён влево от панели
      this.gCam.setViewOffset(window.innerWidth, window.innerHeight, window.innerWidth * 0.18, 0, window.innerWidth, window.innerHeight);
      this.renderer.render(this.gScene, this.gCam);
    } else if (st === 'pause') {
      // пауза: перерисовываем редко ради экономии батареи
      this.pauseT = (this.pauseT || 0) + dt;
      if (this.pauseT > 0.25) { this.pauseT = 0; this.renderer.render(this.scene, this.camera); }
    }
  }

  // Динамическое разрешение + FPS
  perf(dt) {
    this.frameEma = lerp(this.frameEma, dt, 0.05);
    this.perfT = (this.perfT || 0) + dt;
    if (this.perfT > 1.5 && (this.state === 'play' || this.state === 'menu')) {
      this.perfT = 0;
      const old = this.dynScale;
      if (this.frameEma > 1 / 42) this.dynScale = Math.max(0.6, this.dynScale - 0.1);
      else if (this.frameEma < 1 / 57) this.dynScale = Math.min(1, this.dynScale + 0.05);
      if (old !== this.dynScale) {
        this.renderer.setPixelRatio(this.basePR * this.dynScale);
        this.particles.setScale(window.innerHeight * this.renderer.getPixelRatio());
      }
      if (this.save.data.settings.fps) {
        document.getElementById('fps').textContent = `${Math.round(1 / this.frameEma)} FPS · ${Math.round(this.dynScale * 100)}%`;
      }
    }
  }

  simulate(dt) {
    const P = this.player, inp = this.input.update(), S = this.save.data.settings;
    // замедление времени на красивых трюках
    let tsTarget = 1;
    if (S.slowmo && !P.grounded && !P.crashed && P.heightAbove > 2.8 && P.airT > 0.3 &&
      (Math.abs(P.pitchRate) > 2.8 || Math.abs(P.spinRate) > 2.8 || P.pose)) tsTarget = 0.55;
    if (this.slowPulse > 0) { this.slowPulse -= dt; tsTarget = Math.min(tsTarget, 0.4); }
    if (P.crashed && P.crashT < 0.6) tsTarget = 0.45;
    this.timeScale = damp(this.timeScale, tsTarget, 6, dt);
    const sdt = dt * this.timeScale;
    // фиксированный шаг физики 240 Гц
    this.acc = (this.acc || 0) + sdt;
    const step = 1 / 240;
    let n = 0;
    while (this.acc >= step && n < 24) {
      P.update(step, inp, S);
      this.acc -= step; n++;
      if (P.events.length) break;
    }
    if (n >= 24) this.acc = 0;
    this.handleEvents();
    // трюки
    if (!P.crashed) {
      if (P.grounded) this.tricks.ground(sdt, P);
      else this.tricks.air(P);
      // машины под байком в полёте
      if (!P.grounded && P.jump) {
        const g = this.world.groundAt(P.pos.x, P.pos.z);
        if (g.shape && g.shape.isCar) P.jump.cars.add(g.shape);
      }
    }
    const busy = !P.grounded || this.tricks.wheelieT > 0 || this.tricks.stoppieT > 0 || this.tricks.gPose;
    this.tricks.tick(sdt, busy && !P.crashed);
    this.ui.live(this.tricks.live);
    // мир
    const hooks = this.hooks || (this.hooks = {
      hit: () => P.crash('Сбит машиной!', 'car'),
      near: () => { this.tricks.nearMiss(); },
      honk: (car) => { if (Math.hypot(car.x - P.pos.x, car.z - P.pos.z) < 20) this.audio.horn(); },
      hitPed: () => P.crash('Осторожно, пешеход!', 'ped'),
    });
    this.world.update(sdt, performance.now() / 1000);
    this.traffic.update(sdt, P, hooks);
    this.people.update(sdt, P, hooks);
    this.props.updateCoins(sdt, P.crashed ? null : P.pos, (c) => {
      this.save.addCoins(c.val);
      this.tricks.coin();
      this.audio.coin();
      this.particles.burst(c.x, c.y - 0.2, c.z, 8, [1, 0.85, 0.3], 3, 0.35);
    });
    // падение
    if (P.crashed) {
      this.updateRagdoll(sdt);
      if (P.crashT > 2.4) { this.endRagdoll(); P.respawn(); this.updateCamera(dt, true); }
    }
    this.updateBikeVisual(sdt);
    this.effects(sdt, inp);
    this.updateCamera(dt);
    this.hud(dt, inp);
    this.audio.engine(P.grounded ? P.speed : Math.hypot(P.vel.x, P.vel.z), P.st.vmax, inp.throttle, !P.grounded && !P.crashed, !P.crashed, this.timeScale);
    this.tips(dt);
  }

  handleEvents() {
    const P = this.player;
    for (const e of P.events) {
      if (e.type === 'takeoff') {
        this.tricks.takeoff();
        this.skids.break();
      } else if (e.type === 'land') {
        const before = this.tricks.combo ? this.tricks.combo.tricks.length : 0;
        const r = this.tricks.land(e, this.world);
        const power = clamp(e.vNormal / P.st.land, 0, 1);
        if (e.airT < 0.25 && e.vNormal < 3) continue;
        this.audio.land(power);
        this.shake = Math.max(this.shake, power * 0.5);
        const col = DUST[P.surf] || DUST[0];
        this.particles.burst(P.pos.x, P.baseY, P.pos.z, 8 + Math.round(power * 20), col, 2 + power * 4, 0.9);
        // показываем лучший трюк приземления
        const c = this.tricks.combo;
        if (c && c.tricks.length > before) {
          const fresh = c.tricks.slice(before).filter((t) => t.kind === 'air' && t.name !== 'Идеальная посадка');
          if (fresh.length) {
            const best = fresh.reduce((a, b) => (b.pts > a.pts ? b : a));
            if (best.pts >= 250) {
              this.ui.toast(best.name.toUpperCase(), (r.perfect ? 'Идеальная посадка · ' : '') + '+' + best.pts);
              this.audio.trick();
            }
          }
        }
        if (r.perfect && r.flips > 0) this.slowPulse = 0.18;
        if (navigator.vibrate && power > 0.5) { try { navigator.vibrate(20); } catch (err) { /* */ } }
      } else if (e.type === 'crash') {
        this.tricks.crash();
        this.ui.combo(null);
        this.ui.toast(e.reason.toUpperCase(), '', true);
        if (e.kind === 'water') {
          this.audio.splash();
          this.particles.splash(P.pos.x, -1.5, P.pos.z);
        } else {
          this.audio.crash();
          this.particles.sparks(P.pos.x, P.pos.y, P.pos.z, 25);
          this.particles.burst(P.pos.x, P.pos.y - 0.4, P.pos.z, 20, DUST[P.surf] || DUST[0], 4, 1);
        }
        this.shake = 0.8;
        this.startRagdoll(e.vel);
        if (navigator.vibrate) { try { navigator.vibrate([30, 40, 30]); } catch (err) { /* */ } }
      } else if (e.type === 'bump') {
        this.shake = Math.max(this.shake, Math.min(0.6, e.power * 0.05));
        this.particles.sparks(P.pos.x, P.pos.y, P.pos.z, 6);
      } else if (e.type === 'respawn') {
        this.ui.combo(null);
        this.skids.break();
      }
    }
    P.events.length = 0;
  }

  // ---------- Падение: райдер и байк летят отдельно ----------
  startRagdoll(vel) {
    const B = this.bike;
    this.scene.attach(B.rider.group);
    const rv = vel.clone().multiplyScalar(0.9).add(new THREE.Vector3((Math.random() - 0.5) * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 2));
    const bv = vel.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 1.5, 0));
    this.rag = [
      { o: B.rider.group, v: rv, w: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10), r: 0.35 },
      { o: B.group, v: bv, w: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 8), r: 0.45 },
    ];
  }
  updateRagdoll(dt) {
    if (!this.rag) return;
    const q = new THREE.Quaternion();
    for (const r of this.rag) {
      r.v.y -= G * dt;
      r.o.position.addScaledVector(r.v, dt);
      const ang = r.w.length();
      if (ang > 0.001) {
        q.setFromAxisAngle(r.w.clone().divideScalar(ang), ang * dt);
        r.o.quaternion.premultiply(q);
      }
      const g = this.world.heightAt(r.o.position.x, r.o.position.z);
      if (r.o.position.y < g + r.r) {
        r.o.position.y = g + r.r;
        if (r.v.y < -2) this.particles.burst(r.o.position.x, g, r.o.position.z, 4, DUST[this.player.surf] || DUST[0], 2, 0.7);
        r.v.y = Math.abs(r.v.y) * 0.3;
        r.v.x *= 0.75; r.v.z *= 0.75;
        r.w.multiplyScalar(0.7);
      }
    }
  }
  endRagdoll() {
    if (!this.rag) return;
    const B = this.bike;
    B.body.add(B.rider.group);
    B.rider.group.position.set(0, 0, 0);
    B.rider.group.quaternion.identity();
    this.rag = null;
  }

  updateBikeVisual(dt) {
    const P = this.player, B = this.bike;
    if (!P.crashed) {
      B.group.position.copy(P.pos);
      B.group.rotation.set(-P.pitch, P.yaw, P.roll, 'YXZ');
    }
    B.update(dt, P.visualState());
    // тень-пятно
    const g = this.world.heightAt(P.pos.x, P.pos.z);
    const h = P.pos.y - g;
    this.blob.position.set(P.pos.x, g + 0.05, P.pos.z);
    this.blob.rotation.y = P.yaw;
    const s = clamp(1.2 - h * 0.05, 0.4, 1.2);
    this.blob.scale.set(s, 1, s * 1.9);
    this.blob.material.opacity = clamp(1 - h * 0.08, 0.15, 1);
    this.blob.visible = !P.crashed;
  }

  effects(dt, inp) {
    const P = this.player;
    this.particles.update(dt);
    this.skids.update(dt);
    if (P.crashed || !P.grounded) return;
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const rx = P.base.x - fx * P.hw, rz = P.base.y - fz * P.hw;
    const ry = P.hr ?? P.baseY;
    const sp = Math.abs(P.speed);
    const soft = P.surf === SURF.DIRT || P.surf === SURF.SAND || P.surf === SURF.GRASS;
    const col = DUST[P.surf] || DUST[0];
    // пыль из-под колеса
    if (soft && (sp > 3 || (inp.throttle && sp < 5))) {
      const rate = (soft ? 0.6 : 0.15) * (inp.throttle ? 1.4 : 0.6) * clamp(sp / 10, 0.3, 1.5) * (P.surf === SURF.GRASS ? 0.5 : 1);
      if (Math.random() < rate) this.particles.dust(rx, ry, rz, -fx * sp, -fz * sp, 1, col);
    }
    // дым при пробуксовке, бёрнауте и дрифте
    if (P.burnout || P.drift) {
      for (let k = 0; k < (P.burnout ? 2 : 1); k++) this.particles.emit(rx + (Math.random() - 0.5) * 0.3, ry + 0.15, rz + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 1.5 - fx * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5 - fz * 1.5, 0.7, 1.6, 0.86, 0.86, 0.9, 0.42, 2.4, -0.4);
      this.skids.add(rx, ry, rz, P.yaw);
    } else if (!soft && inp.throttle && sp < 4 && P.motor === 'gas' && Math.random() < 0.4) this.particles.dust(rx, ry, rz, -fx * 2, -fz * 2, 1, [0.85, 0.85, 0.88]);
    // следы торможения / стоппи / вилли
    if ((inp.brake && sp > 4) || P.s > 0.15 || (P.w > 0.3 && sp > 3) || Math.abs(P.steerVis) > 0.8 && sp > 12) {
      if (P.s > 0.15) this.skids.add(P.base.x + fx * P.hw, P.hf ?? ry, P.base.y + fz * P.hw, P.yaw);
      else this.skids.add(rx, ry, rz, P.yaw);
    } else if (!P.burnout && !P.drift) this.skids.break();
  }

  updateCamera(dt, snap = false) {
    const P = this.player, cam = this.camera, W = this.world;
    const target = P.crashed && this.rag ? this.rag[0].o.position : P.pos;
    const air = !P.grounded && !P.crashed;
    const hs = P.grounded ? Math.abs(P.speed) : Math.hypot(P.vel.x, P.vel.z);
    // направление камеры: по курсу на земле, по скорости в воздухе
    let want = P.yaw;
    if (air && hs > 2 && !P.vertAir) want = Math.atan2(P.vel.x, P.vel.z);
    if (P.crashed || P.vertAir) want = this.camYaw;
    if (P.grounded && P.speed < -0.5) want = P.yaw;
    const yawRate = air ? 1.6 : 3.8;
    this.camYaw += wrapAngle(want - this.camYaw) * (snap ? 1 : clamp(yawRate * dt, 0, 1));
    const mode = CAM_MODES[this.camMode || 0];
    // кинематографичный боковой ракурс в долгом полёте (только вид сзади)
    const sideT = mode.auto && air && P.airT > 0.35 && P.heightAbove > 1.8 ? 0.75 : 0;
    this.camSide = damp(this.camSide, sideT, 1.8, dt);
    if (mode.orbit) this.cinemaA = (this.cinemaA || 0) + dt * 0.3;
    // плавное возвращение пользовательского поворота, если палец отпущен давно
    this.camOrbitS = damp(this.camOrbitS || 0, this.camOrbit || 0, 10, dt);
    this.camPitchS = damp(this.camPitchS || 0, this.camPitch || 0, 10, dt);
    const dist = mode.dist + hs * mode.speedK + this.camSide * 2.2 + (P.crashed ? 2 : 0);
    const height = mode.h + this.camSide * 0.5 + (P.crashed ? 1.5 : 0) + this.camPitchS * dist;
    const a = this.camYaw + Math.PI + mode.side + this.camSide + this.camOrbitS + (mode.orbit ? this.cinemaA : 0);
    const desired = new THREE.Vector3(target.x + Math.sin(a) * dist, target.y + height, target.z + Math.cos(a) * dist);
    // столкновение камеры с препятствиями
    const steps = 8;
    let free = desired.clone();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(target.x, desired.x, t), z = lerp(target.z, desired.z, t), y = lerp(target.y + 0.8, desired.y, t);
      if (W.heightAt(x, z) > y - 0.35) {
        const tt = Math.max(0, (i - 1) / steps);
        free.set(lerp(target.x, desired.x, tt), lerp(target.y + 0.8, desired.y, tt) + 0.4, lerp(target.z, desired.z, tt));
        break;
      }
    }
    const gH = W.heightAt(free.x, free.z);
    if (free.y < gH + 0.7) free.y = gH + 0.7;
    if (snap) this.camPos.copy(free);
    else {
      const k = 1 - Math.exp(-(air ? 6 : 9) * dt);
      this.camPos.lerp(free, k);
    }
    cam.position.copy(this.camPos);
    // тряска
    if (this.shake > 0.001) {
      const s = this.shake;
      cam.position.x += (Math.random() - 0.5) * s * 0.5;
      cam.position.y += (Math.random() - 0.5) * s * 0.5;
      cam.position.z += (Math.random() - 0.5) * s * 0.5;
      this.shake *= Math.exp(-6 * dt);
    }
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const ahead = mode.ahead * (1 - this.camSide * 0.7);
    const look = new THREE.Vector3(target.x + fx * ahead, target.y + mode.look, target.z + fz * ahead);
    if (snap) this.camLook.copy(look); else this.camLook.lerp(look, 1 - Math.exp(-14 * dt));
    cam.lookAt(this.camLook);
    const fov = clamp(mode.fov + hs * 0.5, mode.fov, mode.fov + 18) - (1 - this.timeScale) * 8;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 4, dt); cam.updateProjectionMatrix(); }
    this.sky.position.copy(cam.position);
    updateSun(this.sun, target);
  }

  hud(dt, inp) {
    const P = this.player;
    const hs = P.grounded ? Math.abs(P.speed) : Math.hypot(P.vel.x, P.vel.z);
    this.hudT = (this.hudT || 0) + dt;
    if (this.hudT > 0.05) {
      this.hudT = 0;
      const sp = Math.round(hs * 3.6);
      if (this._sp !== sp || this._gear !== this.audio.gear) { this._sp = sp; this._gear = this.audio.gear; this.drawGauge(sp, this.audio.gear, P.st.vmax * 3.6 * 1.25); }
      // угол вилли / стоппи
      const ang = P.grounded && !P.crashed ? Math.round((P.w > 0.2 ? P.w : P.s > 0.2 ? -P.s : 0) * 57.3) : 0;
      const ae = document.getElementById('angle');
      if (ang !== this._ang) {
        this._ang = ang;
        ae.classList.toggle('show', ang !== 0);
        if (ang) ae.textContent = Math.abs(ang) + '°';
      }
      this.minimap.draw(P, this.traffic.cars);
      document.getElementById('controls').classList.toggle('air', !P.grounded && !P.crashed);
    }
    const vig = (1 - this.timeScale) * 1.6;
    if (Math.abs((this._vig || 0) - vig) > 0.02) { this._vig = vig; document.getElementById('vignette').style.opacity = vig.toFixed(2); }
    const sl = clamp((hs - 17) / 10, 0, 0.8);
    if (Math.abs((this._sl || 0) - sl) > 0.02) { this._sl = sl; document.getElementById('speedlines').style.opacity = sl.toFixed(2); }
  }

  // Стрелочный спидометр с передачей
  drawGauge(sp, gear, max) {
    const c = document.getElementById('gauge');
    const g = c.getContext('2d');
    const W = c.width, H = c.height, cx = W / 2, cy = H - 18, R = 92;
    g.clearRect(0, 0, W, H);
    const a0 = Math.PI * 0.95, a1 = Math.PI * 2.05;
    g.lineCap = 'round';
    g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    const t = Math.min(1, sp / max);
    const grad = g.createLinearGradient(cx - R, 0, cx + R, 0);
    grad.addColorStop(0, '#ffb020'); grad.addColorStop(1, '#ff3b30');
    g.lineWidth = 8; g.strokeStyle = grad;
    g.beginPath(); g.arc(cx, cy, R, a0, a0 + (a1 - a0) * t); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (a1 - a0) * (i / 10);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16)); g.lineTo(cx + Math.cos(a) * (R - (i % 5 ? 10 : 22)), cy + Math.sin(a) * (R - (i % 5 ? 10 : 22))); g.stroke();
    }
    const a = a0 + (a1 - a0) * t;
    g.strokeStyle = '#ff3b30'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
    g.textAlign = 'center';
    g.font = 'italic 900 34px system-ui, sans-serif';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(String(sp), cx, cy - 22); g.fillText(String(sp), cx, cy - 22);
    g.font = 'bold 13px system-ui, sans-serif';
    g.fillStyle = '#ffd35a';
    g.fillText(`(${gear}) км/ч`, cx, cy + 12);
  }

  tips(dt) {
    if (this.tipT < 0) return;
    this.tipT -= dt;
    if (this.tipT <= 0) {
      if (this.tipI >= TIPS.length) {
        this.tipT = -1;
        this.save.data.tutorial = true;
        this.save.changed();
        return;
      }
      this.ui.tip(TIPS[this.tipI++], 5.5);
      this.tipT = 6.5;
    }
  }
}

window.addEventListener('load', () => {
  const g = (window.game = new Game());
  // Отладка/автотесты: пошаговая симуляция без рендера
  window.__test = {
    step(n, dt = 1 / 60) { g.state = 'test'; for (let i = 0; i < n; i++) g.simulate(dt); },
    render() { g.renderer.render(g.scene, g.camera); },
  };
});
