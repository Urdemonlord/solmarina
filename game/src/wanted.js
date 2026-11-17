// Wanted: a heat number (0-100) that crimes raise and hiding lowers, and the
// star count the HUD and the police read from it. Pure numbers, no drawing,
// so the unit tests can drive it directly.

import { WANTED } from './config.js';

export function createWanted() {
  const wanted = {
    heat: 0,
    stars: 0,
    lastCrimeAgo: 999,
    addHeat(amount) {
      wanted.heat = Math.min(100, wanted.heat + amount);
      wanted.lastCrimeAgo = 0;
      wanted.stars = starsFor(wanted.heat);
    },
    step(G, dt) {
      wanted.lastCrimeAgo += dt;
      if (wanted.lastCrimeAgo > WANTED.graceSeconds && wanted.heat > 0) {
        const near = policeNear(G);
        wanted.heat = Math.max(0, wanted.heat - (near ? WANTED.decayExposed : WANTED.decayHidden) * dt);
        wanted.stars = starsFor(wanted.heat);
      }
    },
  };
  return wanted;
}

export function starsFor(heat) {
  let stars = 0;
  for (let index = 0; index < WANTED.thresholds.length; index += 1) {
    if (heat >= WANTED.thresholds[index]) stars = index + 1;
  }
  return stars;
}

function policeNear(G) {
  if (!G.police) return false;
  for (const unit of G.police.units) {
    const x = unit.kind === 'car' ? unit.car.x : unit.ped.x;
    const y = unit.kind === 'car' ? unit.car.y : unit.ped.y;
    if (Math.hypot(x - G.player.x, y - G.player.y) < 400) return true;
  }
  return false;
}
