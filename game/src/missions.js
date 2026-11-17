// The story: five missions for Raka, each a short step list the interpreter
// below runs. A step is one verb (go to, chase, survive, steal, escort); the
// mission only ends when its steps do, or its timer runs out. Pure state
// machine, no drawing: the HUD and the minimap read waypoint() and
// objectiveText().

import { PLAZA, WANTED } from './config.js';
import { driveCar, spawnCar } from './vehicles.js';

const CAFE = { x: PLAZA.x + PLAZA.width / 2, y: PLAZA.y + PLAZA.height / 2 };
const HIDEOUT = { x: 400, y: 2280 };
const GARAGE = { x: 300, y: 1000 };
const MANSION = { x: 3080, y: 320 };
const EAGLE_SPOT = { x: 2768, y: 666 };
const CHASE_LOOP = [
  { x: 600, y: 600 },
  { x: 2600, y: 600 },
  { x: 2600, y: 1800 },
  { x: 600, y: 1800 },
];

export const MISSION_DEFS = [
  {
    id: 'm0',
    title: 'Paket Pertama',
    giver: 'Dara',
    brief: 'Antar paket ini ke Kafe Ombak di alun-alun. Jalan santai, jangan bikin ribut.',
    reward: 150,
    steps: [{ type: 'goto', x: CAFE.x, y: CAFE.y, radius: 80, label: 'Antar paket ke Kafe Ombak', timeLimit: 150 }],
  },
  {
    id: 'm1',
    title: 'Kejar si Bayang',
    giver: 'Dara',
    brief: 'Si Bayang bawa kabur uang kas. Tabrak dia tiga kali, atau tempel terus sampai dia menyerah.',
    reward: 300,
    steps: [{ type: 'chase', label: 'Kejar mobil hitam si Bayang', ramHits: 3, tailSeconds: 4, tailRange: 90, escapeSeconds: 10 }],
  },
  {
    id: 'm2',
    title: 'Kabur dari Razia',
    giver: 'Marlo',
    brief: 'Razia besar-besaran. Bertahan satu menit, lalu sembunyi di rumah pantai barat.',
    reward: 400,
    steps: [
      { type: 'escape', seconds: 60, label: 'Bertahan dari polisi: 60 detik' },
      { type: 'goto', x: HIDEOUT.x, y: HIDEOUT.y, radius: 90, label: 'Sembunyi di rumah pantai', timeLimit: 90 },
    ],
  },
  {
    id: 'm3',
    title: 'Curi si Elang',
    giver: 'Marlo',
    brief: 'Elang emas itu parkir di marina. Bawa ke bengkel barat. Cepat, sebelum pemiliknya sadar.',
    reward: 600,
    steps: [
      { type: 'steal', label: 'Curi Elang emas di marina', timeLimit: 90 },
      { type: 'goto', x: GARAGE.x, y: GARAGE.y, radius: 90, label: 'Antar Elang ke bengkel', timeLimit: 120 },
    ],
  },
  {
    id: 'm4',
    title: 'Antar Bos',
    giver: 'Marlo',
    brief: 'Antar aku ke rumah besar di timur laut. Mobil jangan sampai rusak parah. Tepat waktu.',
    reward: 1000,
    steps: [
      { type: 'board', label: 'Naik mobil apa saja', timeLimit: 60 },
      { type: 'escort', x: MANSION.x, y: MANSION.y, radius: 90, label: 'Antar Bos ke rumah besar', timeLimit: 180, maxDamage: 70 },
    ],
  },
];

export function createMissions() {
  return {
    defs: MISSION_DEFS,
    done: [],
    active: null,
    banner: null,
    bannerTimer: 0,
  };
}

export function nextMission(missions) {
  return missions.defs.find((def) => !missions.done.includes(def.id)) || null;
}

function startStep(G, mission, step) {
  const state = mission.state;
  state.timer = step.timeLimit || 0;
  state.hits = 0;
  state.tailTime = 0;
  state.escapeTimer = 0;
  state.farTimer = 0;
  state.escapeTimeLeft = step.seconds || 0;
  if (step.type === 'chase') {
    const car = spawnCar(G.vehicles, 'sedan', 1400, 600, 0, 'target');
    car.color = '#22222a';
    car.speed = 200;
    state.targetCar = car;
    state.loopIndex = 0;
  }
  if (step.type === 'steal') {
    const car = spawnCar(G.vehicles, 'sport', EAGLE_SPOT.x, EAGLE_SPOT.y, Math.PI / 2, null);
    car.color = '#e8c93a';
    state.targetCar = car;
  }
  if (step.type === 'escape') {
    G.wanted.addHeat(55);
  }
}

export function startMission(G, def) {
  const mission = {
    def,
    stepIndex: 0,
    state: {},
    status: 'active',
    failReason: '',
  };
  G.missions.active = mission;
  startStep(G, mission, def.steps[0]);
  G.missions.banner = `${def.title} — ${def.giver}`;
  G.missions.bannerTimer = 3;
  return mission;
}

function failMission(G, reason) {
  const mission = G.missions.active;
  mission.status = 'failed';
  mission.failReason = reason;
  G.missions.banner = `Misi gagal: ${reason}`;
  G.missions.bannerTimer = 3;
  G.audio.fail();
}

function completeMission(G) {
  const mission = G.missions.active;
  mission.status = 'done';
  G.missions.done.push(mission.def.id);
  G.player.money += mission.def.reward;
  G.missions.banner = `Misi selesai! +$${mission.def.reward}`;
  G.missions.bannerTimer = 3;
  G.audio.jingle();
  G.missions.active = null;
  if (mission.def.id === 'm4') G.storyComplete = true;
}

function advanceStep(G, mission) {
  mission.stepIndex += 1;
  if (mission.stepIndex >= mission.def.steps.length) {
    completeMission(G);
    return;
  }
  startStep(G, mission, mission.def.steps[mission.stepIndex]);
}

function driveChaseTarget(G, car, dt) {
  const state = G.missions.active.state;
  const corner = CHASE_LOOP[state.loopIndex];
  const desired = Math.atan2(corner.y - car.y, corner.x - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.5));
  driveCar(G, car, { throttle: 0.75, steer }, dt);
  if (Math.hypot(corner.x - car.x, corner.y - car.y) < 90) {
    state.loopIndex = (state.loopIndex + 1) % CHASE_LOOP.length;
  }
}

export function stepMissions(G, dt) {
  const missions = G.missions;
  if (missions.bannerTimer > 0) missions.bannerTimer -= dt;
  const mission = missions.active;
  if (!mission || mission.status !== 'active') return;
  const step = mission.def.steps[mission.stepIndex];
  const state = mission.state;
  const player = G.player;

  if (step.timeLimit) {
    state.timer -= dt;
    if (state.timer <= 0) {
      failMission(G, 'Waktu habis');
      return;
    }
  }

  if (step.type === 'goto') {
    const dist = Math.hypot(player.x - step.x, player.y - step.y);
    if (dist < step.radius) advanceStep(G, mission);
    return;
  }
  if (step.type === 'board') {
    if (!player.onFoot) advanceStep(G, mission);
    return;
  }
  if (step.type === 'steal') {
    if (player.car === state.targetCar) {
      G.wanted.addHeat(WANTED.heat.stealParked);
      advanceStep(G, mission);
    }
    return;
  }
  if (step.type === 'escort') {
    if (!player.onFoot && player.car) {
      if (player.car.damage > step.maxDamage) {
        failMission(G, 'Mobil rusak parah');
        return;
      }
      const dist = Math.hypot(player.x - step.x, player.y - step.y);
      if (dist < step.radius) advanceStep(G, mission);
    }
    return;
  }
  if (step.type === 'escape') {
    state.escapeTimeLeft -= dt;
    if (state.escapeTimeLeft <= 0) {
      advanceStep(G, mission);
    }
    return;
  }
  if (step.type === 'chase') {
    const car = state.targetCar;
    if (!car || car.destroyed) {
      failMission(G, 'Target lolos');
      return;
    }
    driveChaseTarget(G, car, dt);
    const dist = Math.hypot(player.x - car.x, player.y - car.y);
    if (dist < step.tailRange) {
      state.tailTime += dt;
      if (state.tailTime >= step.tailSeconds) {
        advanceStep(G, mission);
        return;
      }
    } else {
      state.tailTime = Math.max(0, state.tailTime - dt);
    }
    if (dist > 900) {
      state.farTimer += dt;
      if (state.farTimer > step.escapeSeconds) {
        failMission(G, 'Target kabur');
        return;
      }
    } else {
      state.farTimer = 0;
    }
    // Ramming the target counts: a hard hit while close.
    for (const event of G.events) {
      if (event.kind === 'carCrash' && Math.hypot(event.x - car.x, event.y - car.y) < 90) {
        state.hits += 1;
        G.events.push({ kind: 'ramHit', x: car.x, y: car.y, strength: 0.6 });
        if (state.hits >= step.ramHits) {
          advanceStep(G, mission);
          return;
        }
      }
    }
  }
}

/** The current waypoint for the arrow and the minimap, or null. */
export function waypoint(G) {
  const mission = G.missions.active;
  if (!mission || mission.status !== 'active') return null;
  const step = mission.def.steps[mission.stepIndex];
  const state = mission.state;
  if (step.type === 'goto' || step.type === 'escort') return { x: step.x, y: step.y };
  if (step.type === 'chase' || step.type === 'steal') {
    return state.targetCar ? { x: state.targetCar.x, y: state.targetCar.y } : null;
  }
  return null;
}

/** The objective line the HUD shows, with its live distance or timer. */
export function objectiveText(G) {
  const mission = G.missions.active;
  if (!mission || mission.status !== 'active') {
    const next = nextMission(G.missions);
    return next ? `Misi berikutnya: ${next.title} — tekan Enter untuk mulai` : 'Semua misi selesai. Solmarina milikmu.';
  }
  const step = mission.def.steps[mission.stepIndex];
  const state = mission.state;
  let extra = '';
  if (step.type === 'goto' || step.type === 'escort') {
    const dist = Math.round(Math.hypot(G.player.x - step.x, G.player.y - step.y));
    extra = ` (${dist}m)`;
  }
  if (step.type === 'chase') {
    extra = ` — tabrak ${state.hits}/${step.ramHits}`;
  }
  if (step.type === 'escape') {
    extra = ` — ${Math.ceil(state.escapeTimeLeft)} dtk`;
  }
  if (step.timeLimit) {
    extra += ` — ${Math.ceil(state.timer)} dtk`;
  }
  return `${mission.def.title}: ${step.label}${extra}`;
}
