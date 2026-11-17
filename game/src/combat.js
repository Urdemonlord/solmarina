// Combat: the pistol pickup, the bullets, and what they hit. A bullet is a
// fast point with a short life; it stops on a building and hurts the first
// pedestrian, cop or car it meets. Police gunfire is direct (see police.js),
// not bullets, so this module only ever fires for the player.

import { COMBAT, WANTED } from './config.js';
import { collideCircle } from './city.js';

export function createCombat() {
  return {
    bullets: [],
    pickups: [],
    shootCooldown: 0,
  };
}

export function spawnPickups(G) {
  const spots = [
    { x: 1560, y: 1160 },
    { x: 700, y: 300 },
    { x: 1500, y: 2280 },
  ];
  for (const spot of spots) {
    G.combat.pickups.push({ x: spot.x, y: spot.y, kind: 'pistol', ammo: COMBAT.pistolAmmo, taken: false });
  }
}

export function stepCombat(G, dt, aimAngle, firing) {
  const combat = G.combat;
  const player = G.player;
  if (combat.shootCooldown > 0) combat.shootCooldown -= dt;

  // Walking over a pickup arms the player.
  for (const pickup of combat.pickups) {
    if (pickup.taken || !player.onFoot) continue;
    if (Math.hypot(player.x - pickup.x, player.y - pickup.y) < 34) {
      pickup.taken = true;
      player.armed = true;
      player.ammo += pickup.ammo;
      G.audio.pickup();
      G.events.push({ kind: 'pickup', x: pickup.x, y: pickup.y, strength: 0.4 });
    }
  }

  if (firing && player.onFoot && player.armed && player.ammo > 0 && combat.shootCooldown <= 0) {
    combat.shootCooldown = COMBAT.shootCooldown;
    player.ammo -= 1;
    player.angle = aimAngle;
    combat.bullets.push({
      x: player.x + Math.cos(aimAngle) * 22,
      y: player.y + Math.sin(aimAngle) * 22,
      angle: aimAngle,
      travelled: 0,
    });
    G.audio.gunshot();
    G.events.push({ kind: 'gunshot', x: player.x, y: player.y, strength: 0.3 });
    G.wanted.addHeat(WANTED.heat.shoot);
    if (player.ammo === 0) player.armed = false;
  }

  for (let index = combat.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = combat.bullets[index];
    bullet.x += Math.cos(bullet.angle) * COMBAT.bulletSpeed * dt;
    bullet.y += Math.sin(bullet.angle) * COMBAT.bulletSpeed * dt;
    bullet.travelled += COMBAT.bulletSpeed * dt;
    let dead = bullet.travelled > COMBAT.bulletRange;
    if (!dead) {
      const wall = collideCircle(G.city, bullet.x, bullet.y, 2);
      if (wall.hit) {
        dead = true;
        G.events.push({ kind: 'spark', x: bullet.x, y: bullet.y, strength: 0.4 });
      }
    }
    if (!dead) {
      for (const ped of G.peds.list) {
        if (ped.down) continue;
        if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 14) {
          ped.health -= COMBAT.bulletDamage;
          ped.down = ped.health <= 0;
          if (ped.down) ped.downTimer = 4;
          dead = true;
          G.events.push({ kind: 'punchHit', x: ped.x, y: ped.y, strength: 0.6 });
          G.wanted.addHeat(ped.cop ? WANTED.heat.hitCop : WANTED.heat.killPed);
          break;
        }
      }
    }
    if (!dead) {
      for (const car of G.vehicles.list) {
        if (car.driver === 'player') continue;
        if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < 26) {
          car.damage = Math.min(100, car.damage + 12);
          dead = true;
          G.events.push({ kind: 'spark', x: bullet.x, y: bullet.y, strength: 0.5 });
          break;
        }
      }
    }
    if (dead) combat.bullets.splice(index, 1);
  }
}
