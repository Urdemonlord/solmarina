// The HUD: money, health, wanted stars, the clock, the objective, the speed,
// and the arrow that points at the mission waypoint when it is off screen.
// Drawn in screen space, after the world.

import { PALETTE, VIEW } from './config.js';
import { objectiveText, waypoint } from './missions.js';
import { nearestCar } from './player.js';

function moneyText(value) {
  return `$${Math.floor(value).toLocaleString('en-US')}`;
}

function clockText(minutes) {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = Math.floor(minutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function drawHud(G, context, view, text) {
  const player = G.player;
  // Top-left: money, then a health bar.
  text(moneyText(player.money), 22, 34, 28, PALETTE.money, 'left');
  context.fillStyle = 'rgba(20, 18, 14, 0.7)';
  context.fillRect(22, 46, 190, 14);
  context.fillStyle = player.health > 30 ? '#3fae5a' : '#e53a3a';
  context.fillRect(24, 48, 186 * Math.max(0, player.health / 100), 10);
  text('NYAWA', 218, 58, 13, PALETTE.text, 'left');
  // Wanted stars under the health bar.
  for (let star = 0; star < 5; star += 1) {
    context.fillStyle = star < G.wanted.stars ? PALETTE.star : 'rgba(245, 241, 230, 0.25)';
    const sx = 26 + star * 26;
    const sy = 84;
    context.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + (point * Math.PI) / 5;
      const radius = point % 2 === 0 ? 11 : 5;
      const px = sx + Math.cos(angle) * radius;
      const py = sy + Math.sin(angle) * radius;
      if (point === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
  }
  // Top-centre: the clock.
  text(clockText(G.clock), VIEW.width / 2, 34, 24, PALETTE.text, 'center');
  // Bottom-left: speed and car damage while driving.
  if (!player.onFoot && player.car) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
    text(`${kmh} km/jam`, 22, VIEW.height - 66, 26, PALETTE.text, 'left');
    text(`Mobil: ${player.car.def.name}  •  Rusak ${Math.round(player.car.damage)}%`, 22, VIEW.height - 36, 16, player.car.damage > 60 ? '#e53a3a' : PALETTE.text, 'left');
  } else {
    text(player.armed ? `Pistol — ${player.ammo} peluru (klik untuk tembak)` : 'F pukul  •  cari pistol di kota', 22, VIEW.height - 36, 16, PALETTE.text, 'left');
  }
  // Bottom-centre: the objective.
  const objective = objectiveText(G);
  const width = context.measureText(objective).width + 36;
  context.fillStyle = PALETTE.panel;
  context.fillRect((VIEW.width - width) / 2, VIEW.height - 78, width, 34);
  text(objective, VIEW.width / 2, VIEW.height - 54, 17, PALETTE.text, 'center');
  // Mission banner, fading.
  if (G.missions.bannerTimer > 0 && G.missions.banner) {
    const alpha = Math.min(1, G.missions.bannerTimer);
    context.globalAlpha = alpha;
    text(G.missions.banner, VIEW.width / 2, 120, 30, PALETTE.marker, 'center');
    context.globalAlpha = 1;
  }
  // "E to enter" prompt when a car is near on foot.
  if (player.onFoot) {
    const car = nearestCar(G, 70);
    if (car) {
      const label = car.driver === 'traffic' ? 'E — Rampas mobil ini' : car.driver === 'police' ? 'E — Curi mobil polisi' : 'E — Masuk mobil';
      text(label, VIEW.width / 2, VIEW.height - 110, 20, PALETTE.marker, 'center');
    }
  }
  // The waypoint arrow at the screen edge when the marker is off screen.
  const point = waypoint(G);
  if (point) {
    const camera = G.camera;
    const left = camera.x - VIEW.width / 2;
    const top = camera.y - VIEW.height / 2;
    const sx = point.x - left;
    const sy = point.y - top;
    if (sx < 0 || sx > VIEW.width || sy < 0 || sy > VIEW.height) {
      const cx = VIEW.width / 2;
      const cy = VIEW.height / 2;
      const angle = Math.atan2(sy - cy, sx - cx);
      const ex = cx + Math.cos(angle) * (VIEW.width / 2 - 60);
      const ey = cy + Math.sin(angle) * (VIEW.height / 2 - 60);
      context.save();
      context.translate(ex, ey);
      context.rotate(angle);
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(-10, -12);
      context.lineTo(-10, 12);
      context.closePath();
      context.fill();
      context.restore();
      const dist = Math.round(Math.hypot(point.x - player.x, point.y - player.y));
      text(`${dist}m`, ex, ey + 30, 15, PALETTE.marker, 'center');
    }
  }
}
