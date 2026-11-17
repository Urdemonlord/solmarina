// Solmarina 3D: mission state machine (pure logic; the 3D beacons and HUD
// arrow read this state, they do not own it).
// A mission is a list of steps; each step completes from a plain context:
//   { playerX, playerZ, playerInCar, ramHits, stealDone, stars, timeLeft }
// update() returns an event string ('step', 'done', 'fail') or null.
import { MISSIONS } from './config.js';

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

export function nextMissionId(done) {
  for (const m of MISSIONS) {
    if (!done.includes(m.id)) return m.id;
  }
  return null;
}

export class MissionRunner {
  constructor() {
    this.active = null; // { def, stepIndex, timeLeft, ramHits, escapeTimer, stealDone }
    this.lastFinished = null; // { def, reward } of the most recently completed mission
  }

  start(def) {
    this.active = {
      def,
      stepIndex: 0,
      timeLeft: def.time,
      ramHits: 0,
      escapeTimer: 0,
      stealDone: false,
    };
    return this.active;
  }

  abort() {
    this.active = null;
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.def.steps[this.active.stepIndex] || null;
  }

  // Advance the current step. ctx: plain object, see header. dt in seconds.
  // Returns 'step' | 'done' | 'fail' | null.
  update(dt, ctx) {
    if (!this.active) return null;
    const a = this.active;
    a.timeLeft -= dt;
    if (a.timeLeft <= 0) {
      this.active = null;
      this.lastFinished = null;
      return 'fail';
    }
    const step = this.currentStep();
    if (!step) {
      this.active = null;
      return 'done';
    }
    if (step.kind === 'goto') {
      const dx = ctx.playerX - step.target.x;
      const dz = ctx.playerZ - step.target.z;
      if (dx * dx + dz * dz < 8 * 8) return this.advance();
    } else if (step.kind === 'ram') {
      if (a.ramHits >= (step.hits || 3)) return this.advance();
    } else if (step.kind === 'escape') {
      if (ctx.stars === 0) {
        a.escapeTimer += dt;
        if (a.escapeTimer >= (step.seconds || 60)) return this.advance();
      } else {
        a.escapeTimer = 0;
      }
    } else if (step.kind === 'steal') {
      if (a.stealDone) return this.advance();
    }
    return null;
  }

  advance() {
    const a = this.active;
    a.stepIndex += 1;
    if (a.stepIndex >= a.def.steps.length) {
      this.lastFinished = { def: a.def, reward: a.def.reward };
      this.active = null;
      return 'done';
    }
    return 'step';
  }

  // External events the world reports into the mission.
  onRam() {
    if (this.active) this.active.ramHits += 1;
  }

  onSteal() {
    if (this.active) this.active.stealDone = true;
  }
}
