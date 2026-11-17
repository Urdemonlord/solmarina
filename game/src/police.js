// The police response: foot cops who chase and grab, and patrol cars that
// chase and ram. The unit count follows the wanted stars; units spawn on a
// road near the player and melt away when the heat drops.

import { POLICE, WANTED } from './config.js';
import { randomRoadPoint } from './city.js';
import { carRadius, driveCar, spawnCar } from './vehicles.js';
import { spawnPed } from './pedestrians.js';

export function createPolice() {
  return { units: [] };
}

function spawnPoliceCar(G) {
  const point = randomRoadPoint(G.random);
  const car = spawnCar(G.vehicles, 'police', point.x, point.y, G.random() * Math.PI * 2, 'police');
  const unit = { kind: 'car', car, bustTimer: 0, shootTimer: 0, ramCooldown: 0, gotOut: false };
  G.police.units.push(unit);
  return unit;
}

function spawnFootCop(G) {
  const point = randomRoadPoint(G.random);
  const ped = spawnPed(G, G.peds, false);
  ped.x = point.x;
  ped.y = point.y;
  ped.cop = true;
  ped.speed = POLICE.footSpeed;
  ped.health = 60;
  const unit = { kind: 'foot', ped, bustTimer: 0, shootTimer: 0, ramCooldown: 0, gotOut: false };
  G.police.units.push(unit);
  return unit;
}

function ensureCounts(G) {
  const stars = G.wanted.stars;
  const wantCars = WANTED.policeCars[stars];
  const wantFoot = WANTED.policeFoot[stars];
  let cars = 0;
  let foot = 0;
  for (const unit of G.police.units) {
    if (unit.kind === 'car') cars += 1;
    else foot += 1;
  }
  while (cars < wantCars) {
    spawnPoliceCar(G);
    cars += 1;
  }
  while (foot < wantFoot) {
    spawnFootCop(G);
    foot += 1;
  }
  // When the heat drops, the farthest units give up first.
  if (cars > wantCars || foot > wantFoot) {
    G.police.units.sort((a, b) => {
      const da = a.kind === 'car' ? Math.hypot(a.car.x - G.player.x, a.car.y - G.player.y) : Math.hypot(a.ped.x - G.player.x, a.ped.y - G.player.y);
      const db = b.kind === 'car' ? Math.hypot(b.car.x - G.player.x, b.car.y - G.player.y) : Math.hypot(b.ped.x - G.player.x, b.ped.y - G.player.y);
      return db - da;
    });
    while (cars > wantCars || foot > wantFoot) {
      const unit = G.police.units.pop();
      if (unit.kind === 'car') {
        unit.car.driver = null;
        cars -= 1;
      } else {
        unit.ped.cop = false;
        unit.ped.state = 'walk';
        foot -= 1;
      }
    }
  }
}

function stepCarUnit(G, unit, dt) {
  const player = G.player;
  const car = unit.car;
  if (car.destroyed) return;
  const targetX = player.car ? player.car.x : player.x;
  const targetY = player.car ? player.car.y : player.y;
  // Aim slightly ahead of a moving target.
  const lead = 0.35;
  const px = player.car ? player.car.x + Math.cos(player.car.angle) * player.car.speed * lead : targetX;
  const py = player.car ? player.car.y + Math.sin(player.car.angle) * player.car.speed * lead : targetY;
  const desired = Math.atan2(py - car.y, px - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const dist = Math.hypot(targetX - car.x, targetY - car.y);
  const steer = Math.max(-1, Math.min(1, diff * 2.5));
  const result = driveCar(G, car, { throttle: 1, steer }, dt);
  if (result.hit && Math.abs(car.speed) > 100) {
    G.events.push({ kind: 'carCrash', x: car.x, y: car.y, strength: 0.4 });
    G.audio.crash(0.5);
  }
  // Ramming the player's car hurts the player, on a cooldown so it is not a blender.
  unit.ramCooldown -= dt;
  if (player.car && dist < carRadius(car) + carRadius(player.car) + 4 && unit.ramCooldown <= 0) {
    unit.ramCooldown = 1.2;
    player.health = Math.max(0, player.health - POLICE.ramDamage);
    G.camera.trauma = Math.min(1, G.camera.trauma + 0.45);
    G.audio.crash(0.7);
    G.events.push({ kind: 'rammed', x: player.x, y: player.y, strength: 0.7 });
    if (player.health <= 0) G.events.push({ kind: 'wasted' });
  }
  // A patrol car that catches the player on foot stops and its driver gets out.
  if (player.onFoot && dist < 130 && !unit.gotOut) {
    unit.gotOut = true;
    const ped = spawnPed(G, G.peds, false);
    ped.x = car.x + 24;
    ped.y = car.y;
    ped.cop = true;
    ped.speed = POLICE.footSpeed;
    ped.health = 60;
    G.police.units.push({ kind: 'foot', ped, bustTimer: 0, shootTimer: 0, ramCooldown: 0, gotOut: false });
    car.driver = null;
    car.speed = 0;
  }
}

function stepFootUnit(G, unit, dt) {
  const player = G.player;
  const ped = unit.ped;
  if (ped.down) return;
  const dx = player.x - ped.x;
  const dy = player.y - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 1) {
    ped.angle = Math.atan2(dy, dx);
    const step = Math.min(dist, POLICE.footSpeed * dt);
    ped.x += (dx / dist) * step;
    ped.y += (dy / dist) * step;
  }
  // Grabbing the player on foot, or a stalled car, fills the bust meter.
  const inCarSlow = !player.onFoot && player.car && Math.abs(player.car.speed) < 15;
  const near = player.onFoot ? dist < POLICE.bustRadius : inCarSlow && dist < POLICE.carBustRadius;
  const need = player.onFoot ? POLICE.bustSeconds : POLICE.carBustSeconds;
  if (near) {
    unit.bustTimer += dt;
    if (unit.bustTimer >= need) G.events.push({ kind: 'busted' });
  } else {
    unit.bustTimer = Math.max(0, unit.bustTimer - dt * 2);
  }
  // At three stars and up, cops shoot when close enough.
  unit.shootTimer -= dt;
  if (G.wanted.stars >= 3 && dist < POLICE.shootRange && unit.shootTimer <= 0) {
    unit.shootTimer = POLICE.shootCooldown;
    G.events.push({ kind: 'copShot', x: ped.x, y: ped.y, tx: player.x, ty: player.y });
    G.audio.gunshot();
    if (G.random() < 0.7) {
      player.health = Math.max(0, player.health - POLICE.bulletDamage);
      G.camera.trauma = Math.min(1, G.camera.trauma + 0.25);
      if (player.health <= 0) G.events.push({ kind: 'wasted' });
    }
  }
}

export function stepPolice(G, dt) {
  ensureCounts(G);
  for (const unit of G.police.units) {
    if (unit.kind === 'car') stepCarUnit(G, unit, dt);
    else stepFootUnit(G, unit, dt);
  }
  // A siren is audible while any patrol car is within earshot.
  let near = false;
  for (const unit of G.police.units) {
    if (unit.kind !== 'car') continue;
    if (Math.hypot(unit.car.x - G.player.x, unit.car.y - G.player.y) < 700) {
      near = true;
      break;
    }
  }
  G.audio.siren(near, dt);
}
