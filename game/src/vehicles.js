// Solmarina 3D: arcade car physics (pure). A car is a plain state object;
// updateCar moves it from input; meshes in render.js follow the state.
// Heading: 0 = facing -z (north), angle grows clockwise viewed from above.
import { CAR } from './config.js';
import { clamp, turnToward } from './random.js';

export function createCar(type, x, z, heading) {
  const t = CAR.types[type] || CAR.types.sedan;
  return {
    type, x, z, heading: heading || 0,
    speed: 0, steer: 0, damage: 0,
    top: t.top, accel: t.accel, brake: t.brake, steerRate: t.steer,
    driver: null, // 'player' | 'traffic' | 'police' | null (parked)
    destroyed: false,
    color: t.color, name: t.name,
  };
}

// input: { fwd (0..1), back (0..1), left (bool), right (bool) }. dt seconds.
export function updateCar(car, input, dt) {
  if (car.destroyed) return;
  const dir = car.speed >= 0 ? 1 : -1;
  if (input.fwd) car.speed += car.accel * dt;
  if (input.back) {
    if (car.speed > 0.5) car.speed -= car.brake * dt; // brake
    else car.speed -= car.accel * 0.55 * dt; // reverse
  }
  if (!input.fwd && !input.back) {
    // coast: drag pulls toward 0
    car.speed -= car.speed * 0.9 * dt;
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  car.speed = clamp(car.speed, -car.top * 0.45, car.top);
  // steering: stronger at low speed, none at standstill
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const speedFactor = clamp(Math.abs(car.speed) / 12, 0, 1);
  car.steer = steerInput * car.steerRate * speedFactor;
  car.heading += car.steer * dir * dt * clamp(Math.abs(car.speed) / 8, 0.25, 1);
  car.x += -Math.sin(car.heading) * car.speed * dt;
  car.z += -Math.cos(car.heading) * car.speed * dt;
}

// Circle-circle collision between two cars: push apart, exchange a little
// speed, add damage on hard hits. Returns the impact speed (0 if no hit).
export function collideCars(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  const min = CAR.radius * 2;
  if (d2 >= min * min || d2 < 1e-6) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d, nz = dz / d;
  const push = (min - d) / 2;
  a.x -= nx * push; a.z -= nz * push;
  b.x += nx * push; b.z += nz * push;
  const impact = Math.abs(a.speed - b.speed);
  if (impact > 4) {
    const dmg = Math.min(25, (impact - 4) * 1.2);
    a.damage = Math.min(CAR.maxDamage, a.damage + dmg);
    b.damage = Math.min(CAR.maxDamage, b.damage + dmg);
    a.speed *= 0.6; b.speed *= 0.6;
    if (a.damage >= CAR.maxDamage) a.destroyed = true;
    if (b.damage >= CAR.maxDamage) b.destroyed = true;
  }
  return impact;
}

// Speed in km/h for the HUD (1 unit ~ 1 m, x3.6).
export function kmh(car) {
  return Math.abs(car.speed) * 3.6;
}
