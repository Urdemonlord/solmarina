// The live minimap: the whole city shrunk into the top-right corner, with the
// player, the police, the traffic and the mission waypoint on it.

import { BEACH, MARINA, PALETTE, PARK, PLAZA, ROADS, VIEW, WORLD } from './config.js';
import { waypoint } from './missions.js';

const BOX = { width: 210, height: 158 };

export function drawMinimap(G, context, text) {
  const x0 = VIEW.width - BOX.width - 16;
  const y0 = 16;
  const scaleX = BOX.width / WORLD.width;
  const scaleY = BOX.height / WORLD.height;
  context.fillStyle = 'rgba(20, 18, 14, 0.78)';
  context.fillRect(x0 - 4, y0 - 4, BOX.width + 8, BOX.height + 8);
  context.save();
  context.beginPath();
  context.rect(x0, y0, BOX.width, BOX.height);
  context.clip();
  context.fillStyle = '#8a8271';
  context.fillRect(x0, y0, BOX.width, BOX.height);
  // Sea and sand.
  context.fillStyle = PALETTE.sea;
  context.fillRect(x0, y0 + BEACH.seaTop * scaleY, BOX.width, BOX.height - BEACH.seaTop * scaleY);
  context.fillStyle = PALETTE.sand;
  context.fillRect(x0, y0 + BEACH.sandTop * scaleY, BOX.width, (BEACH.seaTop - BEACH.sandTop) * scaleY);
  // Roads.
  context.fillStyle = '#4a4a52';
  for (const v of ROADS.vertical) context.fillRect(x0 + v * scaleX - 3, y0, 6, BOX.height);
  for (const h of ROADS.horizontal) context.fillRect(x0, y0 + h * scaleY - 3, BOX.width, 6);
  // Park, plaza, marina.
  context.fillStyle = PALETTE.grass;
  context.fillRect(x0 + PARK.x * scaleX, y0 + PARK.y * scaleY, PARK.width * scaleX, PARK.height * scaleY);
  context.fillStyle = '#d8cfb8';
  context.fillRect(x0 + PLAZA.x * scaleX, y0 + PLAZA.y * scaleY, PLAZA.width * scaleX, PLAZA.height * scaleY);
  context.fillStyle = PALETTE.seaDeep;
  context.fillRect(x0 + MARINA.x * scaleX, y0 + MARINA.y * scaleY, MARINA.width * scaleX, MARINA.height * scaleY);
  // Buildings as small blocks.
  context.fillStyle = 'rgba(60, 50, 40, 0.7)';
  for (const b of G.city.buildings) {
    context.fillRect(x0 + b.x * scaleX, y0 + b.y * scaleY, Math.max(2, b.width * scaleX), Math.max(2, b.height * scaleY));
  }
  // Traffic as grey dots, police as flashing dots.
  context.fillStyle = '#d8d8d8';
  for (const car of G.vehicles.list) {
    if (car.driver === 'police') continue;
    context.fillRect(x0 + car.x * scaleX - 1, y0 + car.y * scaleY - 1, 3, 3);
  }
  const flash = Math.floor(G.time * 4) % 2 === 0;
  context.fillStyle = flash ? '#e53a3a' : '#3a6fe5';
  for (const unit of G.police.units) {
    const ux = unit.kind === 'car' ? unit.car.x : unit.ped.x;
    const uy = unit.kind === 'car' ? unit.car.y : unit.ped.y;
    context.beginPath();
    context.arc(x0 + ux * scaleX, y0 + uy * scaleY, 3, 0, Math.PI * 2);
    context.fill();
  }
  // The mission waypoint, pulsing.
  const point = waypoint(G);
  if (point) {
    const pulse = 3 + Math.sin(G.time * 5) * 1.5;
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.arc(x0 + point.x * scaleX, y0 + point.y * scaleY, pulse, 0, Math.PI * 2);
    context.fill();
  }
  // The player, a white arrow that turns with him.
  context.save();
  context.translate(x0 + G.player.x * scaleX, y0 + G.player.y * scaleY);
  context.rotate(G.player.angle);
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.moveTo(7, 0);
  context.lineTo(-5, -4);
  context.lineTo(-5, 4);
  context.closePath();
  context.fill();
  context.restore();
  context.restore();
  context.strokeStyle = 'rgba(245, 241, 230, 0.5)';
  context.lineWidth = 1;
  context.strokeRect(x0 - 4, y0 - 4, BOX.width + 8, BOX.height + 8);
  text('SOLMARINA', x0 + BOX.width / 2, y0 + BOX.height + 18, 11, PALETTE.text, 'center');
}
