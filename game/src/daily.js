// Solmarina 3D: daily events (pure logic; no DOM, no THREE).
// One event per real calendar day, picked deterministically from the
// date so every player gets the same event on the same day. Three
// kinds rotate: a street race, a bounty takedown, a delivery run.
// An event is a small state machine over a plain context:
//   { playerX, playerZ, playerInCar, checkpointIndex, bountyDown, stops }
// update() returns 'step' | 'done' | 'fail' | null.
import { mulberry32 } from './random.js';

export const DAILY_TYPES = {
  race: {
    id: 'race', name: 'Balap Jalanan', reward: 500, time: 150,
    blurb: 'Balap keliling kota: lewati 4 checkpoint sebelum waktu habis.',
    start: { x: 120, z: 120 },
    checkpoints: [
      { x: 120, z: -200 },
      { x: -200, z: -200 },
      { x: -200, z: 200 },
      { x: 200, z: 120 },
    ],
  },
  bounty: {
    id: 'bounty', name: 'Buronan Hari Ini', reward: 600, time: 180,
    blurb: 'Seorang buronan bersembunyi di Taman Kota. Jatuhkan dia.',
    start: { x: -80, z: 160 },
    target: { x: -80, z: 160 },
  },
  delivery: {
    id: 'delivery', name: 'Antar Kilat', reward: 450, time: 150,
    blurb: 'Antar 3 paket kilat: kafe, marina, pelabuhan. Jangan telat.',
    start: { x: 0, z: -40 },
    stops: [
      { x: 160, z: 120 },
      { x: -210, z: 250 },
      { x: 205, z: -195 },
    ],
  },
};

export const DAILY_ORDER = ['race', 'bounty', 'delivery'];

// YYYY-MM-DD in local time, so the event flips at midnight.
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Deterministic pick: the same date always yields the same event.
export function dailyEventFor(dateKey) {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  const rng = mulberry32(h || 1);
  const id = DAILY_ORDER[Math.floor(rng() * DAILY_ORDER.length)];
  return DAILY_TYPES[id];
}

export function dailyDefFor(date = new Date()) {
  return dailyEventFor(todayKey(date));
}

export class DailyEvent {
  constructor(def) {
    this.def = def;
    this.active = false;
    this.done = false;
    this.timeLeft = def.time;
    this.stepIndex = 0; // checkpoints/stops reached
  }

  start() {
    this.active = true;
    this.timeLeft = this.def.time;
    this.stepIndex = 0;
    return this;
  }

  abort() {
    this.active = false;
  }

  // The current target point, or null when the event has no target.
  currentTarget() {
    if (!this.active) return null;
    const def = this.def;
    if (def.id === 'race') return def.checkpoints[this.stepIndex] || null;
    if (def.id === 'delivery') return def.stops[this.stepIndex] || null;
    if (def.id === 'bounty') return def.target;
    return null;
  }

  stepLabel() {
    if (!this.active) return '';
    const def = this.def;
    if (def.id === 'race') {
      return `Checkpoint ${this.stepIndex + 1}/${def.checkpoints.length}`;
    }
    if (def.id === 'delivery') {
      return `Antar paket ${this.stepIndex + 1}/${def.stops.length}`;
    }
    return 'Jatuhkan buronan di Taman Kota';
  }

  update(dt, ctx) {
    if (!this.active) return null;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.active = false;
      return 'fail';
    }
    const def = this.def;
    if (def.id === 'race' || def.id === 'delivery') {
      const list = def.id === 'race' ? def.checkpoints : def.stops;
      const target = list[this.stepIndex];
      if (!target) {
        this.active = false;
        this.done = true;
        return 'done';
      }
      const dx = ctx.playerX - target.x;
      const dz = ctx.playerZ - target.z;
      const radius = def.id === 'race' ? 10 : 8;
      if (dx * dx + dz * dz < radius * radius) {
        this.stepIndex += 1;
        if (this.stepIndex >= list.length) {
          this.active = false;
          this.done = true;
          return 'done';
        }
        return 'step';
      }
    } else if (def.id === 'bounty') {
      if (ctx.bountyDown) {
        this.active = false;
        this.done = true;
        return 'done';
      }
    }
    return null;
  }
}
