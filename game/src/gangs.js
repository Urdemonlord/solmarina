// Solmarina 3D: gang war (pure logic; the 3D meshes and HUD read this
// state, they do not own it). Two rival gangs fight over the Pasar Malam
// street: Geng Ombak (teal, west end) vs Geng Bara (red, east end). The
// war is a free-roam event, not a mission: it starts when Raka walks
// into the zone carrying the pistol, ends when one side has nobody
// standing, then cools down before it can start again. Raka can watch,
// pick a side, or stay out of it; shooting a member turns that whole
// gang hostile to him.
import { GANGS } from './config.js';
import { dist2 } from './random.js';

export function standingCount(war, gangId) {
  let n = 0;
  for (const m of war.members) {
    if (m.gang === gangId && m.down <= 0) n++;
  }
  return n;
}

// The war is armed only for an on-foot player carrying the pistol who
// walks into the zone. The pistol gate keeps the m0 cafe run and the
// stall tests (which teleport an unarmed player into the zone) from
// starting a war by accident.
export function canTriggerWar(war, player) {
  if (!war || war.active || war.cooldown > 0) return false;
  if (!player.onFoot || !player.hasPistol) return false;
  return dist2(player.x, player.z, GANGS.zone.x, GANGS.zone.z)
    < GANGS.zone.radius * GANGS.zone.radius;
}

export function createGangWar(rng) {
  const members = [];
  GANGS.sides.forEach((side, si) => {
    const dir = si === 0 ? -1 : 1; // Ombak west, Bara east
    for (let i = 0; i < GANGS.size; i++) {
      members.push({
        gang: side.id,
        x: GANGS.zone.x + dir * (28 + (i % 3) * 7) + (rng() - 0.5) * 4,
        z: GANGS.zone.z - 6 + (i % 2) * 6 + (rng() - 0.5) * 3,
        // face the enemy across the street: forward is (-sin h, -cos h),
        // so -PI/2 faces east and PI/2 faces west
        heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
        state: 'walk',
        health: 100,
        down: 0, // >0: lying down; 999: out for the rest of the war
        fireTimer: 0.2 + rng() * 1.0,
        hostile: false,
        shirt: side.shirt,
        pants: side.pants,
        walkPhase: rng() * 6,
        speed: 0.8,
      });
    }
  });
  return { active: true, cooldown: 0, members, winner: null, endTimer: 0, time: 0 };
}

// Damage one member. Returns 'down' when the hit puts him out, else 'hit'.
export function damageMember(member, amount) {
  member.health -= amount;
  if (member.health <= 0) {
    member.health = 0;
    member.down = 999;
    return 'down';
  }
  return 'hit';
}

// The whole gang turns on the player once he shoots one of theirs.
export function markHostile(war, gangId) {
  for (const m of war.members) {
    if (m.gang === gangId) m.hostile = true;
  }
}

// One tick of the firefight. Returns tracer events for this frame:
// { from, to, hit, damage, gang, target: 'enemy' | 'player' }.
export function updateGangWar(war, dt, player, rng) {
  const events = [];
  if (!war.active) return events;
  war.time += dt;
  for (const m of war.members) {
    if (m.down > 0) { m.down -= dt; continue; }
    // nearest standing enemy
    let target = null, bestD = Infinity;
    for (const e of war.members) {
      if (e.gang === m.gang || e.down > 0) continue;
      const d2 = dist2(m.x, m.z, e.x, e.z);
      if (d2 < bestD) { bestD = d2; target = e; }
    }
    // a hostile gang may shoot the player instead, when he is close
    let shootPlayer = false;
    if (m.hostile && player.onFoot) {
      const pd2 = dist2(m.x, m.z, player.x, player.z);
      if (pd2 < 20 * 20 && (!target || pd2 < bestD || rng() < 0.5)) shootPlayer = true;
    }
    const tx = shootPlayer ? player.x : target ? target.x : m.x;
    const tz = shootPlayer ? player.z : target ? target.z : m.z;
    const dx = tx - m.x, dz = tz - m.z;
    const d = Math.hypot(dx, dz) || 1;
    // face the target, advance slowly while far, hold the line when close
    m.heading = Math.atan2(-dx, -dz);
    if (d > 14) {
      m.x += (-Math.sin(m.heading)) * m.speed * dt;
      m.z += (-Math.cos(m.heading)) * m.speed * dt;
      m.x = Math.max(GANGS.zone.x - 42, Math.min(GANGS.zone.x + 42, m.x));
      m.z = Math.max(GANGS.zone.z - 10, Math.min(GANGS.zone.z + 2, m.z));
      m.walkPhase += dt * m.speed * 2.2;
    }
    m.fireTimer -= dt;
    if (m.fireTimer > 0 || d > GANGS.range) continue;
    m.fireTimer = 1.1 + rng() * 0.9;
    const from = { x: m.x, y: 1.3, z: m.z };
    const to = { x: tx, y: 1.2, z: tz };
    if (shootPlayer) {
      const hit = rng() < Math.max(0.08, 0.25 - (d / GANGS.range) * 0.12);
      events.push({ from, to, hit, damage: GANGS.damage, gang: m.gang, target: 'player' });
    } else if (target) {
      const hit = rng() < Math.max(0.1, 0.38 - (d / GANGS.range) * 0.2);
      if (hit) damageMember(target, 34);
      events.push({ from, to, hit, damage: 34, gang: m.gang, target: 'enemy' });
    }
  }
  // the war ends when one side has nobody standing
  const ombak = standingCount(war, 'ombak');
  const bara = standingCount(war, 'bara');
  if (ombak === 0 || bara === 0) {
    war.active = false;
    war.winner = ombak > 0 ? 'ombak' : 'bara';
    war.cooldown = GANGS.cooldown;
  }
  return events;
}

// Staged crossfire lines for the screenshot: the first few opposing
// pairs, so the captured frame shows the firefight even though live
// tracers live only 0.12s. { from, to, color } with y at gun height.
export function crossfireLines(war) {
  const lines = [];
  const ombak = war.members.filter((m) => m.gang === 'ombak' && m.down <= 0);
  const bara = war.members.filter((m) => m.gang === 'bara' && m.down <= 0);
  const n = Math.min(4, ombak.length, bara.length);
  for (let i = 0; i < n; i++) {
    const a = ombak[i], b = bara[n - 1 - i];
    lines.push({
      from: { x: a.x, y: 1.3, z: a.z },
      to: { x: b.x, y: 1.2, z: b.z },
      color: 0x7fe3f0,
    });
    lines.push({
      from: { x: b.x, y: 1.3, z: b.z },
      to: { x: a.x, y: 1.2, z: a.z },
      color: 0xffb36b,
    });
  }
  return lines;
}
