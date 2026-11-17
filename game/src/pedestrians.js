// Pedestrians: ordinary people walking the sidewalks, who run when something
// scares them and fall down when hurt. Cops are pedestrians too (cop: true),
// but police.js steers them.

import { PLAYER } from './config.js';
import { range } from './random.js';
import { collideCircle, randomSidewalkPoint } from './city.js';

const TARGET_COUNT = 26;
const SHIRT = ['#e8e8e8', '#5a7fb5', '#c98a4a', '#7ab56a', '#b55a7f', '#8a6f9e', '#d8d0c0'];

export function createPeds(G) {
  const peds = { list: [] };
  for (let index = 0; index < TARGET_COUNT; index += 1) {
    spawnPed(G, peds, false);
  }
  return peds;
}

export function spawnPed(G, peds, fleeing) {
  const point = randomSidewalkPoint(G.random);
  const ped = {
    x: point.x,
    y: point.y,
    angle: G.random() * Math.PI * 2,
    speed: range(G.random, 55, 85),
    color: SHIRT[Math.floor(G.random() * SHIRT.length)],
    state: fleeing ? 'flee' : 'walk',
    target: randomSidewalkPoint(G.random),
    waitTimer: fleeing ? 0 : range(G.random, 0, 2),
    fleeTimer: fleeing ? 2.5 : 0,
    threatX: 0,
    threatY: 0,
    health: 30,
    down: false,
    downTimer: 0,
    cop: false,
    vx: 0,
    vy: 0,
  };
  peds.list.push(ped);
  return ped;
}

/** A ped who just lost their car: runs away from (x, y) at once. */
export function spawnFleeing(G, x, y) {
  const ped = spawnPed(G, G.peds, true);
  ped.x = x;
  ped.y = y;
  ped.threatX = x - 30;
  ped.threatY = y;
  return ped;
}

export function fleeFrom(ped, x, y) {
  if (ped.down || ped.cop) return;
  ped.state = 'flee';
  ped.fleeTimer = 2.5;
  ped.threatX = x;
  ped.threatY = y;
}

export function stepPeds(G, dt) {
  let alive = 0;
  for (const ped of G.peds.list) {
    if (ped.down) {
      ped.downTimer -= dt;
      // A knocked-down ped slides to a stop, then stays down a while.
      ped.x += ped.vx * dt;
      ped.y += ped.vy * dt;
      ped.vx *= Math.max(0, 1 - 6 * dt);
      ped.vy *= Math.max(0, 1 - 6 * dt);
      if (ped.downTimer <= 0 && ped.health > 0) {
        ped.down = false;
        ped.state = 'flee';
        ped.fleeTimer = 2;
        ped.threatX = G.player.x;
        ped.threatY = G.player.y;
      }
      continue;
    }
    alive += 1;
    if (ped.cop) continue; // Police steer their own peds.
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - ped.threatY, ped.x - ped.threatX);
      ped.angle = away;
      const speed = 210;
      const nextX = ped.x + Math.cos(away) * speed * dt;
      const nextY = ped.y + Math.sin(away) * speed * dt;
      const resolved = collideCircle(G.city, nextX, nextY, PLAYER.radius);
      ped.x = resolved.x;
      ped.y = resolved.y;
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.target = randomSidewalkPoint(G.random);
      }
      continue;
    }
    if (ped.waitTimer > 0) {
      ped.waitTimer -= dt;
      continue;
    }
    const dx = ped.target.x - ped.x;
    const dy = ped.target.y - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      ped.waitTimer = range(G.random, 1, 3);
      ped.target = randomSidewalkPoint(G.random);
      continue;
    }
    ped.angle = Math.atan2(dy, dx);
    const nextX = ped.x + (dx / dist) * ped.speed * dt;
    const nextY = ped.y + (dy / dist) * ped.speed * dt;
    const resolved = collideCircle(G.city, nextX, nextY, PLAYER.radius);
    ped.x = resolved.x;
    ped.y = resolved.y;
    // A nearby scare (a shot, a crash, a siren at full wanted) sets them running.
    const scare = G.events.some((event) => event.kind === 'gunshot' || event.kind === 'carCrash');
    if (scare && Math.hypot(ped.x - G.player.x, ped.y - G.player.y) < 220) {
      fleeFrom(ped, G.player.x, G.player.y);
    }
  }
  // Keep the streets populated.
  while (alive < TARGET_COUNT) {
    spawnPed(G, G.peds, false);
    alive += 1;
  }
}
