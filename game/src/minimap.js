// Миникарта и большая карта (статичная подложка рисуется один раз)
import { ROAD_LINES } from './world.js';

const EXT = 450;

export class Minimap {
  constructor(world) {
    this.world = world;
    const S = 720;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const k = S / (EXT * 2);
    const X = (x) => (x + EXT) * k, Z = (z) => (z + EXT) * k;
    // фон: трава с горами по краям
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
    g.addColorStop(0, '#4e7a3c'); g.addColorStop(0.75, '#5d7a44'); g.addColorStop(1, '#7a6a52');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    // зоны
    const zone = (x0, x1, z0, z1, col) => { ctx.fillStyle = col; ctx.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); };
    zone(-86, 86, -286, -114, '#8a6a48'); // MX
    zone(114, 286, -286, -114, '#9a7f5c'); // стройка
    zone(-286, -114, -286, -114, '#4a7038'); // холмы
    for (const p of world.pads) zone(p.x0, p.x1, p.z0, p.z1, p.color);
    // озеро
    ctx.fillStyle = '#e6d39c';
    ctx.beginPath(); ctx.ellipse(X(0), Z(200), 86 * k, 54 * k, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a8fb5';
    ctx.beginPath(); ctx.ellipse(X(0), Z(200), 70 * k, 42 * k, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e6d39c';
    ctx.beginPath(); ctx.arc(X(0), Z(200), 12 * k, 0, 7); ctx.fill();
    // объекты (здания, рампы)
    for (const s of world.shapes) {
      if (s.type === 'cyl') continue;
      const [x0, z0, x1, z1] = s.bounds;
      const tall = s.top > 6;
      ctx.fillStyle = s.type === 'box' ? (tall ? '#d8d4cc' : '#c4beb2') : s.isCar ? '#e05a4a' : '#b8865a';
      ctx.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
    }
    // дороги
    ctx.fillStyle = '#3a3b3f';
    for (const L of ROAD_LINES) {
      ctx.fillRect(X(L - 7), Z(-307), 14 * k, 614 * k);
      ctx.fillRect(X(-307), Z(L - 7), 614 * k, 14 * k);
    }
    ctx.strokeStyle = 'rgba(255,210,80,0.6)'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const L of ROAD_LINES) {
      ctx.beginPath(); ctx.moveTo(X(L), Z(-300)); ctx.lineTo(X(L), Z(300)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(-300), Z(L)); ctx.lineTo(X(300), Z(L)); ctx.stroke();
    }
    this.base = c;
    this.k = k;
    this.mini = document.getElementById('minimap');
    this.mctx = this.mini.getContext('2d');
  }

  toMap(x, z) { return [(x + EXT) / (EXT * 2), (z + EXT) / (EXT * 2)]; }

  // Миникарта вокруг игрока, повёрнута по направлению движения
  draw(player, cars) {
    const c = this.mctx, W = this.mini.width;
    const k = this.k, scale = 2.2; // пикселей подложки -> пикселей миникарты
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, 7); c.clip();
    c.translate(W / 2, W / 2);
    c.rotate(Math.PI + player.yaw);
    c.scale(scale, scale);
    const px = (player.pos.x + EXT) * k, pz = (player.pos.z + EXT) * k;
    c.drawImage(this.base, -px, -pz);
    // машины
    c.fillStyle = '#ffffff';
    for (const car of cars) {
      const x = (car.x + EXT) * k - px, z = (car.z + EXT) * k - pz;
      if (Math.abs(x) < 60 && Math.abs(z) < 60) c.fillRect(x - 1.2, z - 1.2, 2.4, 2.4);
    }
    // значки мест
    c.font = '9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const s of this.world.spots) {
      const x = (s.x + EXT) * k - px, z = (s.z + EXT) * k - pz;
      if (Math.abs(x) > 60 || Math.abs(z) > 60) continue;
      c.save(); c.translate(x, z); c.rotate(-(Math.PI + player.yaw)); c.fillText(s.icon, 0, 0); c.restore();
    }
    c.restore();
    // стрелка игрока
    c.fillStyle = '#ff5a1f'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(W / 2, W / 2 - 11); c.lineTo(W / 2 + 8, W / 2 + 8); c.lineTo(W / 2, W / 2 + 3); c.lineTo(W / 2 - 8, W / 2 + 8); c.closePath();
    c.fill(); c.stroke();
  }

  drawFull(canvas, player) {
    const c = canvas.getContext('2d');
    c.drawImage(this.base, 0, 0, canvas.width, canvas.height);
    const [u, v] = this.toMap(player.pos.x, player.pos.z);
    c.save();
    c.translate(u * canvas.width, v * canvas.height);
    c.rotate(Math.PI - player.yaw);
    c.fillStyle = '#ff5a1f'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -12); c.lineTo(9, 9); c.lineTo(0, 4); c.lineTo(-9, 9); c.closePath();
    c.fill(); c.stroke();
    c.restore();
  }
}
