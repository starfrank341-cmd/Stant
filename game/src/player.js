// Аркадная физика питбайка: езда, вилли/стоппи, полёт, вращения, посадка, падения
import * as THREE from 'three';
import { clamp, damp, wrapAngle, lerp, smoothstep, TAU } from './util.js';
import { SURF, WATER_LEVEL } from './world.js';

export const G = 14; // «лёгкая» гравитация — полёты дольше и красивее
const HC = 0.55; // высота центра масс над линией контакта колёс
const SURF_PARAMS = {
  [SURF.ASPHALT]: { drag: 0.25, vmax: 1, grip: 1 },
  [SURF.CONCRETE]: { drag: 0.28, vmax: 1, grip: 1 },
  [SURF.WOOD]: { drag: 0.3, vmax: 1, grip: 1 },
  [SURF.METAL]: { drag: 0.3, vmax: 1, grip: 0.95 },
  [SURF.GRASS]: { drag: 0.9, vmax: 0.84, grip: 0.85 },
  [SURF.DIRT]: { drag: 0.55, vmax: 0.93, grip: 0.9 },
  [SURF.SAND]: { drag: 1.5, vmax: 0.72, grip: 0.75 },
};

const _g = { h: 0, surf: 0, shape: null };

export class Player {
  constructor(world, def, upg) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.base = new THREE.Vector2(); // середина между колёсами на земле
    this.events = [];
    this.setBike(def, upg);
    this.reset(0, 0, 0);
  }

  setBike(def, upg) {
    this.def = def;
    const s = def.stats, u = upg || {};
    const e = u.engine || 0, sp = u.susp || 0, t = u.tires || 0, b = u.balance || 0;
    this.st = {
      vmax: s.speed + e * 1.1,
      accel: s.accel + e * 0.55,
      turn: s.turn + t * 0.1,
      grip: 1 + t * 0.05,
      flip: s.flip + b * 0.32,
      spin: s.spin + b * 0.32,
      pop: s.pop + sp * 0.35,
      land: s.land + sp * 1.3,
    };
    this.hw = def.base / 2;
    this.R = def.wheel;
  }

  reset(x, z, yaw, y = null) {
    this.base.set(x, z);
    this.yaw = yaw;
    this.speed = 0;
    this.pitch = 0; this.roll = 0;
    this.w = 0; this.wr = 0; this.s = 0; this.sr = 0;
    this.pitchRate = 0; this.spinRate = 0;
    this.grounded = true;
    this.crashed = false; this.crashT = 0;
    this.pose = null; this.poseAmt = 0;
    this.charge = 0; this.compress = 0;
    this.airT = 0; this.vertAir = false;
    this.steerVis = 0;
    this.lean = 0;
    this.surf = SURF.ASPHALT;
    this.gp = 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const hr = this.world.groundAt(x - fx * this.hw, z - fz * this.hw).h;
    const hf = this.world.groundAt(x + fx * this.hw, z + fz * this.hw).h;
    this.baseY = (hr + hf) / 2;
    if (y !== null) this.baseY = Math.max(this.baseY, y);
    this.vyBase = 0;
    this.leadH = Math.max(hr, hf);
    this.gp = Math.atan2(hf - hr, this.hw * 2);
    this.computeCOM(hr, hf);
    this.safeT = 0;
    this.lastSafe = { x, z, yaw };
    this.jump = null;
    this.idleT = 0;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  // Центр масс из точек опоры (с учётом вилли/стоппи)
  computeCOM(hr, hf) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hw = this.hw;
    const p = this.gp + this.w - this.s;
    this.pitch = p;
    const c = Math.cos(p), s = Math.sin(p);
    let px, pz, py, fwd, up;
    if (this.s > 0.001) {
      px = this.base.x + fx * hw; pz = this.base.y + fz * hw; py = hf;
      fwd = -hw * c - HC * s; up = -hw * s + HC * c;
    } else {
      px = this.base.x - fx * hw; pz = this.base.y - fz * hw; py = hr;
      fwd = hw * c - HC * s; up = hw * s + HC * c;
    }
    this.pos.set(px + fx * fwd, py + up, pz + fz * fwd);
  }

  update(dt, inp, settings) {
    if (this.crashed) { this.crashT += dt; return; }
    if (this.grounded) this.updateGround(dt, inp, settings.assist);
    else this.updateAir(dt, inp, settings);
    // граница карты
    const L = 445;
    if (Math.abs(this.pos.x) > L || Math.abs(this.pos.z) > L) {
      const cx = clamp(this.pos.x, -L, L), cz = clamp(this.pos.z, -L, L);
      this.base.x += cx - this.pos.x; this.base.y += cz - this.pos.z;
      this.pos.x = cx; this.pos.z = cz;
      this.speed *= 0.5; this.vel.x *= -0.3; this.vel.z *= -0.3;
    }
    // вода
    if (this.pos.y < WATER_LEVEL + 0.35 && this.world.isWater(this.pos.x, this.pos.z)) {
      this.crash('Всплеск!', 'water');
    }
  }

  updateGround(dt, inp, assist) {
    const st = this.st, W = this.world, hw = this.hw;
    const sp = SURF_PARAMS[this.surf] || SURF_PARAMS[0];
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.lean = damp(this.lean, inp.lean, 8, dt);
    // --- Двигатель / тормоз ---
    const vmax = st.vmax * sp.vmax;
    let a = 0;
    if (inp.throttle > 0 && this.speed < vmax) {
      const r = clamp(this.speed / vmax, 0, 1);
      a += st.accel * inp.throttle * (1 - r * r * 0.85);
    }
    if (inp.brake > 0) {
      if (this.speed > 0.6) a -= 17 * inp.brake * (this.w > 0.2 ? 0.4 : 1);
      else if (this.speed > -4) a -= 5 * inp.brake;
    }
    const sgn = Math.sign(this.speed);
    a -= sgn * (sp.drag + 0.0016 * this.speed * this.speed);
    a -= G * Math.sin(this.gp);
    if (this.speed > vmax && this.gp > -0.05) a -= (this.speed - vmax) * 0.35; // разгон под горку не ограничиваем
    const prevSpeed = this.speed;
    this.speed += a * dt;
    if (inp.throttle === 0 && inp.brake === 0 && Math.abs(this.speed) < 0.35 && Math.abs(this.gp) < 0.08) this.speed = 0;
    if (Math.sign(this.speed) !== Math.sign(prevSpeed) && inp.brake > 0 && prevSpeed > 0) this.speed = 0;
    // --- Руление ---
    const as = Math.abs(this.speed);
    const turn = st.turn * sp.grip * st.grip * clamp(as / 2.5, 0, 1) / (1 + as / 20) * (this.w > 0.35 ? 0.55 : 1) * (this.s > 0.2 ? 0.4 : 1);
    this.yaw -= inp.steer * turn * dt * (this.speed >= 0 ? 1 : -1);
    this.steerVis = damp(this.steerVis, inp.steer, 10, dt);
    this.roll = damp(this.roll, inp.steer * clamp(as / 10, 0, 1) * 0.42, 6, dt);

    // --- Вилли ---
    const PHI = 0.37;
    let wa = 0;
    const leanBack = Math.max(0, this.lean), leanFwd = Math.max(0, -this.lean);
    if (this.s < 0.02) {
      const fade = 1 - smoothstep(0.95, 1.3, this.w);
      wa += (leanBack * 8.5 + inp.throttle * (this.speed < vmax * 0.97 ? 4.5 : 1.5)) * (assist ? 0.35 + 0.65 * fade : 1);
      wa -= leanFwd * 7;
      wa -= 10 * Math.cos(this.w + PHI);
      // помощь: удержание вилли около точки баланса
      if (assist && this.w > 0.98) wa -= (this.w - 0.98) * 26;
      wa -= (assist ? 4.2 : 2.8) * this.wr;
      this.wr += wa * dt;
      this.w += this.wr * dt;
      if (this.w <= 0) {
        if (this.wr < -2.5) this.compress = Math.min(1, this.compress + 0.4);
        this.w = 0; this.wr = 0;
      }
      if (assist && this.w > 1.38) { this.w = 1.38; this.wr = Math.min(this.wr, 0); }
      if (this.w > 1.52) { this.crash('Перевернулся!', 'loop'); return; }
    }
    // --- Стоппи ---
    if (this.w < 0.02) {
      let sa = 0;
      const can = this.speed > 1.5 && inp.brake > 0;
      sa += can ? leanFwd * 7.5 * inp.brake + inp.brake * clamp(this.speed / 8, 0, 1) * 3.5 : 0;
      sa -= leanBack * 5;
      sa -= 10.5 * Math.cos(this.s + 0.6);
      sa -= 3 * this.sr;
      this.sr += sa * dt;
      this.s += this.sr * dt;
      if (this.s <= 0) { this.s = 0; this.sr = 0; }
      if (this.s > 1.2) { this.crash('Через руль!', 'stoppie'); return; }
      if (this.s > 0.1 && this.speed > 0) this.speed = Math.max(0, this.speed - 4 * dt);
    }

    // --- Прыжок (подгрузка подвески) ---
    let pop = 0;
    if (inp.jump) {
      this.charge = Math.min(1, this.charge + dt * 2.6);
    } else if (this.charge > 0) {
      pop = st.pop * (0.55 + 0.45 * this.charge);
      this.charge = 0;
    }
    this.compress = damp(this.compress, this.charge * 0.7, 12, dt);

    // --- Движение ---
    const dist = this.speed * Math.cos(this.gp) * dt;
    let nx = this.base.x + fx * dist, nz = this.base.y + fz * dist;
    const lead = this.speed >= 0 ? 1 : -1;
    const probe = (x, z) => {
      const hr = W.groundAt(x - fx * hw, z - fz * hw, _g).h;
      const sr = _g.surf;
      const hf = W.groundAt(x + fx * hw, z + fz * hw, _g).h;
      return { hr, hf, surf: lead > 0 ? _g.surf : sr, shape: _g.shape };
    };
    let g = probe(nx, nz);
    const allowed = 0.34 + Math.abs(dist) * 4.7;
    const leadNew = lead > 0 ? g.hf : g.hr;
    if (leadNew - this.leadH > allowed) {
      // стена: пробуем скользить вдоль
      const gx = probe(this.base.x + fx * dist, this.base.y);
      const gz = probe(this.base.x, this.base.y + fz * dist);
      const okX = (lead > 0 ? gx.hf : gx.hr) - this.leadH <= allowed;
      const okZ = (lead > 0 ? gz.hf : gz.hr) - this.leadH <= allowed;
      let blocked;
      if (okX && Math.abs(fx) > 0.2) { nx = this.base.x + fx * dist; nz = this.base.y; g = gx; blocked = Math.abs(fz); }
      else if (okZ && Math.abs(fz) > 0.2) { nx = this.base.x; nz = this.base.y + fz * dist; g = gz; blocked = Math.abs(fx); }
      else { blocked = 1; }
      const impact = Math.abs(this.speed) * blocked;
      if (impact > 9.5) { this.crash('Врезался!', 'wall'); return; }
      if (blocked >= 1) {
        this.speed = -this.speed * 0.25;
        this.emit('bump', { power: impact });
        return this.computeCOM(this.hr ?? this.baseY, this.hf ?? this.baseY);
      }
      this.speed *= 1 - blocked * 0.6 * dt * 10;
      if (impact > 3) this.emit('bump', { power: impact * 0.5 });
    }
    const hm = (g.hr + g.hf) / 2;
    const predicted = this.baseY + this.vyBase * dt - 0.5 * G * dt * dt;
    this.base.set(nx, nz);
    this.surf = g.surf;
    // кривизна: на выпуклом переломе (край трамплина) байк отрывается, если v²·k > g
    const newGp = Math.atan2(g.hf - g.hr, hw * 2);
    const ds = Math.max(Math.abs(dist), 1e-4);
    const k = (this.gp - newGp) / ds;
    this.landCool = Math.max(0, (this.landCool || 0) - dt);
    const crest = this.landCool <= 0 && this.speed > 4 && k > 0.1 && this.speed * this.speed * k > G * Math.cos(newGp) * 1.3;
    // --- Отрыв (трамплин или прыжок) ---
    if (pop > 0 || crest || hm < predicted - 0.04) {
      const vh = this.speed * Math.cos(this.gp);
      let vy = this.speed * Math.sin(this.gp) + pop;
      if (pop > 0 && this.vyBase > 0) vy = Math.max(vy, this.vyBase + pop);
      this.takeoff(vh, vy, g, pop > 0);
      return;
    }
    const prevGp = this.gp;
    this.gp = Math.atan2(g.hf - g.hr, hw * 2);
    this.vyBase = clamp((hm - this.baseY) / dt, -40, 40);
    this.baseY = hm;
    this.leadH = lead > 0 ? g.hf : g.hr;
    this.onShape = g.shape;
    this.hr = g.hr; this.hf = g.hf;
    this.computeCOM(g.hr, g.hf);
    // безопасная точка для респауна
    this.safeT += dt;
    if (this.safeT > 1 && this.w < 0.2 && this.s < 0.1 && as > 1.5 && Math.abs(this.gp) < 0.15) {
      this.safeT = 0;
      this.lastSafe = { x: this.base.x, z: this.base.y, yaw: this.yaw };
    }
    this.idleT = as < 0.3 && !inp.throttle ? this.idleT + dt : 0;
    this.gpRate = (this.gp - prevGp) / dt;
  }

  takeoff(vh, vy, g, popped) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.grounded = false;
    this.airT = 0;
    this.vertAir = false;
    // крутая рампа (квотерпайп) — вертикальный вылет с разворотом
    if (this.gp > 0.95 && !popped && this.speed > 3) {
      this.vertAir = true;
      const v = this.speed;
      this.vel.set(-fx * 0.9, v * 0.98, -fz * 0.9);
      this.vert = { yaw0: this.yaw, p0: this.pitch, T: (2 * v * 0.98) / G, dir: this.steerVis >= 0 ? -1 : 1 };
    } else {
      this.vel.set(fx * vh, vy, fz * vh);
    }
    this.pitchRate = this.wr * 0.6 + (popped ? 0 : clamp(this.gpRate || 0, -2, 2) * 0.3);
    this.spinRate = 0;
    this.w = 0; this.wr = 0; this.s = 0; this.sr = 0;
    this.jump = {
      x: this.pos.x, z: this.pos.z, y0: this.baseY, maxH: 0, totalPitch: this.pitch - this.gp, totalYaw: 0,
      poses: {}, cars: new Set(), vert: this.vertAir, megaStart: false,
    };
    this.emit('takeoff', { popped });
  }

  updateAir(dt, inp, settings) {
    const st = this.st, W = this.world, hw = this.hw;
    this.airT += dt;
    this.vel.y -= G * dt;
    this.vel.x *= 1 - 0.02 * dt; this.vel.z *= 1 - 0.02 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.lean = damp(this.lean, inp.lean, 10, dt);
    const J = this.jump;
    // --- Вращение ---
    if (this.vertAir) {
      const V = this.vert;
      const e = smoothstep(0.1, 0.85, this.airT / V.T);
      const prevYaw = this.yaw;
      this.yaw = V.yaw0 + Math.PI * e * V.dir;
      this.pitch = lerp(V.p0, -V.p0 * 0.92, e);
      J.totalYaw += 0; // разворот не считается вращением
      this.spinRate = (this.yaw - prevYaw) / dt;
    } else {
      const flipAcc = 16;
      if (Math.abs(inp.lean) > 0.1) {
        this.pitchRate += inp.lean * flipAcc * dt;
        this.pitchRate = clamp(this.pitchRate, -st.flip, st.flip);
      } else {
        this.pitchRate *= Math.exp(-2.2 * dt);
        // помощь в выравнивании под склон приземления
        if (settings.assist) {
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          const gr = W.groundAt(this.pos.x - fx * 1.5, this.pos.z - fz * 1.5).h;
          const gf = W.groundAt(this.pos.x + fx * 1.5, this.pos.z + fz * 1.5).h;
          const target = Math.atan2(gf - gr, 3);
          const pn = wrapAngle(this.pitch);
          const diff = wrapAngle(target - pn);
          if (Math.abs(diff) < 1.0) {
            this.pitchRate = damp(this.pitchRate, diff * 2.4, 3, dt);
          }
        }
      }
      const dp = this.pitchRate * dt;
      this.pitch += dp;
      J.totalPitch += dp;
      const spinTarget = -inp.steer * st.spin;
      this.spinRate = damp(this.spinRate, spinTarget, 5, dt);
      if (Math.abs(inp.steer) < 0.1) this.spinRate = damp(this.spinRate, 0, 3, dt);
      // подкрутка к ближайшему кратному обороту (удобство посадки)
      const vy = Math.atan2(this.vel.x, this.vel.z);
      if (Math.abs(inp.steer) < 0.1 && Math.abs(this.spinRate) < 2.5) {
        const d = wrapAngle(vy - this.yaw);
        this.spinRate = damp(this.spinRate, d * 3, 4, dt);
      }
      const dy = this.spinRate * dt;
      this.yaw += dy;
      J.totalYaw += dy;
    }
    this.roll = damp(this.roll, 0, 4, dt);
    this.steerVis = damp(this.steerVis, inp.steer * 0.5, 6, dt);
    // --- Позы трюков ---
    if (inp.trick && (!this.pose || this.pose === inp.trick)) {
      this.pose = inp.trick;
      this.poseAmt = Math.min(1, this.poseAmt + dt * 4.5);
      if (this.poseAmt > 0.7) J.poses[this.pose] = (J.poses[this.pose] || 0) + dt;
    } else if (this.pose) {
      this.poseAmt = Math.max(0, this.poseAmt - dt * 6);
      if (this.poseAmt <= 0) this.pose = null;
    }
    this.compress = damp(this.compress, 0, 6, dt);
    // --- Высота над точкой отрыва ---
    const gc = W.groundAt(this.pos.x, this.pos.z, _g);
    const gcH = gc.h;
    J.maxH = Math.max(J.maxH, this.pos.y - Math.max(J.y0, gcH) - HC);
    this.heightAbove = this.pos.y - gcH;
    // --- Удар о стену в воздухе ---
    if (gcH > this.pos.y + 0.7) {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 7) { this.crash('Врезался!', 'wall'); return; }
      this.pos.x -= this.vel.x * dt * 2; this.pos.z -= this.vel.z * dt * 2;
      this.vel.x *= -0.3; this.vel.z *= -0.3;
      return;
    }
    // --- Контакт с землёй ---
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const Fx = fx * cp, Fy = sp, Fz = fz * cp; // вперёд
    const Ux = -fx * sp, Uy = cp, Uz = -fz * sp; // вверх
    const wy = -HC + this.R;
    const rx = this.pos.x + Ux * wy - Fx * hw, ry = this.pos.y + Uy * wy - Fy * hw, rz = this.pos.z + Uz * wy - Fz * hw;
    const fX = this.pos.x + Ux * wy + Fx * hw, fY = this.pos.y + Uy * wy + Fy * hw, fZ = this.pos.z + Uz * wy + Fz * hw;
    const gr = W.groundAt(rx, rz).h, gf = W.groundAt(fX, fZ).h;
    const bodyHit = this.pos.y - gcH < 0.3;
    if ((ry - this.R <= gr || fY - this.R <= gf || bodyHit) && this.vel.y < 2 && this.airT > 0.07) {
      this.land(gr, gf, gc);
    }
  }

  land() {
    const W = this.world, hw = this.hw;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hr = W.groundAt(this.pos.x - fx * hw, this.pos.z - fz * hw, _g).h;
    const surf = _g.surf;
    const hf = W.groundAt(this.pos.x + fx * hw, this.pos.z + fz * hw).h;
    const gp = Math.atan2(hf - hr, hw * 2);
    const pn = wrapAngle(this.pitch);
    const diff = wrapAngle(pn - gp);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const velYaw = Math.atan2(this.vel.x, this.vel.z);
    const hd = Math.abs(wrapAngle(this.yaw - velYaw));
    const vh = hs * Math.cos(hd);
    const vAlong = vh * Math.cos(gp) + this.vel.y * Math.sin(gp);
    const vNormal = vh * Math.sin(gp) - this.vel.y * Math.cos(gp);
    const J = this.jump;
    const info = {
      airT: this.airT, diff, impact: vNormal, J,
      dist: Math.hypot(this.pos.x - J.x, this.pos.z - J.z),
    };
    let reason = null;
    if (this.pose && this.poseAmt > 0.4) reason = 'Не успел в седло!';
    else if (Math.abs(diff) > 0.62) reason = diff > 0 ? 'Упал на спину!' : 'Клюнул носом!';
    else if (hd > 0.75 && hs > 3) reason = 'Боком!';
    else if (vNormal > this.st.land) reason = 'Жёсткая посадка!';
    if (reason) {
      this.crash(reason, 'land', info);
      return;
    }
    // успешная посадка
    this.grounded = true;
    this.vertAir = false;
    this.speed = Math.max(vAlong, 0) * (0.985 - Math.abs(diff) * 0.15);
    this.gp = gp;
    this.base.set(this.pos.x, this.pos.z);
    this.baseY = (hr + hf) / 2;
    this.vyBase = vAlong * Math.sin(gp);
    this.leadH = hf;
    this.surf = surf;
    this.w = Math.max(0, diff) * 0.9;
    this.wr = 0;
    this.s = Math.max(0, -diff) * 0.5;
    this.sr = -1;
    this.pitchRate = 0; this.spinRate = 0;
    this.pose = null; this.poseAmt = 0;
    this.compress = clamp(vNormal / this.st.land, 0.15, 1);
    this.landCool = 0.15;
    this.computeCOM(hr, hf);
    info.perfect = Math.abs(diff) < 0.16 && hd < 0.25;
    info.vNormal = vNormal;
    this.emit('land', info);
    this.jump = null;
  }

  crash(reason, kind, info = null) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashT = 0;
    const v = this.grounded
      ? new THREE.Vector3(Math.sin(this.yaw) * this.speed, 2 + Math.abs(this.speed) * 0.15, Math.cos(this.yaw) * this.speed)
      : this.vel.clone();
    this.crashVel = v;
    this.grounded = false;
    this.emit('crash', { reason, kind, info, vel: v.clone() });
  }

  respawn(spot) {
    const s = spot || this.lastSafe;
    this.reset(s.x, s.z, s.yaw);
    this.emit('respawn');
  }

  // Состояние для визуала
  visualState() {
    return {
      wheelSpeed: this.grounded ? this.speed : this.speed * 0.98,
      frontSpeed: this.grounded && this.w < 0.05 ? this.speed : this.speed * 0.9,
      steerVis: this.steerVis,
      compress: this.compress,
      pose: this.poseAmt > 0.05 ? this.pose : null,
      crashed: this.crashed,
      lean: this.grounded ? this.lean + this.w * 0.8 - this.s * 0.8 : this.lean * 0.6,
      seated: this.grounded && Math.abs(this.speed) < 6 && this.w < 0.1,
      idle: this.grounded && this.idleT > 1.5,
    };
  }
}
export { TAU };
