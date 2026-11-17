// Traffic: ordinary drivers who follow the road grid, keep to their lane and
// brake for the car ahead. They pick a neighbouring intersection each time
// they arrive, so the flow never needs a route plan.

import { ROADS, WORLD } from './config.js';
import { pick, range } from './random.js';
import { driveCar, spawnCar } from './vehicles.js';
import { nearestIntersection, randomRoadPoint } from './city.js';

const TARGET_COUNT = 10;
const LANE = 20;

/** Right-hand lane offset for a car travelling in `dir` (unit x/y). */
function laneOffset(dir) {
  if (dir.x === 1) return { x: 0, y: LANE };
  if (dir.x === -1) return { x: 0, y: -LANE };
  if (dir.y === 1) return { x: -LANE, y: 0 };
  return { x: LANE, y: 0 };
}

function neighbours(city, point) {
  const out = [];
  for (const road of ROADS.vertical) {
    if (road === point.x) {
      for (const h of ROADS.horizontal) {
        if (h !== point.y) out.push({ x: road, y: h });
      }
    }
  }
  for (const road of ROADS.horizontal) {
    if (road === point.y) {
      for (const v of ROADS.vertical) {
        if (v !== point.x) out.push({ x: v, y: road });
      }
    }
  }
  return out;
}

function pickNextTarget(G, car) {
  const current = nearestIntersection(G.city, car.x, car.y);
  const options = neighbours(G.city, current).filter((point) => {
    // No U-turns: keep going roughly the way the car faces.
    const dx = point.x - car.x;
    const dy = point.y - car.y;
    return dx * Math.cos(car.angle) + dy * Math.sin(car.angle) > -40;
  });
  const target = options.length > 0 ? pick(G.random, options) : current;
  const dir = {
    x: target.x > car.x + 10 ? 1 : target.x < car.x - 10 ? -1 : 0,
    y: target.y > car.y + 10 ? 1 : target.y < car.y - 10 ? -1 : 0,
  };
  if (dir.x !== 0 && dir.y !== 0) {
    // A diagonal hop means the car is mid-block; aim at the road it is on.
    if (Math.abs(target.x - car.x) > Math.abs(target.y - car.y)) dir.y = 0;
    else dir.x = 0;
  }
  const offset = laneOffset(dir);
  car.ai.target = { x: target.x + offset.x, y: target.y + offset.y };
  car.ai.dir = dir;
}

function carAhead(G, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of G.vehicles.list) {
    if (other === car || other.destroyed) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 110 || dist < 1) continue;
    const dot = (dx * fx + dy * fy) / dist;
    if (dot > 0.75) return true;
  }
  return false;
}

export function createTraffic(G) {
  const types = ['sedan', 'sedan', 'taxi', 'sedan', 'truck', 'taxi'];
  for (let index = 0; index < TARGET_COUNT; index += 1) {
    const point = randomRoadPoint(G.random);
    const angle = G.random() < 0.5 ? 0 : Math.PI / 2;
    const car = spawnCar(G.vehicles, pick(G.random, types), point.x, point.y, angle, 'traffic');
    pickNextTarget(G, car);
  }
}

export function stepTraffic(G, dt) {
  let count = 0;
  for (const car of G.vehicles.list) {
    if (car.driver !== 'traffic') continue;
    if (car.destroyed) {
      // Wrecks linger a while, then the street is cleared.
      car.ai.wait += dt;
      continue;
    }
    count += 1;
    const target = car.ai.target;
    if (!target || Math.hypot(target.x - car.x, target.y - car.y) < 70) {
      pickNextTarget(G, car);
      continue;
    }
    const desired = Math.atan2(target.y - car.y, target.x - car.x);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    const blocked = carAhead(G, car);
    const throttle = blocked ? 0 : 0.55;
    const result = driveCar(G, car, { throttle, steer }, dt);
    if (result.hit && Math.abs(car.speed) > 100) {
      G.events.push({ kind: 'carCrash', x: car.x, y: car.y, strength: 0.3 });
    }
    // A stalled traffic car far from the player is recycled near the action.
    const playerDist = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (playerDist > 1600) {
      const point = randomRoadPoint(G.random);
      car.x = point.x;
      car.y = point.y;
      car.speed = 0;
      pickNextTarget(G, car);
    }
  }
  // Top the flow back up after crashes and carjacks, and clear old wrecks.
  for (let index = G.vehicles.list.length - 1; index >= 0; index -= 1) {
    const car = G.vehicles.list[index];
    if (car.driver === 'traffic' && car.destroyed && car.ai.wait > 30) {
      G.vehicles.list.splice(index, 1);
    }
  }
  while (count < TARGET_COUNT) {
    const point = randomRoadPoint(G.random);
    const types = ['sedan', 'taxi', 'truck'];
    const car = spawnCar(G.vehicles, pick(G.random, types), point.x, point.y, G.random() < 0.5 ? 0 : Math.PI / 2, 'traffic');
    pickNextTarget(G, car);
    count += 1;
  }
}
