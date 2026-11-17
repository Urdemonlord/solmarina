// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. Screens: title, play,
// paused, busted, wasted, story. ?seed=N fixes the city; ?shot=1-start|2-drive|
// 3-chase|4-mission stages that scene instead of running the loop, paints it
// twice and sets window.__solmarinaReady (and __shotReady) for a screenshot.

import { PLAYER, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createCity, nearestIntersection } from './city.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createPlayer, enterCar, exitCar, nearestCar, punch, stepOnFoot } from './player.js';
import { createVehicles, driveCar, resolveCarCollisions, resolveCarPedCollisions, spawnCar } from './vehicles.js';
import { createTraffic, stepTraffic } from './traffic.js';
import { createPeds, stepPeds } from './pedestrians.js';
import { createPolice, stepPolice } from './police.js';
import { createWanted } from './wanted.js';
import { createMissions, nextMission, startMission, stepMissions } from './missions.js';
import { createCombat, spawnPickups, stepCombat } from './combat.js';
import { createEffects } from './effects.js';
import { loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 15;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const random = createRandom(seed);

function createGame() {
  const city = createCity(random);
  const player = createPlayer(660, 1200);
  const G = {
    random,
    time: 0,
    clock: 8 * 60,
    screen: SCREEN_TITLE,
    city,
    player,
    vehicles: createVehicles(),
    peds: null,
    police: createPolice(),
    wanted: createWanted(),
    missions: createMissions(),
    combat: createCombat(),
    effects: createEffects(),
    camera: { x: player.x, y: player.y, trauma: 0, t: 0 },
    audio,
    input,
    events: [],
    storyComplete: false,
    bustedFine: 0,
    save: { exists: false, data: null },
    saveTimer: 0,
    skidTimer: 0,
    smokeTimer: 0,
  };
  G.peds = createPeds(G);
  // Parked cars on the street, one of them right by the spawn.
  const spots = city.parkingSpots.slice();
  const types = ['sedan', 'sedan', 'taxi', 'sedan', 'sport', 'truck', 'sedan', 'taxi'];
  for (let index = 0; index < 12 && spots.length > 0; index += 1) {
    const spot = spots.splice(Math.floor(random() * spots.length), 1)[0];
    spawnCar(G.vehicles, types[index % types.length], spot.x, spot.y, spot.angle, null);
  }
  const nearSpot = city.parkingSpots.reduce((best, spot) => {
    const d = Math.hypot(spot.x - 660, spot.y - 1200);
    return !best || d < best.d ? { spot, d } : best;
  }, null);
  if (nearSpot) spawnCar(G.vehicles, 'sedan', nearSpot.spot.x, nearSpot.spot.y, nearSpot.spot.angle, null);
  createTraffic(G);
  spawnPickups(G);
  const saved = loadSave();
  if (saved) G.save = { exists: true, data: saved };
  return G;
}

const G = createGame();

function announce(message) {
  status.textContent = message;
}

function resetWorld() {
  const fresh = createGame();
  for (const key of Object.keys(fresh)) G[key] = fresh[key];
  G.screen = SCREEN_PLAY;
}

function applySave(data) {
  G.player.money = data.money || 0;
  G.missions.done = Array.isArray(data.done) ? data.done.slice() : [];
  G.player.x = data.x || 660;
  G.player.y = data.y || 1200;
  G.player.health = data.health || PLAYER.health;
  G.clock = data.clock || 8 * 60;
  G.storyComplete = !!data.storyComplete;
  G.camera.x = G.player.x;
  G.camera.y = G.player.y;
}

function startGame(fromSave) {
  resetWorld();
  if (fromSave && G.save.exists) applySave(G.save.data);
  G.screen = SCREEN_PLAY;
  announce('Bermain. Misi pertama menunggu: tekan Enter untuk mulai.');
}

function handleBusted() {
  const fine = Math.min(G.player.money, 100 + G.wanted.stars * 50);
  G.bustedFine = fine;
  G.player.money -= fine;
  G.wanted.heat = 0;
  G.wanted.stars = 0;
  G.player.health = PLAYER.health;
  if (G.player.car) {
    G.player.car.driver = null;
    G.player.car = null;
    G.player.onFoot = true;
  }
  const station = nearestIntersection(G.city, 1500, 900);
  G.player.x = station.x + 40;
  G.player.y = station.y + 40;
  G.camera.x = G.player.x;
  G.camera.y = G.player.y;
  G.screen = SCREEN_BUSTED;
  audio.busted();
  announce(`Tertangkap. Denda $${fine}.`);
}

function handleWasted() {
  const bill = Math.min(G.player.money, 150);
  G.player.money -= bill;
  G.wanted.heat = 0;
  G.wanted.stars = 0;
  G.player.health = PLAYER.health;
  if (G.player.car) {
    G.player.car.driver = null;
    G.player.car = null;
    G.player.onFoot = true;
  }
  const hospital = nearestIntersection(G.city, 1900, 1000);
  G.player.x = hospital.x + 40;
  G.player.y = hospital.y + 40;
  G.camera.x = G.player.x;
  G.camera.y = G.player.y;
  G.screen = SCREEN_WASTED;
  announce('Raka tumbang. Rumah sakit memungut biaya.');
}

function processEvents() {
  for (const event of G.events) {
    if (event.kind === 'carCrash') {
      audio.crash(event.strength);
      G.camera.trauma = Math.min(1, G.camera.trauma + 0.3 * event.strength);
      G.effects.sparks(event.x, event.y);
    } else if (event.kind === 'pedHit') {
      audio.crash(0.6);
      G.camera.trauma = Math.min(1, G.camera.trauma + 0.3);
      G.effects.sparks(event.x, event.y);
    } else if (event.kind === 'punchHit' || event.kind === 'ramHit') {
      G.camera.trauma = Math.min(1, G.camera.trauma + 0.15);
      G.effects.sparks(event.x, event.y);
    } else if (event.kind === 'spark') {
      G.effects.sparks(event.x, event.y);
    } else if (event.kind === 'busted') {
      handleBusted();
    } else if (event.kind === 'wasted') {
      handleWasted();
    }
  }
  G.events.length = 0;
}

function aimAngle() {
  const ratio = window.devicePixelRatio || 1;
  const logicalX = (input.mouse.x * ratio - renderer.view.x) / renderer.view.scale;
  const logicalY = (input.mouse.y * ratio - renderer.view.y) / renderer.view.scale;
  const worldX = G.camera.x - VIEW.width / 2 + logicalX;
  const worldY = G.camera.y - VIEW.height / 2 + logicalY;
  return Math.atan2(worldY - G.player.y, worldX - G.player.x);
}

function stepPlay(dt) {
  const player = G.player;
  G.time += dt;
  G.clock += dt * 2;
  G.camera.t += dt;
  G.camera.trauma = Math.max(0, G.camera.trauma - 1.2 * dt);

  const move = input.move();
  if (player.onFoot) {
    stepOnFoot(G, dt, move, input.sprint());
  } else if (player.car) {
    const car = player.car;
    const throttle = -move.y;
    const steer = move.x;
    const result = driveCar(G, car, { throttle, steer }, dt);
    if (result.hit && Math.abs(car.speed) > 120) {
      audio.crash(Math.min(1, Math.abs(car.speed) / 600));
      G.camera.trauma = Math.min(1, G.camera.trauma + 0.35);
      G.effects.sparks(car.x, car.y);
      player.health = Math.max(0, player.health - Math.min(12, Math.abs(car.speed) * 0.012));
      if (player.health <= 0) G.events.push({ kind: 'wasted' });
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    // A wrecked car spits its driver out.
    if (car.destroyed) exitCar(G);
    // Hard cornering leaves skid marks.
    G.skidTimer -= dt;
    if (Math.abs(steer) > 0.6 && Math.abs(car.speed) > 300 && G.skidTimer <= 0) {
      G.skidTimer = 0.06;
      const backX = car.x - Math.cos(car.angle) * car.def.length * 0.4;
      const backY = car.y - Math.sin(car.angle) * car.def.length * 0.4;
      G.effects.addSkid(backX, backY, car.angle);
    }
    audio.engine(Math.abs(car.speed) / car.def.topSpeed);
  } else {
    audio.engine(0);
  }

  stepTraffic(G, dt);
  stepPeds(G, dt);
  stepPolice(G, dt);
  resolveCarCollisions(G);
  resolveCarPedCollisions(G);
  stepCombat(G, dt, aimAngle(), input.mouse.down && player.armed && player.onFoot);
  G.wanted.step(G, dt);
  stepMissions(G, dt);
  G.effects.step(dt);

  // Smoke from a battered player car.
  G.smokeTimer -= dt;
  if (player.car && player.car.damage > 50 && G.smokeTimer <= 0) {
    G.smokeTimer = 0.18;
    G.effects.smoke(player.car.x, player.car.y - 10);
  }
  for (const car of G.vehicles.list) {
    if (car.destroyed && Math.abs(car.x - player.x) < 700 && Math.random() < dt * 4) {
      G.effects.smoke(car.x, car.y);
    }
  }

  // Camera follows with a little look-ahead in the direction of travel.
  const lookX = player.onFoot ? 0 : Math.cos(player.angle) * 70;
  const lookY = player.onFoot ? 0 : Math.sin(player.angle) * 70;
  G.camera.x += (player.x + lookX - G.camera.x) * Math.min(1, 5 * dt);
  G.camera.y += (player.y + lookY - G.camera.y) * Math.min(1, 5 * dt);

  processEvents();

  // Autosave while playing, and the story card when the last mission lands.
  G.saveTimer += dt;
  if (G.saveTimer > AUTOSAVE_SECONDS) {
    G.saveTimer = 0;
    saveGame(G);
  }
  if (G.storyComplete && G.screen === SCREEN_PLAY) {
    G.screen = SCREEN_STORY;
  }
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    announce(muted ? 'Suara mati.' : 'Suara hidup.');
  }
  if (G.screen === SCREEN_TITLE) {
    if (actions & ACTION_CONFIRM) startGame(false);
  } else if (G.screen === SCREEN_PLAY) {
    if (actions & ACTION_PAUSE) {
      G.screen = SCREEN_PAUSED;
      announce('Jeda.');
    } else if (actions & ACTION_ENTER) {
      if (G.player.onFoot) {
        const car = nearestCar(G, 70);
        if (car) enterCar(G, car);
      } else {
        exitCar(G);
      }
    } else if (actions & ACTION_PUNCH) {
      punch(G);
    }
  } else if (G.screen === SCREEN_PAUSED) {
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
      G.screen = SCREEN_PLAY;
      announce('Lanjut.');
    }
  } else if (G.screen === SCREEN_BUSTED || G.screen === SCREEN_WASTED || G.screen === SCREEN_STORY) {
    if (actions & ACTION_CONFIRM) {
      G.screen = SCREEN_PLAY;
      announce('Bermain.');
    }
  }
}

// Enter or Space during play starts the next mission (click is for shooting).
window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (G.screen === SCREEN_PLAY && (event.code === 'Enter' || event.code === 'Space')) {
    if (!G.missions.active) {
      const next = nextMission(G.missions);
      if (next) startMission(G, next);
    }
  }
  if (G.screen === SCREEN_TITLE && event.code === 'KeyC' && G.save.exists) {
    startGame(true);
  }
});

function runShot(name) {
  const scene = stageShot(name, G);
  let painted = 0;
  function paint() {
    renderer.draw(G, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__solmarinaReady = true;
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (G.screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepPlay(STEP);
        accumulator -= STEP;
        if (G.screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
      // The title screen's backdrop stays alive: traffic drifts, peds walk.
      if (G.screen === SCREEN_TITLE) {
        G.time += 1 / 60;
        G.camera.t += 1 / 60;
        stepTraffic(G, 1 / 60);
        stepPeds(G, 1 / 60);
        G.effects.step(1 / 60);
      }
    }
    renderer.draw(G, G.screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === SCREEN_PLAY) {
      G.screen = SCREEN_PAUSED;
      announce('Jeda.');
    }
  });

  announce('Solmarina. Tekan Enter atau klik untuk mulai.');
  requestAnimationFrame(frame);
}

// A handle for verification and debugging: the live game state, read-only use.
window.__solmarina = G;

if (shot) runShot(shot);
else runGame();
