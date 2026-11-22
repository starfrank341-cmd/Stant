// Интерфейс: меню, гараж, пауза, карта, задания, настройки, HUD
import { BIKES, UPGRADES, MAX_UPG, upgCost, PALETTE, FINISHES, PAINT_PARTS, PAINT_COST, KIND_NAMES, upgName, TRICK_SETS, trickInfo } from './bike.js';
import { MISSIONS } from './tricks.js';
import { formatNum } from './util.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

export class UI {
  constructor(game) {
    this.g = game;
    this.save = game.save;
    this.stack = [];
    this.screen = 'loading';
    this.paintPart = 'body';
    this.paintWork = null;
    this.toastT = null;
    this.bindButtons();
    this.save.listeners.push(() => this.updateCoins());
    this.updateCoins();
    this.updateMissionBadge();
  }

  // ---------- Навигация ----------
  show(name, push = true) {
    if (push && this.screen && this.screen !== name) this.stack.push(this.screen);
    this.setScreen(name);
  }
  setScreen(name) {
    for (const id of ['loading', 'menu', 'pause', 'map', 'missions', 'settings', 'garage']) {
      $('#' + id).classList.toggle('show', id === name);
    }
    const playing = name === 'play';
    $('#hud').classList.toggle('hidden', !playing);
    $('#controls').classList.toggle('hidden', !playing);
    this.screen = name;
    this.g.onScreen(name);
    if (name === 'missions') this.renderMissions();
    if (name === 'settings') this.renderSettings();
    if (name === 'garage') this.renderGarage();
    if (name === 'map') this.renderMap();
  }
  back() {
    if (this.screen === 'garage') this.leaveGarage();
    const prev = this.stack.pop() || 'menu';
    this.setScreen(prev);
  }

  bindButtons() {
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.g.audio.click();
      const a = b.dataset.act;
      if (a === 'play') { this.stack = []; this.g.startPlay(); }
      else if (a === 'resume') { this.stack = []; this.g.resume(); }
      else if (a === 'tomenu') { this.stack = []; this.g.toMenu(); }
      else if (a === 'back') this.back();
      else this.show(a);
    });
    $('#pausebtn').addEventListener('click', () => this.g.pause());
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
      $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      for (const t of ['bikes', 'paint', 'upg']) $('#tab-' + t).classList.toggle('hidden', t !== b.dataset.tab);
      if (b.dataset.tab !== 'paint') this.revertPaint();
      this.renderGarage();
    }));
    $('#papply').addEventListener('click', () => this.applyPaint());
    $('#tsetbtn').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const s = this.save.data.settings;
      this.setTrickSet(((s.trickSet || 0) + 1) % TRICK_SETS.length);
      this.g.audio.click();
    });
    this.setTrickSet(this.save.data.settings.trickSet || 0);
    $('#preset').addEventListener('click', () => { this.revertPaint(); this.renderGarage(); });
  }

  // Набор из 4 трюков на кнопках
  setTrickSet(i) {
    const set = TRICK_SETS[i];
    this.save.data.settings.trickSet = i; this.save.changed();
    document.querySelectorAll('.cbtn.trick').forEach((b, k) => {
      const id = set.ids[k];
      b.dataset.k = 't:' + id;
      b.querySelector('small').textContent = trickInfo(id).short;
    });
    $('#tsetbtn small').textContent = set.name;
  }

  updateCoins() {
    $$('.coinval').forEach((e) => (e.textContent = formatNum(this.save.data.coins)));
  }
  updateMissionBadge() {
    const left = MISSIONS.filter((m) => !this.save.data.missions[m.id]).length;
    $$('.mcount').forEach((e) => (e.textContent = left ? left : ''));
  }

  loading(p, text) {
    $('#loadbar').style.width = Math.round(p * 100) + '%';
    if (text) $('#loadtext').textContent = text;
  }

  confirm(text, yes) {
    $('#ctext').textContent = text;
    $('#confirm').classList.add('show');
    const done = (ok) => {
      $('#confirm').classList.remove('show');
      $('#cyes').onclick = $('#cno').onclick = null;
      if (ok) yes();
    };
    $('#cyes').onclick = () => done(true);
    $('#cno').onclick = () => done(false);
  }

  // ---------- Задания ----------
  renderMissions() {
    const S = this.save.data.stats, D = this.save.data.missions;
    $('#mlist').innerHTML = MISSIONS.map((m) => {
      const v = S[m.stat] || 0;
      const done = !!D[m.id];
      const prog = done ? 'Выполнено' : `${m.fmt ? m.fmt(Math.min(v, m.goal)) : formatNum(Math.min(v, m.goal))} / ${m.fmt ? m.fmt(m.goal) : formatNum(m.goal)}`;
      return `<div class="mrow ${done ? 'done' : ''}"><div class="mname">${m.name}<div class="mprog">${prog}</div></div><div class="mrew">◉ ${formatNum(m.reward)}</div></div>`;
    }).join('');
  }

  // ---------- Настройки ----------
  renderSettings() {
    const s = this.save.data.settings;
    $$('#sq button').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === s.quality);
      b.onclick = () => {
        if (s.quality === b.dataset.v) return;
        s.quality = b.dataset.v;
        this.save.changed(); this.save.flush();
        $('#qnote').textContent = 'Графика изменится после перезапуска — перезапускаю...';
        setTimeout(() => location.reload(), 700);
        this.renderSettings();
      };
    });
    const tog = (id, key, fn) => {
      const el = $(id);
      el.classList.toggle('on', !!s[key]);
      el.onclick = () => { s[key] = !s[key]; this.save.changed(); el.classList.toggle('on', !!s[key]); fn && fn(s[key]); };
    };
    tog('#ssound', 'sound', (v) => this.g.audio.setEnabled(v));
    tog('#sslowmo', 'slowmo');
    tog('#sassist', 'assist');
    tog('#sfps', 'fps', (v) => ($('#fps').style.display = v ? '' : 'none'));
    const sens = $('#ssens');
    sens.value = s.sens;
    sens.oninput = () => { s.sens = parseFloat(sens.value); this.g.input.sens = s.sens; this.save.changed(); };
    $('#sreset').onclick = () => this.confirm('Сбросить весь прогресс? Монеты, байки и задания пропадут.', () => {
      try { localStorage.clear(); } catch (e) { /* */ }
      location.reload();
    });
    $('#qnote').textContent = `Текущая графика: ${{ low: 'низкая', med: 'средняя', high: 'высокая' }[this.g.quality]}`;
  }

  // ---------- Карта ----------
  renderMap() {
    const c = $('#bigmap');
    this.g.minimap.drawFull(c, this.g.player);
    const spots = this.g.world.spots;
    $('#spots').innerHTML = spots.map((s, i) => {
      const [u, v] = this.g.minimap.toMap(s.x, s.z);
      return `<button class="spot" data-i="${i}" style="left:${u * 100}%;top:${v * 100}%">${s.icon}</button>`;
    }).join('');
    $('#spotlist').innerHTML = spots.map((s, i) => `<button class="spotrow" data-i="${i}"><b>${s.icon} ${s.name}</b><span>${s.desc}</span></button>`).join('');
    $$('#spots .spot, #spotlist .spotrow').forEach((b) => b.addEventListener('click', () => {
      this.g.audio.click();
      this.stack = [];
      this.g.teleport(spots[+b.dataset.i]);
    }));
  }

  // ---------- Гараж ----------
  renderGarage() {
    const d = this.save.data;
    const tab = document.querySelector('.tabs button.on').dataset.tab;
    const viewId = this.g.garageView || d.current;
    const def = BIKES.find((b) => b.id === viewId);
    $('#gname').innerHTML = `${def.name}<small>${def.desc}</small>`;
    if (tab === 'bikes') {
      const max = { speed: 31 + 6, accel: 13.5 + 3, flip: 6.9 + 1.6, pop: 6 + 1.8 };
      const kind = this.kind || def.kind;
      this.kind = kind;
      const chips = `<div class="chips kindchips">${Object.entries(KIND_NAMES).map(([k, n]) => `<button data-kind="${k}" class="${k === kind ? 'on' : ''}">${k === 'pit' ? '🏍️' : '🛴'} ${n}</button>`).join('')}</div>`;
      const motorTag = (b) => (b.motor === 'electric' ? '<small>⚡ электро</small>' : b.motor === 'kick' ? '<small>🦵 толчками</small>' : '');
      $('#tab-bikes').innerHTML = chips + BIKES.filter((b) => b.kind === kind).map((b) => {
        const own = d.bikes[b.id].owned, cur = d.current === b.id;
        const bar = (n, v, m) => `<div class="stat"><span>${n}</span><div class="sb"><i style="width:${Math.min(100, (v / m) * 100)}%"></i></div></div>`;
        const btn = cur ? '<button class="btn small" disabled>Выбран</button>'
          : own ? `<button class="btn small primary" data-sel="${b.id}">Выбрать</button>`
            : `<button class="btn small primary" data-buy="${b.id}" ${d.coins < b.price ? 'disabled' : ''}>◉ ${formatNum(b.price)}</button>`;
        return `<div class="card ${viewId === b.id ? 'sel' : ''}" data-view="${b.id}"><h3><span>${b.name}${motorTag(b)}</span> ${btn}</h3>
          ${bar('Скорость', b.stats.speed, max.speed)}${bar('Разгон', b.stats.accel, max.accel)}${bar('Сальто', b.stats.flip, max.flip)}${bar('Прыжок', b.stats.pop, max.pop)}</div>`;
      }).join('');
      $$('#tab-bikes [data-kind]').forEach((c) => c.addEventListener('click', () => {
        this.kind = c.dataset.kind;
        const first = BIKES.find((b) => b.kind === this.kind && d.bikes[b.id].owned) || BIKES.find((b) => b.kind === this.kind);
        this.g.setGarageView(first.id);
        this.renderGarage();
      }));
      $$('#tab-bikes [data-view]').forEach((c) => c.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        this.g.setGarageView(c.dataset.view);
        this.renderGarage();
      }));
      $$('#tab-bikes [data-sel]').forEach((b) => b.addEventListener('click', () => {
        d.current = b.dataset.sel; this.save.changed();
        this.g.applyBike(); this.g.setGarageView(d.current); this.renderGarage();
      }));
      $$('#tab-bikes [data-buy]').forEach((b) => b.addEventListener('click', () => {
        const def2 = BIKES.find((x) => x.id === b.dataset.buy);
        this.confirm(`Купить ${def2.name} за ${formatNum(def2.price)} монет?`, () => {
          if (!this.save.spend(def2.price)) return;
          d.bikes[def2.id].owned = true; d.current = def2.id; this.save.changed();
          this.g.tricks.stat('owned', BIKES.filter((x) => d.bikes[x.id].owned).length);
          this.g.audio.buy();
          this.g.applyBike(); this.g.setGarageView(d.current); this.renderGarage();
        });
      }));
    } else if (tab === 'paint') {
      if (viewId !== d.current) this.g.setGarageView(d.current);
      const bk = this.save.bike();
      if (!this.paintWork) this.paintWork = { ...bk.paint };
      const P = this.paintWork;
      const style = P.style || 'street';
      $('#pstyle').innerHTML = [['street', '🧢 Улица'], ['moto', '⛑️ Мото']].map(([id, n]) => `<button data-style="${id}" class="${style === id ? 'on' : ''}">${n}</button>`).join('');
      $$('#pstyle button').forEach((b) => b.onclick = () => { P.style = b.dataset.style; this.g.previewPaint(P); this.renderGarage(); });
      $('#pparts').innerHTML = PAINT_PARTS.map((p) => `<button data-part="${p.id}" class="${p.id === this.paintPart ? 'on' : ''}">${p.name}</button>`).join('');
      $('#ppal').innerHTML = PALETTE.map((c) => `<button data-col="${c}" style="background:${c}" class="${P[this.paintPart] === c ? 'on' : ''}"></button>`).join('');
      $('#pfin').innerHTML = FINISHES.map((f) => `<button data-fin="${f.id}" class="${P.finish === f.id ? 'on' : ''}">${f.name}</button>`).join('');
      const changed = JSON.stringify(P) !== JSON.stringify(bk.paint);
      $('#papply').textContent = changed ? `Применить — ◉ ${PAINT_COST}` : 'Применить';
      $('#papply').disabled = !changed || d.coins < PAINT_COST;
      $('#preset').disabled = !changed;
      $$('#pparts button').forEach((b) => b.onclick = () => { this.paintPart = b.dataset.part; this.renderGarage(); this.g.focusPart(this.paintPart); });
      $$('#ppal button').forEach((b) => b.onclick = () => { P[this.paintPart] = b.dataset.col; this.g.previewPaint(P); this.renderGarage(); });
      $$('#pfin button').forEach((b) => b.onclick = () => { P.finish = b.dataset.fin; this.g.previewPaint(P); this.renderGarage(); });
    } else {
      if (viewId !== d.current) this.g.setGarageView(d.current);
      const bk = this.save.bike();
      $('#tab-upg').innerHTML = UPGRADES.map((u) => {
        const lvl = bk.upg[u.id];
        const cost = upgCost(u, lvl);
        const pips = Array.from({ length: MAX_UPG }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
        const btn = lvl >= MAX_UPG ? '<button class="btn small" disabled>Макс.</button>'
          : `<button class="btn small primary" data-upg="${u.id}" ${d.coins < cost ? 'disabled' : ''}>◉ ${formatNum(cost)}</button>`;
        return `<div class="card upg"><div class="info"><b>${upgName(u, BIKES.find((b) => b.id === d.current))}</b><span>${u.desc}</span><div class="pips">${pips}</div></div>${btn}</div>`;
      }).join('');
      $$('#tab-upg [data-upg]').forEach((b) => b.addEventListener('click', () => {
        const u = UPGRADES.find((x) => x.id === b.dataset.upg);
        const lvl = bk.upg[u.id];
        if (!this.save.spend(upgCost(u, lvl))) return;
        bk.upg[u.id] = lvl + 1;
        this.save.changed();
        this.g.audio.buy();
        this.g.applyBike(false);
        this.renderGarage();
      }));
    }
  }

  applyPaint() {
    const bk = this.save.bike();
    if (!this.paintWork || !this.save.spend(PAINT_COST)) return;
    bk.paint = { ...this.paintWork };
    this.save.changed();
    this.g.audio.buy();
    this.g.applyBike(false);
    this.renderGarage();
  }
  revertPaint() {
    this.paintWork = null;
    this.g.previewPaint(this.save.bike().paint);
  }
  leaveGarage() {
    this.revertPaint();
    this.g.setGarageView(null);
  }

  // ---------- HUD ----------
  toast(text, sub = '', bad = false) {
    const t = $('#toast');
    t.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    t.classList.toggle('bad', bad);
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }
  bank(text, lost = false) {
    const b = $('#bank');
    b.textContent = text;
    b.classList.toggle('lost', lost);
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }
  combo(c, mult) {
    if (!c) { $('#combolist').textContent = ''; $('#combototal').innerHTML = ''; return; }
    const names = c.tricks.slice(-3).map((t) => t.name);
    if (c.tricks.length > 3) names.unshift('…');
    $('#combolist').textContent = names.join(' + ');
    $('#combototal').innerHTML = `${formatNum(c.total)}${mult > 1 ? `<b>× ${mult}</b>` : ''}`;
  }
  live(text) {
    const l = $('#live');
    if (l._t !== text) { l.textContent = text; l._t = text; }
  }
  tip(text, dur = 4) {
    const t = $('#tip');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._tipT);
    this._tipT = setTimeout(() => t.classList.remove('show'), dur * 1000);
  }
}
