// Solmarina 3D: police AI (browser only). Foot cops chase and grab the
// player; police cars chase and ram. Both shoot at 3+ stars. A helicopter
// joins at 3+ stars and keeps line of sight from the air unless the player
// breaks it with cover or distance.
import { POLICE, WANTED, HELI, SPAWNS } from './config.js';
import { createCar } from './vehicles.js';
import { turnToward, clamp, dist2 } from './random.js';

export function createPolice() {
  return { units: [] }; // { kind: 'car'|'foot', car?, ped?, bustTimer }
}

// Helicopter state (plain data; the mesh lives in main.js).
// { active, x, z, y, angle, leaving }
export function createHeli() {
  return { active: false, x: 0, z: 0, y: HELI.hoverHeight, angle: 0, leaving: false };
}

// Steer the helicopter toward the player. It orbits at hover height and
// follows slower than a fast car, so a fast getaway can outrun its watch.
export function updateHeli(heli, dt, player, stars) {
  if (stars >= HELI.minStars) {
    heli.active = true;
    heli.leaving = false;
    heli.angle += dt * 0.45;
    const tx = player.x + Math.sin(heli.angle) * HELI.orbitRadius;
    const tz = player.z + Math.cos(heli.angle) * HELI.orbitRadius;
    const dx = tx - heli.x, dz = tz - heli.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, HELI.followSpeed * dt);
    heli.x += (dx / d) * step;
    heli.z += (dz / d) * step;
    heli.y += (HELI.hoverHeight - heli.y) * Math.min(1, dt * 1.5);
  } else if (heli.active) {
    heli.leaving = true;
    heli.y += 18 * dt;
    if (heli.y > 90) { heli.active = false; heli.leaving = false; }
  }
  return heli;
}

// Is the player pressed against a building (in cover)? A helicopter cannot
// hold line of sight on someone hugging a wall; ground units are close
// enough that cover does not save the player from them.
export function inCover(buildings, x, z) {
  for (const b of buildings) {
    if (Math.abs(x - b.x) <= b.w / 2 + 5 && Math.abs(z - b.z) <= b.d / 2 + 5) return true;
  }
  return false;
}

// How many police units the wanted level calls for.
export function desiredUnits(stars) {
  if (stars <= 0) return { cars: 0, foot: 0 };
  if (stars === 1) return { cars: 0, foot: 1 };
  if (stars === 2) return { cars: 1, foot: 1 };
  if (stars === 3) return { cars: 2, foot: 2 };
  if (stars === 4) return { cars: 3, foot: 2 };
  return { cars: POLICE.maxCars, foot: POLICE.maxFoot };
}

// Spawn one unit near the player (off-screen-ish: 60-90 units away).
export function spawnUnit(police, kind, px, pz, rng) {
  const a = rng() * Math.PI * 2;
  const d = 60 + rng() * 30;
  const x = px + Math.sin(a) * d;
  const z = pz + Math.cos(a) * d;
  if (kind === 'car') {
    const car = createCar('police', x, z, 0);
    car.driver = 'police';
    police.units.push({ kind: 'car', car, bustTimer: 0 });
  } else {
    police.units.push({
      kind: 'foot',
      ped: {
        x, z, heading: 0, speed: POLICE.footSpeed,
        state: 'chase', shirt: 0x1e3a5f, pants: 0x1e3a5f,
        walkPhase: 0, fleeTimer: 0, cop: true, dead: false,
      },
      bustTimer: 0,
    });
  }
}

export function removeUnit(police, unit) {
  const i = police.units.indexOf(unit);
  if (i >= 0) police.units.splice(i, 1);
  if (unit.kind === 'car' && unit.car) unit.car.driver = null;
}

// Keep the unit count at the wanted level's demand.
export function balanceUnits(police, stars, px, pz, rng) {
  const want = desiredUnits(stars);
  let cars = 0, foot = 0;
  for (const u of police.units) {
    if (u.kind === 'car') cars++;
    else foot++;
  }
  while (cars < want.cars) { spawnUnit(police, 'car', px, pz, rng); cars++; }
  while (foot < want.foot) { spawnUnit(police, 'foot', px, pz, rng); foot++; }
  // when wanted falls, excess units drive/walk off: mark them leaving
  for (const u of police.units) {
    if (u.kind === 'car' && cars > want.cars) { u.leaving = true; cars--; }
    if (u.kind === 'foot' && foot > want.foot) { u.leaving = true; foot--; }
  }
  // drop units that are far away and leaving
  for (let i = police.units.length - 1; i >= 0; i--) {
    const u = police.units[i];
    if (!u.leaving) continue;
    const p = u.kind === 'car' ? u.car : u.ped;
    if (dist2(p.x, p.z, px, pz) > 120 * 120) removeUnit(police, u);
  }
}

// Chase the player. Returns 'busted' when a foot cop grabs the player,
// 'ram' when a police car hits the player's car (handled by caller too).
export function updatePolice(police, dt, player, stars) {
  let busted = false;
  for (const u of police.units) {
    if (u.kind === 'car') {
      const car = u.car;
      const dx = player.x - car.x, dz = player.z - car.z;
      const d = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(-dx, -dz);
      car.heading = turnToward(car.heading, targetHeading, dt * 2.4);
      const want = u.leaving ? 0 : Math.min(POLICE.carSpeed, 20 + d * 0.4);
      car.speed += clamp(want - car.speed, -26 * dt, 18 * dt);
      car.x += -Math.sin(car.heading) * car.speed * dt;
      car.z += -Math.cos(car.heading) * car.speed * dt;
    } else {
      const ped = u.ped;
      const dx = player.x - ped.x, dz = player.z - ped.z;
      const d = Math.hypot(dx, dz);
      ped.heading = Math.atan2(-dx, -dz);
      ped.x += -Math.sin(ped.heading) * ped.speed * dt;
      ped.z += -Math.cos(ped.heading) * ped.speed * dt;
      ped.walkPhase += dt * ped.speed * 2.2;
      // grab: on-foot player, cop close for bustTime
      if (player.onFoot && d < POLICE.bustRadius) {
        u.bustTimer += dt;
        if (u.bustTimer > POLICE.bustTime) busted = true;
      } else {
        u.bustTimer = Math.max(0, u.bustTimer - dt);
      }
    }
  }
  return busted;
}

// Can any police unit see the player? Ground units see within 70 units.
// The helicopter sees within its watch radius unless the player is in
// cover (hugging a building) or the helicopter is leaving.
// heli: { active, x, z } or null. buildings: list for the cover check.
export function policeCanSee(police, player, heli, buildings) {
  for (const u of police.units) {
    const p = u.kind === 'car' ? u.car : u.ped;
    if (dist2(p.x, p.z, player.x, player.z) < 70 * 70) return true;
  }
  if (heli && heli.active && !heli.leaving) {
    const dx = heli.x - player.x, dz = heli.z - player.z;
    if (dx * dx + dz * dz < HELI.watchRadius * HELI.watchRadius) {
      if (!buildings || !inCover(buildings, player.x, player.z)) return true;
    }
  }
  return false;
}

// Busted: fine, clear wanted, respawn at the police station.
export function applyBusted(player, wanted) {
  const fine = Math.min(POLICE.fine, player.money);
  player.money -= fine;
  player.health = 100;
  wanted.clear();
  player.x = SPAWNS.policeStation.x;
  player.z = SPAWNS.policeStation.z;
  player.heading = 0;
  if (player.car) { player.car.driver = null; player.car = null; }
  player.onFoot = true;
  return fine;
}

// Wasted: fine, clear wanted, respawn at the hospital.
export function applyWasted(player, wanted) {
  const fine = Math.min(POLICE.fine, player.money);
  player.money -= fine;
  player.health = 100;
  wanted.clear();
  player.x = SPAWNS.hospital.x;
  player.z = SPAWNS.hospital.z;
  player.heading = 0;
  if (player.car) { player.car.driver = null; player.car = null; }
  player.onFoot = true;
  return fine;
}
