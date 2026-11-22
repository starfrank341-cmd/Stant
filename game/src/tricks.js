// Распознавание трюков, комбо, начисление валюты и задания
import { TAU } from './util.js';
import { TRICK_POSES } from './bike.js';

export const MISSIONS = [
  { id: 'wheelie3', name: 'Вилли 3 секунды', stat: 'maxWheelie', goal: 3, reward: 300, fmt: (v) => v.toFixed(1) + ' с' },
  { id: 'backflip', name: 'Первый бэкфлип', stat: 'backflips', goal: 1, reward: 500 },
  { id: 'jump25', name: 'Прыжок на 25 м', stat: 'maxDist', goal: 25, reward: 600, fmt: (v) => Math.round(v) + ' м' },
  { id: 'stoppie2', name: 'Стоппи 2 секунды', stat: 'maxStoppie', goal: 2, reward: 500, fmt: (v) => v.toFixed(1) + ' с' },
  { id: 'frontflip', name: 'Фронтфлип', stat: 'frontflips', goal: 1, reward: 700 },
  { id: 'car', name: 'Перепрыгни машину', stat: 'carJumps', goal: 1, reward: 700 },
  { id: 'spin', name: 'Вращение 360°', stat: 'spins', goal: 1, reward: 800 },
  { id: 'height10', name: 'Высота 10 м', stat: 'maxHeight', goal: 10, reward: 800, fmt: (v) => v.toFixed(1) + ' м' },
  { id: 'pose5', name: '5 трюков с позой', stat: 'poses', goal: 5, reward: 900 },
  { id: 'combo5', name: 'Комбо ×5', stat: 'maxMult', goal: 5, reward: 1200 },
  { id: 'coins100', name: 'Собери 100 монет', stat: 'coins', goal: 100, reward: 1000 },
  { id: 'superflip', name: 'Супермен во время сальто', stat: 'supermanFlip', goal: 1, reward: 1500 },
  { id: 'perfect10', name: '10 идеальных посадок', stat: 'perfect', goal: 10, reward: 1500 },
  { id: 'double', name: 'Двойной бэкфлип', stat: 'doubleFlip', goal: 1, reward: 2000 },
  { id: 'mega', name: 'Мега-прыжок на 50 м', stat: 'maxDist', goal: 50, reward: 2500, fmt: (v) => Math.round(v) + ' м' },
  { id: 'combo20k', name: 'Комбо на 20 000 очков', stat: 'maxCombo', goal: 20000, reward: 3000 },
];

const FLIP_PREFIX = ['', '', 'Двойной ', 'Тройной ', 'Четверной '];

export class Tricks {
  constructor(save, hooks) {
    this.save = save;
    this.hooks = hooks; // { onTrick, onBank, onLost, onMission, onLive }
    this.combo = null;
    this.comboT = 0;
    this.wheelieT = 0; this.wheelieSweet = 0; this.wheelieOffT = 0;
    this.stoppieT = 0; this.stoppieOffT = 0;
    this.gPose = null; this.gPoseT = 0; this.gPoseW = 0; this.gPoseOff = 0;
    this.live = '';
  }

  get stats() { return this.save.data.stats; }

  stat(k, v, mode = 'max') {
    const S = this.stats;
    if (mode === 'max') S[k] = Math.max(S[k] || 0, v);
    else S[k] = (S[k] || 0) + v;
    this.checkMissions();
  }

  checkMissions() {
    const done = this.save.data.missions;
    for (const m of MISSIONS) {
      if (done[m.id]) continue;
      if ((this.stats[m.stat] || 0) >= m.goal) {
        done[m.id] = true;
        this.save.addCoins(m.reward);
        this.hooks.onMission(m);
      }
    }
  }

  add(name, pts, kind = 'air') {
    if (!this.combo) this.combo = { tricks: [], total: 0 };
    this.combo.tricks.push({ name, pts: Math.round(pts), kind });
    this.combo.total += Math.round(pts);
    this.comboT = 2.6;
    this.hooks.onTrick(name, Math.round(pts), this.combo);
  }

  get mult() { return this.combo ? Math.min(10, this.combo.tricks.length) : 1; }

  // Кадр на земле
  ground(dt, p) {
    const w = p.w, s = p.s;
    // позы на земле: на заднем/переднем колесе очки удваиваются
    if (p.pose && p.poseAmt > 0.7) {
      if (this.gPose && this.gPose !== p.pose) this.endGroundPose();
      this.gPose = p.pose;
      this.gPoseT += dt;
      if (w > 0.3 || s > 0.22) this.gPoseW += dt;
      this.gPoseOff = 0;
      if (this.gPoseT > 0.3) {
        const tp = TRICK_POSES.find((x) => x.id === this.gPose);
        this.live = `${tp.name} ${this.gPoseT.toFixed(1)} с`;
        this.comboT = Math.max(this.comboT, 1.0);
      }
    } else if (this.gPose) {
      this.gPoseOff += dt;
      if (this.gPoseOff > 0.15) this.endGroundPose();
    }
    // вилли
    if (w > 0.3 && p.speed > 1) {
      this.wheelieT += dt;
      if (w > 0.85 && w < 1.3) this.wheelieSweet += dt;
      this.wheelieOffT = 0;
      if (this.wheelieT > 0.4) {
        const tp = this.gPose && TRICK_POSES.find((x) => x.id === this.gPose);
        this.live = `Вилли ${this.wheelieT.toFixed(1)} с` + (tp ? ` + ${tp.name}` : '');
        this.comboT = Math.max(this.comboT, 1.0);
      }
    } else if (this.wheelieT > 0) {
      this.wheelieOffT += dt;
      if (this.wheelieOffT > 0.18) this.endWheelie();
    }
    // стоппи
    if (s > 0.22) {
      this.stoppieT += dt;
      this.stoppieOffT = 0;
      if (this.stoppieT > 0.3) {
        this.live = `Стоппи ${this.stoppieT.toFixed(1)} с`;
        this.comboT = Math.max(this.comboT, 1.0);
      }
    } else if (this.stoppieT > 0) {
      this.stoppieOffT += dt;
      if (this.stoppieOffT > 0.15) this.endStoppie();
    }
  }

  endGroundPose() {
    const t = this.gPoseT;
    const tp = TRICK_POSES.find((x) => x.id === this.gPose);
    if (tp && t > 0.5) {
      const onWheel = this.gPoseW > t * 0.5;
      const pts = (tp.pts * 0.5 + t * 200) * (onWheel ? 2.2 : 1);
      this.add(`${onWheel ? 'Вилли-' : ''}${tp.name} ${t.toFixed(1)} с`, pts, 'ground');
      this.stat('poses', 1, 'add');
    }
    this.gPose = null; this.gPoseT = 0; this.gPoseW = 0; this.live = '';
  }

  endWheelie() {
    const t = this.wheelieT;
    if (t > 0.8) {
      this.add(this.wheelieSweet > t * 0.5 ? `Вилли-баланс ${t.toFixed(1)} с` : `Вилли ${t.toFixed(1)} с`, t * 140 + this.wheelieSweet * 80, 'ground');
      this.stat('maxWheelie', t);
    }
    this.wheelieT = 0; this.wheelieSweet = 0; this.live = '';
  }

  endStoppie() {
    const t = this.stoppieT;
    if (t > 0.5) {
      this.add(`Стоппи ${t.toFixed(1)} с`, t * 220, 'ground');
      this.stat('maxStoppie', t);
    }
    this.stoppieT = 0; this.live = '';
  }

  // Во время полёта — живая подсказка
  air(p) {
    const J = p.jump;
    if (!J) return;
    const flips = Math.floor((Math.abs(J.totalPitch) + 0.9) / TAU);
    const spins = Math.floor((Math.abs(J.totalYaw) + 0.7) / TAU);
    const parts = [];
    if (flips) parts.push((FLIP_PREFIX[flips] ?? flips + 'x ') + (J.totalPitch > 0 ? 'бэкфлип' : 'фронтфлип'));
    if (spins) parts.push(spins * 360 + '°');
    if (p.pose) parts.push(TRICK_POSES.find((t) => t.id === p.pose).name);
    this.live = parts.join(' + ');
  }

  takeoff() {
    if (this.gPose) this.endGroundPose();
    if (this.wheelieT > 0) this.endWheelie();
    if (this.stoppieT > 0) this.endStoppie();
  }

  land(info, world) {
    this.live = '';
    const J = info.J;
    const airT = info.airT;
    let airPts = 0;
    const add = (n, p) => { this.add(n, p); airPts += p; };
    const flips = Math.floor((Math.abs(J.totalPitch) + 0.9) / TAU);
    const spins = Math.floor((Math.abs(J.totalYaw) + 0.7) / TAU);
    if (flips > 0) {
      const back = J.totalPitch > 0;
      const name = (FLIP_PREFIX[flips] ?? flips + 'x ') + (back ? 'бэкфлип' : 'фронтфлип');
      add(name.charAt(0).toUpperCase() + name.slice(1), (back ? 1000 : 1300) * Math.pow(flips, 1.6));
      if (back) this.stat('backflips', 1, 'add'); else this.stat('frontflips', 1, 'add');
      if (flips >= 2 && back) this.stat('doubleFlip', 1, 'add');
      if ((J.poses.superman || 0) > 0.2) this.stat('supermanFlip', 1, 'add');
    }
    if (spins > 0) {
      add(`Вращение ${spins * 360}°`, 650 * Math.pow(spins, 1.5));
      this.stat('spins', 1, 'add');
    }
    if (J.vert) add('Разворот на рампе', 300);
    for (const tp of TRICK_POSES) {
      const t = J.poses[tp.id] || 0;
      if (t > 0.2) {
        add(tp.name + (t > 0.8 ? ` ${t.toFixed(1)} с` : ''), tp.pts + t * 260);
        this.stat('poses', 1, 'add');
      }
    }
    if (airT > 0.9 && !J.vert) add(`Полёт ${airT.toFixed(1)} с`, airT * 110);
    if (J.maxH > 5) { add(`Высота ${J.maxH.toFixed(1)} м`, J.maxH * 45); }
    this.stat('maxHeight', J.maxH);
    if (info.dist > 16 && !J.vert && airT > 0.6) {
      add(`Дальность ${Math.round(info.dist)} м`, info.dist * 13);
      this.stat('maxDist', info.dist);
    }
    if (J.cars.size > 0) {
      const n = J.cars.size;
      add(n === 1 ? 'Через машину' : `Через ${n} машин${n < 5 ? 'ы' : ''}`, 550 * n);
      this.stat('carJumps', n, 'add');
    }
    if (info.dist > 45 && airT > 1.5) add('МЕГА-ПРЫЖОК', 2500);
    if (info.perfect && airPts > 0) {
      this.add('Идеальная посадка', airPts * 0.25);
      this.stat('perfect', 1, 'add');
    }
    return { airPts, perfect: info.perfect, flips };
  }

  nearMiss() { this.add('На волоске!', 180, 'ground'); }
  coin() { this.stat('coins', 1, 'add'); }

  crash() {
    if (this.combo && this.combo.total > 0) this.hooks.onLost(this.combo);
    this.combo = null;
    this.wheelieT = 0; this.stoppieT = 0; this.live = '';
    this.gPose = null; this.gPoseT = 0; this.gPoseW = 0;
  }

  // Завершение комбо и начисление денег
  tick(dt, busy) {
    if (!this.combo) return;
    if (busy) return;
    this.comboT -= dt;
    if (this.comboT <= 0) {
      const m = this.mult;
      const total = this.combo.total * m;
      const coins = Math.max(1, Math.round(total / 10));
      this.save.addCoins(coins);
      this.stat('maxMult', m);
      this.stat('maxCombo', total);
      this.stat('totalScore', total, 'add');
      this.hooks.onBank(this.combo, m, total, coins);
      this.combo = null;
    }
  }
}
