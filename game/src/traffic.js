// Solmarina 3D: traffic AI (browser only). Cars drive rectangular loops
// around city blocks at steady speed and slow for the car ahead.
import { CAR } from './config.js';
import { blockLoop } from './city.js';
import { createCar } from './vehicles.js';
import { turnToward, clamp } from './random.js';

export function createTraffic(rng, count, buildings) {
  const list = [];
  const types = ['sedan', 'sedan', 'taxi', 'truck', 'sports'];
  for (let i = 0; i < count; i++) {
    const bx = Math.floor(rng() * 7);
    const bz = Math.floor(rng() * 7);
    const loop = blockLoop(bx, bz);
    const start = loop[Math.floor(rng() * loop.length)];
    const car = createCar(types[Math.floor(rng() * types.length)], start.x, start.z, 0);
    car.driver = 'traffic';
    car.cruise = 12 + rng() * 6;
    car.loop = loop;
    car.wp = 0;
    car.stopped = false;
    list.push(car);
  }
  return list;
}

// Steer one traffic car toward its next loop waypoint.
export function updateTrafficCar(car, dt, cars) {
  const wp = car.loop[car.wp];
  const dx = wp.x - car.x, dz = wp.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 3) {
    car.wp = (car.wp + 1) % car.loop.length;
    return;
  }
  const targetHeading = Math.atan2(-dx, -dz);
  // slow down if a car is close ahead
  let slow = false;
  for (const other of cars) {
    if (other === car || other.destroyed) continue;
    const ox = other.x - car.x, oz = other.z - car.z;
    const d = Math.hypot(ox, oz);
    if (d < 9) {
      // is it ahead of us?
      const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
      if (ox * fx + oz * fz > 0) { slow = true; break; }
    }
  }
  const speedTarget = slow ? 0 : car.cruise;
  car.heading = turnToward(car.heading, targetHeading, dt * 2.2);
  // arcade: drive forward at the target speed
  const accel = speedTarget > car.speed ? 10 : 22;
  car.speed += clamp(speedTarget - car.speed, -accel * dt, accel * dt);
  car.x += -Math.sin(car.heading) * car.speed * dt;
  car.z += -Math.cos(car.heading) * car.speed * dt;
}

export function updateTraffic(list, dt, cars) {
  for (const car of list) {
    if (!car.destroyed) updateTrafficCar(car, dt, cars);
  }
}
