// Сохранение прогресса (localStorage внутри WebView)
import { BIKES, defaultPaint } from './bike.js';

const KEY = 'stant_save_v1';

function fresh() {
  const bikes = {};
  BIKES.forEach((b, i) => { bikes[b.id] = { owned: i === 0, upg: { engine: 0, susp: 0, tires: 0, balance: 0 }, paint: defaultPaint(i) }; });
  return {
    coins: 500,
    current: BIKES[0].id,
    bikes,
    missions: {},
    stats: {},
    settings: { quality: 'auto', sound: true, slowmo: true, assist: true, fps: false, sens: 1 },
    tutorial: false,
  };
}

export class Save {
  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const f = fresh();
        this.data = { ...f, ...d, settings: { ...f.settings, ...(d.settings || {}) }, bikes: { ...f.bikes, ...(d.bikes || {}) } };
      }
    } catch (e) { /* хранилище недоступно — играем без сохранения */ }
    this.listeners = [];
    this._t = null;
  }
  addCoins(n) {
    this.data.coins = Math.max(0, Math.round(this.data.coins + n));
    this.changed();
  }
  spend(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.changed();
    return true;
  }
  bike(id = this.data.current) { return this.data.bikes[id]; }
  changed() {
    for (const l of this.listeners) l(this.data);
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 400);
  }
  flush() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* нет места */ }
  }
}
