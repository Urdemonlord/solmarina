// Solmarina 3D: wanted level (heat -> stars, decay while hidden).
// Pure, no DOM, no THREE. Port of the 2D game's wanted math.
import { WANTED } from './config.js';

export class Wanted {
  constructor() {
    this.heat = 0;
    this.stars = 0;
    this.lastCrimeAgo = 999; // seconds since the last crime
    this.hiddenAgo = 999; // seconds since any police could see the player
    this.seen = false; // whether any police unit sees the player right now
  }

  get maxStars() {
    return WANTED.starAt.length;
  }

  addHeat(amount) {
    this.heat = Math.min(100, this.heat + amount);
    this.lastCrimeAgo = 0;
    this.recompute();
  }

  clear() {
    this.heat = 0;
    this.stars = 0;
    this.lastCrimeAgo = 999;
    this.hiddenAgo = 999;
    this.seen = false;
  }

  recompute() {
    let s = 0;
    for (let i = 0; i < WANTED.starAt.length; i++) {
      if (this.heat >= WANTED.starAt[i]) s = i + 1;
    }
    this.stars = s;
  }

  // dt seconds; seen = whether any police unit can see the player now.
  update(dt, seen) {
    this.lastCrimeAgo += dt;
    this.seen = !!seen;
    if (seen) this.hiddenAgo = 0;
    else this.hiddenAgo += dt;
    if (this.lastCrimeAgo > WANTED.decayDelay && this.hiddenAgo > 2) {
      // Line-of-sight escape: once the tail has been lost for a few
      // seconds, heat drains much faster than the slow background decay.
      const rate = this.hiddenAgo > WANTED.hiddenBoostAfter
        ? WANTED.hiddenDecayRate : WANTED.decayRate;
      this.heat = Math.max(0, this.heat - rate * dt);
      this.recompute();
    }
  }

  // True once the player has been out of every police unit's sight long
  // enough for the fast escape decay to kick in.
  get escaping() {
    return this.stars > 0 && !this.seen && this.hiddenAgo > WANTED.hiddenBoostAfter;
  }
}
