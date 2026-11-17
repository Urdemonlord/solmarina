// Raka on foot: walk, sprint, punch, and getting in and out of cars. The
// player is a circle with a facing angle; when driving, the car holds him and
// this module only tracks the car he is in.

import { PLAYER, WANTED } from './config.js';
import { collideCircle } from './city.js';
import { fleeFrom, spawnFleeing } from './pedestrians.js';
import { carRadius } from './vehicles.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    health: PLAYER.health,
    money: 0,
    onFoot: true,
    car: null,
    armed: false,
    ammo: 0,
    punchTimer: 0,
    punchAnim: 0,
    invulnerable: 0,
    down: false,
  };
}

export function stepOnFoot(G, dt, move, sprinting) {
  const player = G.player;
  if (!player.onFoot) return;
  const speed = sprinting ? PLAYER.sprint : PLAYER.walk;
  const nextX = player.x + move.x * speed * dt;
  const nextY = player.y + move.y * speed * dt;
  const resolved = collideCircle(G.city, nextX, nextY, PLAYER.radius);
  player.x = resolved.x;
  player.y = resolved.y;
  if (move.x !== 0 || move.y !== 0) player.angle = Math.atan2(move.y, move.x);
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (player.punchAnim > 0) player.punchAnim -= dt;
  if (player.invulnerable > 0) player.invulnerable -= dt;
  // Stay in sync with the world while walking: dust on the move.
  if ((move.x !== 0 || move.y !== 0) && Math.random() < dt * 6) {
    G.effects.dust(player.x, player.y);
  }
}

/** The nearest car the player could get into, within 70 px. */
export function nearestCar(G, maxDist) {
  const player = G.player;
  let best = null;
  let bestDist = maxDist;
  for (const car of G.vehicles.list) {
    if (car.destroyed || car.driver === 'player') continue;
    const dist = Math.hypot(car.x - player.x, car.y - player.y) - carRadius(car);
    if (dist < bestDist) {
      bestDist = dist;
      best = car;
    }
  }
  return best;
}

/** Get in: steal a parked car, or carjack one with a driver. Returns true. */
export function enterCar(G, car) {
  const player = G.player;
  if (car.driver === 'traffic') {
    // The driver is yanked out and legs it; taking an occupied car is a crime.
    G.events.push({ kind: 'carjack', x: car.x, y: car.y });
    G.wanted.addHeat(WANTED.heat.carjack);
    G.audio.crash(0.4);
    const driver = { x: car.x + 30, y: car.y + 10, fled: true };
    spawnFleeing(G, driver.x, driver.y);
    car.driver = 'player';
  } else if (car.driver === 'police') {
    // Stealing a police car is the same crime, louder.
    G.wanted.addHeat(WANTED.heat.carjack + WANTED.heat.ramPolice);
    car.driver = 'player';
  } else {
    G.wanted.addHeat(WANTED.heat.stealParked);
    car.driver = 'player';
  }
  player.car = car;
  player.onFoot = false;
  player.x = car.x;
  player.y = car.y;
  return true;
}

/** Get out beside the car; it becomes parked (its driver, if any, is gone). */
export function exitCar(G) {
  const player = G.player;
  const car = player.car;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  const side = { x: Math.cos(car.angle + Math.PI / 2), y: Math.sin(car.angle + Math.PI / 2) };
  const resolved = collideCircle(G.city, car.x + side.x * (carRadius(car) + 16), car.y + side.y * (carRadius(car) + 16), PLAYER.radius);
  player.x = resolved.x;
  player.y = resolved.y;
  player.angle = car.angle;
  player.car = null;
  player.onFoot = true;
}

/** A punch: a short arc in front of the player, hurting peds and cops. */
export function punch(G) {
  const player = G.player;
  if (!player.onFoot || player.punchTimer > 0) return;
  player.punchTimer = PLAYER.punchCooldown;
  player.punchAnim = 0.18;
  G.audio.punch();
  const reach = PLAYER.punchRange + PLAYER.radius;
  const hx = player.x + Math.cos(player.angle) * reach;
  const hy = player.y + Math.sin(player.angle) * reach;
  let hitSomething = false;
  for (const ped of G.peds.list) {
    if (ped.down) continue;
    if (Math.hypot(ped.x - hx, ped.y - hy) > 30) continue;
    ped.health -= PLAYER.punchDamage;
    fleeFrom(ped, player.x, player.y);
    hitSomething = true;
    G.events.push({ kind: 'punchHit', x: ped.x, y: ped.y, strength: 0.5 });
    if (ped.health <= 0) {
      ped.down = true;
      ped.downTimer = 3;
      G.wanted.addHeat(ped.cop ? WANTED.heat.hitCop : WANTED.heat.punchPed);
    } else {
      G.wanted.addHeat(WANTED.heat.punchPed);
    }
  }
  // Punching a car dents it a little and sets off its alarm in the player's head.
  for (const car of G.vehicles.list) {
    if (Math.hypot(car.x - hx, car.y - hy) < carRadius(car) + 10) {
      car.damage = Math.min(100, car.damage + 2);
      hitSomething = true;
    }
  }
  if (!hitSomething) G.events.push({ kind: 'punchMiss', x: hx, y: hy, strength: 0.2 });
}
