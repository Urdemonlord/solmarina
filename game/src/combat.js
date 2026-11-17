// Solmarina 3D: combat (browser only). Punch on foot, pistol with mouse aim,
// police return fire at 3+ stars. Damage is applied to plain state; the
// meshes follow it.
import { WANTED, POLICE } from './config.js';
import { dist2 } from './random.js';

// Punch: hits the nearest ped/cop in front of the player within range.
// Returns the victim (or null). Victims get `down` seconds of lying down.
export function punch(player, peds, policeUnits, effects) {
  const range = 2.4;
  let best = null, bestD = range * range;
  const fx = -Math.sin(player.heading), fz = -Math.cos(player.heading);
  function consider(p, kind, unit) {
    const dx = p.x - player.x, dz = p.z - player.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > bestD) return;
    // in front? dot with facing > 0.2
    const d = Math.sqrt(d2) || 1;
    if ((dx / d) * fx + (dz / d) * fz < 0.2 && d2 > 0.5) return;
    best = { p, kind, unit };
    bestD = d2;
  }
  for (const ped of peds) {
    if (ped.dead || ped.down > 0) continue;
    consider(ped, 'ped', null);
  }
  for (const u of policeUnits) {
    if (u.kind !== 'foot' || u.ped.dead || u.ped.down > 0) continue;
    consider(u.ped, 'cop', u);
  }
  if (!best) return null;
  const p = best.p;
  if (best.kind === 'cop') {
    p.health = (p.health || 100) - 25;
    if (p.health <= 0) { p.down = 10; p.health = 100; }
  } else {
    p.down = 8;
  }
  // knockback away from the player
  const dx = p.x - player.x, dz = p.z - player.z;
  const d = Math.hypot(dx, dz) || 1;
  p.x += (dx / d) * 1.2; p.z += (dz / d) * 1.2;
  if (effects) effects.burst(p.x, 1, p.z, 8, [1, 0.9, 0.4], 4, 3);
  return best;
}

// Pistol shot: raycast from the camera through the screen centre against
// the given target meshes. Returns { point, victim } or null.
// raycaster: THREE.Raycaster already set from the camera; targets: [{ mesh, ref, kind }].
export function shoot(raycaster, targets, effects) {
  const hits = raycaster.intersectObjects(targets.map((t) => t.mesh), true);
  if (!hits.length) return null;
  const hit = hits[0];
  // walk up to the group that carries the ref
  let obj = hit.object;
  while (obj && !obj.userData.ref) obj = obj.parent;
  const point = hit.point;
  if (effects) effects.burst(point.x, point.y, point.z, 10, [1, 0.8, 0.3], 5, 2);
  if (!obj) return { point, victim: null };
  const ref = obj.userData.ref;
  if (ref.kind === 'cop') {
    ref.ped.health = (ref.ped.health || 100) - 34;
    if (ref.ped.health <= 0) { ref.ped.down = 10; ref.ped.health = 100; }
  } else if (ref.kind === 'ped') {
    ref.ped.down = 8;
  } else if (ref.kind === 'car') {
    ref.car.damage = Math.min(100, ref.car.damage + 12);
    if (ref.car.damage >= 100) ref.car.destroyed = true;
  }
  return { point, victim: ref };
}

// Police return fire: each foot cop at 3+ stars fires on a timer.
// Returns an array of { from, to, hit } tracer events for this frame.
export function policeFire(dt, policeUnits, player, stars, rng) {
  const events = [];
  if (stars < 3) return events;
  for (const u of policeUnits) {
    if (u.kind !== 'foot' || u.ped.dead || u.ped.down > 0) continue;
    u.fireTimer = (u.fireTimer || 0) - dt;
    if (u.fireTimer > 0) continue;
    u.fireTimer = 1.4 + rng() * 0.8;
    const d2 = dist2(u.ped.x, u.ped.z, player.x, player.z);
    if (d2 > POLICE.shootRange * POLICE.shootRange) continue;
    const d = Math.sqrt(d2);
    const hitChance = 0.4 - (d / POLICE.shootRange) * 0.25;
    const hit = rng() < hitChance;
    events.push({
      from: { x: u.ped.x, y: 1.3, z: u.ped.z },
      to: { x: player.x, y: 1.2, z: player.z },
      hit,
      damage: POLICE.shootDamage,
    });
  }
  return events;
}
