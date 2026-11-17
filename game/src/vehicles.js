// Cars: arcade physics, damage, and the pairwise shoving that makes traffic
// feel solid. This module knows nothing about who drives: traffic and police
// compute a { throttle, steer } control each step and hand it to driveCar.

import { CAR_TYPES, WANTED } from './config.js';
import { collideCircle } from './city.js';

let nextId = 1;

export function createVehicles() {
  return { list: [] };
}

export function spawnCar(vehicles, type, x, y, angle, driver) {
  const def = CAR_TYPES[type];
  const car = {
    id: nextId,
    type,
    def,
    x,
    y,
    angle,
    speed: 0,
    damage: 0,
    driver: driver || null,
    color: def.color,
    destroyed: false,
    smokeTimer: 0,
    honkTimer: 0,
    // AI scratch space, owned by traffic.js / police.js.
    ai: { target: null, wait: 0, route: [] },
  };
  nextId += 1;
  vehicles.list.push(car);
  return car;
}

export function carRadius(car) {
  return car.def.length * 0.42;
}

/**
 * One physics step for a car under a control. throttle -1..1 (reverse is half
 * strength), steer -1..1. Returns { hit, impact } for the caller to react to.
 */
export function driveCar(G, car, control, dt) {
  if (car.destroyed) {
    car.speed *= Math.max(0, 1 - 3 * dt);
    return { hit: false, impact: 0 };
  }
  const def = car.def;
  const forward = car.speed >= 0 ? 1 : -1;
  const speedRatio = Math.min(1, Math.abs(car.speed) / def.topSpeed);
  car.angle += control.steer * def.turn * (0.35 + 0.65 * speedRatio) * forward * dt;
  if (control.throttle > 0) car.speed += control.throttle * def.accel * dt;
  else if (control.throttle < 0) car.speed += control.throttle * def.brake * dt;
  // Rolling drag as an exponential decay, so the feel does not depend on step size.
  car.speed *= Math.exp(-0.9 * dt);
  if (control.throttle === 0 && Math.abs(car.speed) < 12) car.speed = 0;
  car.speed = Math.max(-def.topSpeed * 0.45, Math.min(def.topSpeed, car.speed));

  const nextX = car.x + Math.cos(car.angle) * car.speed * dt;
  const nextY = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = Math.abs(car.speed);
  const resolved = collideCircle(G.city, nextX, nextY, carRadius(car));
  const impact = resolved.hit ? before : 0;
  if (resolved.hit) {
    // A wall stops the car dead and dents it; the caller turns it into noise.
    if (before > 120) car.damage = Math.min(100, car.damage + (before - 120) * 0.03);
    car.speed *= 0.25;
  }
  car.x = resolved.x;
  car.y = resolved.y;
  if (car.damage >= 100) {
    car.destroyed = true;
    car.speed = 0;
  }
  return { hit: resolved.hit, impact };
}

/** Pairwise car shoving: push apart, trade a little speed, dent on hard hits. */
export function resolveCarCollisions(G) {
  const list = G.vehicles.list;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = carRadius(a) + carRadius(b) - 6;
      const distSq = dx * dx + dy * dy;
      if (distSq >= min * min || distSq === 0) continue;
      const dist = Math.sqrt(distSq);
      const push = (min - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const closing = Math.abs(a.speed - b.speed);
      if (closing > 160) {
        const dent = (closing - 160) * 0.02;
        a.damage = Math.min(100, a.damage + dent);
        b.damage = Math.min(100, b.damage + dent);
        const avg = (a.speed + b.speed) / 2;
        a.speed = avg;
        b.speed = avg;
        G.events.push({ kind: 'carCrash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, strength: closing / 700 });
        if (a.driver === 'player' || b.driver === 'player') {
          G.wanted.addHeat(WANTED.heat.crashCar);
        }
      }
    }
  }
}

/** Cars a speeding car bowls over: peds are knocked down, never driven through. */
export function resolveCarPedCollisions(G) {
  for (const car of G.vehicles.list) {
    if (Math.abs(car.speed) < 60) continue;
    for (const ped of G.peds.list) {
      if (ped.down) continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      const min = carRadius(car) + 12;
      if (dx * dx + dy * dy >= min * min) continue;
      ped.down = true;
      ped.downTimer = 2.5;
      ped.health = 0;
      ped.vx = (dx / Math.max(1, Math.hypot(dx, dy))) * 320;
      ped.vy = (dy / Math.max(1, Math.hypot(dx, dy))) * 320;
      G.events.push({ kind: 'pedHit', x: ped.x, y: ped.y, strength: 0.8 });
      if (car.driver === 'player') {
        G.wanted.addHeat(WANTED.heat.killPed);
      }
    }
  }
}
