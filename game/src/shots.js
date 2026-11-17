// The screenshot scenes behind ?shot=1-start|2-drive|3-chase|4-mission. Each
// one plays the real rules forward from the seeded world for a fixed number of
// steps, steered by a small autopilot that drives along the roads, so the frame
// is what a short game really looks like and the same seed always gives the
// same frame.

import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { driveCar, spawnCar } from './vehicles.js';
import { startMission } from './missions.js';
import { stepTraffic } from './traffic.js';
import { stepPeds } from './pedestrians.js';
import { stepPolice } from './police.js';

/** Steer a car toward a point on the road, at cruising throttle. */
function driveToward(G, car, target, dt, throttle) {
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.5));
  driveCar(G, car, { throttle: throttle ?? 0.7, steer }, dt);
}

/** Follow a list of road waypoints, moving to the next when close. */
function followWaypoints(G, car, waypoints, dt, seconds) {
  let index = 0;
  for (let step = 0; step < seconds / STEP; step += 1) {
    if (index >= waypoints.length) {
      driveCar(G, car, { throttle: 0, steer: 0 }, dt);
    } else {
      driveToward(G, car, waypoints[index], dt, 0.75);
      if (Math.hypot(waypoints[index].x - car.x, waypoints[index].y - car.y) < 80) index += 1;
    }
    G.player.x = car.x;
    G.player.y = car.y;
    G.player.angle = car.angle;
    stepTraffic(G, STEP);
    stepPeds(G, STEP);
    G.effects.step(STEP);
    G.time += STEP;
    G.camera.x = car.x;
    G.camera.y = car.y;
  }
}

function putPlayerInCar(G, type, x, y, angle, color) {
  const car = spawnCar(G.vehicles, type, x, y, angle, 'player');
  if (color) car.color = color;
  G.player.car = car;
  G.player.onFoot = false;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  return car;
}

function stageStart(G) {
  G.camera.x = 1600;
  G.camera.y = 1200;
  for (let index = 0; index < 5 / STEP; index += 1) {
    stepTraffic(G, STEP);
    stepPeds(G, STEP);
    G.effects.step(STEP);
    G.time += STEP;
  }
  return { screen: SCREEN_TITLE };
}

function stageDrive(G) {
  const car = putPlayerInCar(G, 'sedan', 1400, 1000, 0);
  followWaypoints(G, car, [{ x: 2600, y: 1000 }, { x: 2600, y: 1400 }], STEP, 7);
  return { screen: SCREEN_PLAY };
}

function stageChase(G) {
  const car = putPlayerInCar(G, 'sport', 1400, 1400, 0);
  car.damage = 55;
  G.wanted.addHeat(70);
  // Two patrol cars right on the player's tail, plus the standing response.
  const cop1 = spawnCar(G.vehicles, 'police', 1180, 1400, 0, 'police');
  const cop2 = spawnCar(G.vehicles, 'police', 1600, 1180, Math.PI / 2, 'police');
  G.police.units.push(
    { kind: 'car', car: cop1, bustTimer: 0, shootTimer: 0, ramCooldown: 0, gotOut: false },
    { kind: 'car', car: cop2, bustTimer: 0, shootTimer: 0, ramCooldown: 0, gotOut: false },
  );
  followWaypoints(G, car, [{ x: 2600, y: 1400 }, { x: 2600, y: 1800 }], STEP, 5);
  stepPolice(G, STEP);
  // A few skid marks and smoke so the chase reads at a glance.
  G.effects.addSkid(car.x - 40, car.y, car.angle);
  G.effects.addSkid(car.x - 80, car.y, car.angle);
  G.effects.smoke(car.x, car.y - 10);
  return { screen: SCREEN_PLAY };
}

function stageMission(G) {
  const def = G.missions.defs[0];
  startMission(G, def);
  const car = putPlayerInCar(G, 'taxi', 1000, 1000, 0);
  followWaypoints(G, car, [{ x: 1400, y: 1000 }, { x: 1400, y: 1200 }], STEP, 6);
  return { screen: SCREEN_PLAY };
}

/**
 * Set the game to the named scene (1-start, 2-drive, 3-chase, 4-mission; any
 * other name is 1-start) and return the screen to draw over it.
 */
export function stageShot(name, G) {
  G.events.length = 0;
  if (name === '2-drive') return stageDrive(G);
  if (name === '3-chase') return stageChase(G);
  if (name === '4-mission') return stageMission(G);
  return stageStart(G);
}
