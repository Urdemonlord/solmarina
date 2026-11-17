// A small seeded random source (mulberry32) so the city and every staged scene
// are the same for a given seed, while ordinary play uses a random one.

export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max] inclusive. */
export function intIn(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of a non-empty array. */
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}
