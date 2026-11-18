// Solmarina 3D: bootstrap + game loop (browser only).
// Original open-world crime game: city Solmarina, protagonist Raka.
// Third-person on foot and by car, traffic, pedestrians, wanted + police,
// 5 missions, combat, HUD + minimap, save. Three.js (vendored) + DOM HUD.
import { WORLD, PLAYER, CAR, WANTED, GANGS, MISSIONS, SPAWNS, LIMITS, STALLS } from './config.js';
import { mulberry32, clamp, turnToward, dist2 } from './random.js';
import { hourFromClock } from './daynight.js';
import { Wanted } from './wanted.js';
import { MissionRunner, nextMissionId, missionById } from './missions.js';
import { createGangWar, updateGangWar, canTriggerWar, crossfireLines } from './gangs.js';
import { collideBuildings, collideStalls, blockLoop, routePoints } from './city.js';
import { createCar, updateCar, collideCars } from './vehicles.js';
import { createPlayer, updatePlayerOnFoot, syncPlayerMesh } from './player.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPeds, updatePeds, syncPedMesh } from './pedestrians.js';
import {
  createPolice, createHeli, updateHeli, balanceUnits, updatePolice, policeCanSee, applyBusted, applyWasted,
} from './police.js';
import { punch, shootAim, policeFire } from './combat.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  initRenderer, buildEnvironment, createDayNight, makeCarMesh, makeHumanMesh, makeBeaconMesh,
  makePickupMesh, makeHeliMesh, createCameraRig, createTracers,
} from './render.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { writeSave, readSave, SAVE_KEY } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed') || 1);
const SHOT = params.get('shot') || null;

const canvas = document.getElementById('game');
const { renderer, scene, camera, sun, hemi } = initRenderer(canvas);
const env = buildEnvironment(scene, SEED);
const dayNight = createDayNight(scene, sun, hemi, env);
const buildings = env.buildings;
const input = createInput();
const audio = createAudio();
const cameraRig = createCameraRig(camera);
const hud = createHud(buildings);
const effects = createEffects(scene, audio, cameraRig, hud);
const tracers = createTracers(scene);
const rng = mulberry32(SEED * 7919 + 13);

const G = {
  screen: 'title',
  clock: 0, // minutes since 08:00
  saveTimer: 0,
  seed: SEED,
  rng,
  buildings,
  wanted: new Wanted(),
  missions: new MissionRunner(),
  police: createPolice(),
  gangs: { active: false, cooldown: 0, members: [], winner: null, endTimer: 0, time: 0 },
  heli: createHeli(),
  isNight: false,
  mapReturn: 'play',
  routeTimer: 0,
  player: createPlayer(SPAWNS.player.x, SPAWNS.player.z, SPAWNS.player.heading),
  vehicles: { list: [] },
  peds: { list: [] },
  cameraRig,
  camera,
  renderer,
  scene,
  save: { exists: false },
};
G.missions.defs = MISSIONS;
G.tracers = tracers;
G.effects = effects;
window.__solmarina = G;

// ---------- meshes ----------
const carMeshes = new Map();
function meshForCar(car) {
  if (!carMeshes.has(car)) {
    const mesh = makeCarMesh(car.type);
    mesh.userData.ref = { kind: 'car', car };
    scene.add(mesh);
    carMeshes.set(car, mesh);
  }
  return carMeshes.get(car);
}
function syncCarMesh(car) {
  const mesh = meshForCar(car);
  mesh.position.set(car.x, 0, car.z);
  mesh.rotation.y = car.heading;
  mesh.visible = !car.destroyed;
  if (car.damage >= 60 && !car.destroyed) {
    mesh.rotation.z = Math.sin(performance.now() / 90) * 0.01;
  }
  const spin = car.speed * 0.5;
  for (const w of mesh.userData.wheels) w.rotation.x += spin * 0.016;
  if (mesh.userData.lightBar) {
    mesh.userData.lightBar.visible = car.driver === 'police';
  }
  // headlights at night: the player's car and police cars light the road
  if (mesh.userData.headlight) {
    mesh.userData.headlight.intensity = G.isNight
      ? (car.driver === 'player' ? 90 : car.driver === 'police' ? 50 : 0)
      : 0;
  }
}

const playerMesh = makeHumanMesh(0xf2f2f2, 0x2e4a6a, 0xd9a066);
scene.add(playerMesh);

const pedMeshes = new Map();
function meshForPed(ped) {
  if (!pedMeshes.has(ped)) {
    const mesh = makeHumanMesh(ped.shirt, ped.pants, 0xd9a066);
    mesh.userData.ref = { kind: ped.cop ? 'cop' : 'ped', ped };
    scene.add(mesh);
    pedMeshes.set(ped, mesh);
  }
  return pedMeshes.get(ped);
}

// Gang members get their own mesh map (same human mesh, gang colours);
// the ref carries the war so shootAim() can mark the gang hostile.
const gangMeshes = new Map();
function meshForGang(member) {
  if (!gangMeshes.has(member)) {
    const mesh = makeHumanMesh(member.shirt, member.pants, 0xd9a066);
    mesh.userData.ref = { kind: 'gang', member, war: G.gangs };
    // gang members read bigger and brighter than peds, and the team
    // colour must be obvious at a glance in the night shootout: 1.3x
    // scale plus a glowing team headband (peds keep the dark hair).
    mesh.scale.setScalar(1.3);
    const bandColor = member.gang === 'ombak' ? 0x35e0f5 : 0xff5a3c;
    const bandMat = new THREE.MeshLambertMaterial({ color: bandColor, emissive: bandColor, emissiveIntensity: 0.7 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.36), bandMat);
    band.position.y = 1.78;
    mesh.add(band);
    scene.add(mesh);
    gangMeshes.set(member, mesh);
  }
  return gangMeshes.get(member);
}
G.gangMeshes = gangMeshes; // live tests stand the war down through this

// mission beacon + direction arrow + pistol pickup
const beacon = makeBeaconMesh();
beacon.visible = false;
scene.add(beacon);
// direction arrow: a small floating chevron (cone + shaft) that points at
// the objective, plus a dashed route line along the road grid. Kept small
// and translucent: it is a hint, not the subject of the frame.
const arrow = new THREE.Group();
{
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85 });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 1.0, 8),
    arrowMat,
  );
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.6;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.9, 8),
    arrowMat,
  );
  head.rotation.x = -Math.PI / 2; // cone tip toward -z (the facing direction)
  head.position.z = -0.35;
  arrow.add(shaft, head);
}
arrow.visible = false;
scene.add(arrow);
const ROUTE_MAX = 10;
const routeGeo = new THREE.BufferGeometry();
routeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROUTE_MAX * 3), 3));
const routeLine = new THREE.Line(routeGeo, new THREE.LineDashedMaterial({ color: 0xffd23e, dashSize: 2.5, gapSize: 1.8 }));
routeLine.visible = false;
routeLine.frustumCulled = false;
scene.add(routeLine);
function updateRouteLine(from, to) {
  const pts = routePoints(from, to);
  const pos = routeGeo.attributes.position.array;
  const n = Math.min(pts.length, ROUTE_MAX);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = pts[i].x;
    pos[i * 3 + 1] = 0.35;
    pos[i * 3 + 2] = pts[i].z;
  }
  routeGeo.setDrawRange(0, n);
  routeGeo.attributes.position.needsUpdate = true;
  routeLine.computeLineDistances();
  routeLine.visible = n >= 2;
}
// police helicopter mesh (one, reused)
const heliMesh = makeHeliMesh();
heliMesh.visible = false;
scene.add(heliMesh);
G.heliMesh = heliMesh;
const pickup = makePickupMesh();
pickup.position.set(SPAWNS.pistolPickup.x, 1.2, SPAWNS.pistolPickup.z);
scene.add(pickup);

// ---------- spawn the world ----------
const PARKED_SPOTS = [
  { type: 'sedan', x: 8, z: -120 }, { type: 'taxi', x: -8, z: 40 },
  { type: 'sports', x: 120, z: -8 }, { type: 'sedan', x: -120, z: 8 },
  { type: 'truck', x: 40, z: 120 }, { type: 'taxi', x: -40, z: -120 },
  { type: 'sedan', x: 200, z: 40 }, { type: 'sports', x: -200, z: -40 },
];
for (const s of PARKED_SPOTS) {
  const car = createCar(s.type, s.x, s.z, Math.PI / 2);
  G.vehicles.list.push(car);
}
// the m3 target: a red sports car parked at the marina
const marinaCar = createCar('sports', SPAWNS.marina.x, SPAWNS.marina.z, 0);
marinaCar.special = 'm3';
G.vehicles.list.push(marinaCar);

for (const car of createTraffic(rng, LIMITS.trafficCars, buildings)) {
  G.vehicles.list.push(car);
}
G.peds.list = createPeds(rng, LIMITS.peds);

// ---------- helpers ----------
function nearestCar(maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const car of G.vehicles.list) {
    if (car.destroyed) continue;
    const d2 = dist2(car.x, car.z, G.player.x, G.player.z);
    if (d2 < bestD) { best = car; bestD = d2; }
  }
  return best;
}

function nearestStall(maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const s of STALLS) {
    const d2 = dist2(s.x, s.z, G.player.x, G.player.z);
    if (d2 < bestD) { best = s; bestD = d2; }
  }
  return best;
}

G.enterCar = function (car, silent) {
  if (car.driver && car.driver !== 'player') return false; // occupied
  if (car.special === 'm3') {
    G.missions.onSteal();
    if (G.missions.active && G.missions.currentStep() && G.missions.currentStep().kind === 'steal') {
      // step advances on the next update
    }
  }
  if (!car.driver) {
    G.wanted.addHeat(WANTED.crimeHeat.stealCar);
    if (!silent) audio.pickup();
  }
  car.driver = 'player';
  G.player.car = car;
  G.player.onFoot = false;
  G.player.x = car.x; G.player.z = car.z;
  return true;
};

function exitCar() {
  const car = G.player.car;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  G.player.car = null;
  G.player.onFoot = true;
  G.player.x = car.x + 3.5;
  G.player.z = car.z + 1;
  G.player.heading = car.heading;
  cameraRig.snapTo(car.heading);
}

function startNextMission() {
  const id = nextMissionId(G.missions.done || []);
  if (!id) { hud.setPrompt('Semua misi selesai!'); return; }
  const def = missionById(id);
  if (id === 'm4' && !G.player.car) {
    hud.setPrompt('Misi ini butuh mobil: curi satu dulu');
    return;
  }
  G.missions.start(def);
  if (id === 'm2') G.wanted.addHeat(55); // escape starts at 3 stars
  if (id === 'm1') spawnTargetCar();
  audio.missionStart();
  hud.setObjective(def.title + ': ' + def.steps[0].label);
}

let targetCar = null;
function spawnTargetCar() {
  if (targetCar && !targetCar.destroyed) return;
  targetCar = createCar('sedan', 80, -80, 0);
  targetCar.driver = 'target';
  targetCar.cruise = 16;
  targetCar.loop = blockLoop(4, 2);
  targetCar.wp = 0;
  G.vehicles.list.push(targetCar);
}

function missionTarget() {
  const step = G.missions.currentStep();
  if (!step) return null;
  if (step.kind === 'ram' && targetCar) return { x: targetCar.x, z: targetCar.z };
  return step.target || null;
}

function applySaveData(s) {
  G.player.money = s.money;
  G.missions.done = [...s.done];
  G.player.health = s.health;
  G.player.x = s.player.x;
  G.player.z = s.player.z;
  G.player.heading = s.player.heading;
  G.player.hasPistol = !!s.hasPistol;
  G.player.ammo = G.player.hasPistol ? 24 : 0;
}

function doSave() {
  writeSave(window.localStorage, {
    money: G.player.money,
    done: G.missions.done || [],
    health: G.player.health,
    playerX: G.player.x,
    playerZ: G.player.z,
    heading: G.player.heading,
    hasPistol: G.player.hasPistol,
  });
}
G.missions.done = [];

// ---------- screens ----------
function showTitle() {
  G.screen = 'title';
  hud.hideMap();
  const s = readSave(window.localStorage);
  G.save.exists = !!s;
  hud.showScreen('title', s);
}
function startGame(fromSave) {
  if (fromSave) {
    const s = readSave(window.localStorage);
    if (s) applySaveData(s);
  } else {
    G.player.money = 0;
    G.missions.done = [];
    G.player.health = PLAYER.health;
  }
  G.screen = 'play';
  hud.showScreen('play');
  audio.unlock();
  audio.click();
  cameraRig.snapTo(G.player.heading);
}

// ---------- main loop ----------
let lastT = performance.now();
let shotFrames = 0;

function frame(now) {
  // rAF timestamps can lag performance.now() in headless/software rendering,
  // so clamp dt to [0, 0.05]: a negative dt would run the world backwards.
  let dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000));
  lastT = now;
  dt *= effects.timeScale(now);
  // day/night follows the game clock on every screen (menus included, so
  // the title can sit at golden hour)
  const tod = dayNight.apply(hourFromClock(G.clock));
  G.isNight = tod.night;
  if (G.screen === 'play') update(dt, now);
  else if (G.screen === 'title' || G.screen === 'paused' || G.screen === 'busted' || G.screen === 'wasted' || G.screen === 'map') {
    // staged shot camera wins on menu screens; otherwise a high slow orbit
    // so the city fills the frame behind the menus
    if (SHOT && G.shotCamera) {
      camera.position.set(G.shotCamera.pos.x, G.shotCamera.pos.y, G.shotCamera.pos.z);
      camera.lookAt(G.shotCamera.look.x, G.shotCamera.look.y, G.shotCamera.look.z);
    } else {
      cameraRig.updateMenu(dt, { x: G.player.x, z: G.player.z }, now);
    }
  }
  // sun follows the player so shadows stay local; its height/angle follow
  // the time of day (low and warm at golden hour)
  sun.position.set(G.player.x + dayNight.sunOffset.x, dayNight.sunOffset.y, G.player.z + dayNight.sunOffset.z);
  sun.target.position.set(G.player.x, 0, G.player.z);
  // the sun disc always faces the camera (a billboard): from the title
  // camera it reads as a round sun in the upper-left sky, not a squashed
  // ellipse, and it is never hidden on the title screen (the old hide
  // existed because the disc sat dead-centre behind the title text; it
  // now sits upper-left, clear of the text)
  env.sunDisc.lookAt(camera.position);
  renderer.render(scene, camera);
  if (SHOT) {
    shotFrames++;
    if (shotFrames >= 2) {
      window.__solmarinaReady = true;
      return; // stop the loop after the staged frame (no game loop in shot mode)
    }
  }
  requestAnimationFrame(frame);
}

function update(dt, now) {
  G.clock += dt * 0.25; // 1 game minute per 4 real seconds: a day in ~96 min
  const p = G.player;

  // --- input: one-shot keys ---
  if (input.consume('KeyM')) audio.toggleMute();
  if (input.consume('Enter')) {
    if (!G.missions.active) startNextMission();
  }
  if (input.consume('KeyE')) {
    if (p.onFoot) {
      // market stall first: buying beats stealing a car next to a stall
      const stall = nearestStall(4.5);
      if (stall) {
        if (G.player.money >= stall.price) {
          G.player.money -= stall.price;
          G.player.health = Math.min(100, G.player.health + stall.heal);
          audio.pickup();
          hud.setPrompt(stall.item + ' dibeli! Nyawa +' + stall.heal + ' (sisa $' + G.player.money + ')');
        } else {
          hud.setPrompt(stall.name + ': ' + stall.flavor);
        }
      } else {
        const car = nearestCar(4.5);
        if (car) {
          if (car.driver === 'traffic' || car.driver === 'target') {
            G.wanted.addHeat(WANTED.crimeHeat.carjack);
          }
          G.enterCar(car, false);
        }
      }
    } else {
      exitCar();
    }
  }
  if (input.consume('KeyF') && p.onFoot) {
    const hit = punch(p, G.peds.list, G.police.units, effects, G.gangs.active ? G.gangs : null);
    audio.punch();
    if (hit && hit.kind === 'cop') G.wanted.addHeat(WANTED.crimeHeat.hitCop);
    else if (hit && hit.kind === 'gang') G.wanted.addHeat(WANTED.crimeHeat.shoot);
    else if (hit) G.wanted.addHeat(WANTED.crimeHeat.punch);
    cameraRig.addTrauma(0.15);
  }
  if (input.consumeClick() && p.onFoot && p.hasPistol && p.ammo > 0) {
    p.ammo--;
    audio.gunshot();
    // horizontal aim from the gun along the camera's forward (see shootAim
    // in combat.js: the centre ray used to dive into the ground 2.7 units
    // past Raka, so the pistol could never hit anything further away)
    const aim = new THREE.Vector3();
    camera.getWorldDirection(aim);
    aim.y = 0; aim.normalize();
    const origin = { x: p.x, y: 1.3, z: p.z };
    const targets = [];
    for (const [ped] of pedMeshes) targets.push({ ref: { kind: ped.cop ? 'cop' : 'ped', ped } });
    for (const [car] of carMeshes) targets.push({ ref: { kind: 'car', car } });
    for (const [member] of gangMeshes) targets.push({ ref: { kind: 'gang', member, war: G.gangs } });
    const res = shootAim(origin, { x: aim.x, z: aim.z }, targets, effects);
    if (res && res.victim) G.wanted.addHeat(WANTED.crimeHeat.shoot);
    if (res) tracers.fire(origin, res.point, 0xffd27f, 0.09);
    cameraRig.addTrauma(0.25);
  }

  // --- movement ---
  const drag = input.consumeDrag();
  if (p.onFoot) {
    const newCamYaw = updatePlayerOnFoot(p, input, cameraRigYaw(), dt, buildings);
    G.camYaw = newCamYaw;
    // pistol pickup
    if (!p.hasPistol && dist2(p.x, p.z, SPAWNS.pistolPickup.x, SPAWNS.pistolPickup.z) < 4) {
      p.hasPistol = true;
      p.ammo = 24;
      pickup.visible = false;
      audio.pickup();
      hud.setPrompt('Pistol didapat! Klik untuk menembak');
    }
  } else {
    const car = p.car;
    const inputCar = {
      fwd: input.moveY > 0 ? 1 : 0,
      back: input.moveY < 0 ? 1 : 0,
      left: input.moveX < 0,
      right: input.moveX > 0,
    };
    updateCar(car, inputCar, dt);
    if (input.handbrake) car.speed *= Math.max(0, 1 - 3 * dt);
    // building + stall collision (both run: no short-circuit)
    const hitBuilding = collideBuildings(buildings, car, CAR.radius);
    const hitStall = collideStalls(car, CAR.radius);
    if (hitBuilding || hitStall) {
      const impact = Math.abs(car.speed);
      if (impact > 8) {
        car.damage = Math.min(CAR.maxDamage, car.damage + impact * 0.8);
        effects.feedback(impact > 18 ? 'large' : 'medium', car.x, 1, car.z);
        G.wanted.addHeat(WANTED.crimeHeat.crash);
        if (impact > 18) p.health = Math.max(0, p.health - 6);
      }
      car.speed *= 0.45;
    }
    // world bounds (beach / water)
    car.x = clamp(car.x, -WORLD.half - 10, WORLD.half + 10);
    car.z = clamp(car.z, -WORLD.half - 10, WORLD.beachZ + 24);
    p.x = car.x; p.z = car.z;
    p.heading = car.heading;
    G.camYaw = car.heading;
    // skid marks when handbraking or hard steering at speed
    if ((input.handbrake || Math.abs(car.steer) > 1.5) && Math.abs(car.speed) > 10 && Math.random() < 0.6) {
      effects.skids.add(car.x + Math.sin(car.heading) * 1.5, car.z + Math.cos(car.heading) * 1.5, car.heading);
    }
    // smoke when badly damaged
    if (car.damage >= 60 && Math.random() < dt * 8) {
      effects.smoke(car.x, 1.2, car.z);
    }
    if (car.destroyed) {
      effects.feedback('large', car.x, 1.5, car.z);
      exitCar();
      p.health = Math.max(0, p.health - 20);
    }
  }
  p.x = clamp(p.x, -WORLD.half - 10, WORLD.half + 10);
  p.z = clamp(p.z, -WORLD.half - 10, WORLD.beachZ + 24);

  // --- traffic ---
  updateTraffic(G.vehicles.list.filter((c) => c.driver === 'traffic'), dt, G.vehicles.list);
  if (targetCar && !targetCar.destroyed) {
    updateTraffic([targetCar], dt, G.vehicles.list);
  }

  // --- car-car collisions ---
  const cars = G.vehicles.list;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.destroyed || b.destroyed) continue;
      const impact = collideCars(a, b);
      if (impact > 6) {
        effects.feedback(impact > 16 ? 'large' : 'medium', (a.x + b.x) / 2, 1, (a.z + b.z) / 2);
        if ((a === targetCar || b === targetCar) && G.missions.active
          && G.missions.currentStep() && G.missions.currentStep().kind === 'ram'
          && (a === p.car || b === p.car)) {
          G.missions.onRam();
          audio.pickup();
        }
      }
    }
  }

  // --- cars hit pedestrians (and gang members caught on the road) ---
  for (const car of cars) {
    if (car.destroyed || Math.abs(car.speed) < 3) continue;
    for (const ped of G.peds.list) {
      if (ped.dead || ped.down > 0 || ped.cop) continue;
      if (dist2(car.x, car.z, ped.x, ped.z) < 2.6 * 2.6) {
        ped.down = 8;
        ped.x += (ped.x - car.x) * 0.4;
        ped.z += (ped.z - car.z) * 0.4;
        effects.burst(ped.x, 1, ped.z, 8, [1, 0.9, 0.4], 4, 3);
        if (car.driver === 'player') {
          G.wanted.addHeat(WANTED.crimeHeat.hitPed);
          audio.crash(6);
        }
      }
    }
    for (const m of G.gangs.members) {
      if (m.down > 0) continue;
      if (dist2(car.x, car.z, m.x, m.z) < 2.6 * 2.6) {
        m.down = 8; // knocked down, not out: the war goes on
        m.x += (m.x - car.x) * 0.4;
        m.z += (m.z - car.z) * 0.4;
        effects.burst(m.x, 1, m.z, 8, [1, 0.9, 0.4], 4, 3);
        if (car.driver === 'player') {
          G.wanted.addHeat(WANTED.crimeHeat.hitPed);
          audio.crash(6);
        }
      }
    }
  }

  // --- pedestrians (flee from crimes + fast player car + the war) ---
  const threats = [];
  if (!p.onFoot && p.car && Math.abs(p.car.speed) > 8) {
    threats.push({ x: p.car.x, z: p.car.z, radius: 14 });
  }
  if (G.wanted.stars >= 2) threats.push({ x: p.x, z: p.z, radius: 10 });
  if (G.gangs.active) threats.push({ x: GANGS.zone.x, z: GANGS.zone.z, radius: 45 });
  updatePeds(G.peds.list, dt, threats, buildings);
  for (const ped of G.peds.list) {
    if (ped.down > 0) ped.down -= dt;
  }

  // --- gang war (Pasar Malam street) ---
  if (canTriggerWar(G.gangs, p)) {
    G.gangs = createGangWar(rng);
    hud.setPrompt('PERANG GANG di Pasar Malam! Geng Ombak vs Geng Bara');
    audio.gunshot();
  }
  if (G.gangs.active) {
    const events = updateGangWar(G.gangs, dt, p, rng);
    for (const ev of events) {
      tracers.fire(ev.from, ev.to, ev.gang === 'ombak' ? 0x7fe3f0 : 0xffb36b);
      effects.burst(ev.from.x, ev.from.y, ev.from.z, 4, [1, 0.9, 0.5], 3, 1);
      if (ev.hit && ev.target === 'player') {
        p.health = Math.max(0, p.health - ev.damage);
        hud.flash();
        audio.gunshot();
        cameraRig.addTrauma(0.3);
      } else if (ev.hit) {
        effects.burst(ev.to.x, ev.to.y, ev.to.z, 5, [1, 0.8, 0.3], 3, 1);
      }
    }
    // gunfire draws the police while the player watches from the zone
    if (p.onFoot && dist2(p.x, p.z, GANGS.zone.x, GANGS.zone.z) < GANGS.zone.radius * GANGS.zone.radius) {
      G.wanted.addHeat(GANGS.heatPerSecond * dt);
    }
    if (!G.gangs.active) {
      const w = G.gangs.winner;
      hud.setPrompt(w ? (w === 'ombak' ? 'Geng Ombak' : 'Geng Bara') + ' menang. Pasar Malam tenang lagi.' : 'Perang gang selesai.');
      G.gangs.endTimer = 8;
    }
  } else if (G.gangs.members.length) {
    G.gangs.endTimer -= dt;
    if (G.gangs.endTimer <= 0) {
      for (const [member, mesh] of gangMeshes) {
        scene.remove(mesh);
        gangMeshes.delete(member);
      }
      G.gangs.members = [];
    }
  }
  if (G.gangs.cooldown > 0) G.gangs.cooldown -= dt;

  // --- wanted + police + helicopter ---
  const seen = policeCanSee(G.police, p, G.heli, buildings);
  G.wanted.update(dt, seen);
  balanceUnits(G.police, G.wanted.stars, p.x, p.z, rng);
  updateHeli(G.heli, dt, p, G.wanted.stars);
  const busted = updatePolice(G.police, dt, p, G.wanted.stars);
  // police meshes: spawn on demand
  for (const u of G.police.units) {
    if (u.kind === 'car') meshForCar(u.car);
    else meshForPed(u.ped);
  }
  // police return fire: tracers make the bullets visible, like the gangs'
  const shots = policeFire(dt, G.police.units, p, G.wanted.stars, rng);
  for (const s of shots) {
    tracers.fire(s.from, s.to, 0xffe9a0);
    effects.burst((s.from.x + s.to.x) / 2, 1.3, (s.from.z + s.to.z) / 2, 3, [1, 0.9, 0.5], 2, 1);
    if (s.hit) {
      p.health = Math.max(0, p.health - s.damage);
      hud.flash();
      audio.gunshot();
      cameraRig.addTrauma(0.3);
    }
  }
  if (busted) {
    const fine = applyBusted(p, G.wanted);
    G.police.units.length = 0;
    G.missions.abort();
    audio.busted();
    G.screen = 'busted';
    hud.showScreen('busted');
    document.getElementById('busted-fine').textContent = 'Denda $' + fine + ' - Uang tinggal $' + p.money;
    doSave();
    return;
  }
  if (p.health <= 0) {
    const fine = applyWasted(p, G.wanted);
    G.police.units.length = 0;
    G.missions.abort();
    audio.wasted();
    G.screen = 'wasted';
    hud.showScreen('wasted');
    document.getElementById('wasted-fine').textContent = 'Denda $' + fine + ' - Uang tinggal $' + p.money;
    doSave();
    return;
  }

  // --- missions ---
  const missionEvent = G.missions.update(dt, {
    playerX: p.x, playerZ: p.z,
    playerInCar: !p.onFoot, stars: G.wanted.stars,
  });
  if (missionEvent === 'step') {
    const step = G.missions.currentStep();
    hud.setObjective(G.missions.active.def.title + ': ' + (step ? step.label : ''));
    audio.pickup();
  } else if (missionEvent === 'done') {
    const fin = G.missions.lastFinished;
    const reward = fin ? fin.reward : 0;
    p.money += reward;
    if (fin) G.missions.done.push(fin.def.id);
    audio.missionDone();
    hud.setObjective('Misi selesai! +$' + reward);
    doSave();
  } else if (missionEvent === 'fail') {
    audio.missionFail();
    hud.setObjective('Misi gagal. Tekan Enter untuk coba lagi.');
  }

  // beacon + arrow + route line on the current objective
  const target = missionTarget();
  const marker = target || (G.missions.active ? null : nextMissionStart());
  if (marker) {
    beacon.visible = true;
    beacon.position.set(marker.x, 0, marker.z);
    beacon.userData.gem.rotation.y += dt * 2;
    beacon.userData.gem.position.y = 4.5 + Math.sin(now * 0.003) * 0.4;
    arrow.visible = true;
    arrow.position.set(p.x, 3.6 + Math.sin(now * 0.004) * 0.25, p.z);
    arrow.rotation.y = Math.atan2(-(marker.x - p.x), -(marker.z - p.z));
    arrow.scale.setScalar(p.onFoot ? 0.35 : 0.6); // small on foot (the
    // camera is close) and in the car: a hint, not a billboard
    // dashed route along the road grid, refreshed twice a second
    G.routeTimer -= dt;
    if (G.routeTimer <= 0) {
      G.routeTimer = 0.5;
      updateRouteLine({ x: p.x, z: p.z }, marker);
    }
  } else {
    beacon.visible = false;
    arrow.visible = false;
    routeLine.visible = false;
  }
  pickup.rotation.y += dt * 1.5;
  pickup.position.y = 1.2 + Math.sin(now * 0.004) * 0.15;

  // --- sync meshes ---
  syncPlayerMesh(playerMesh, p, dt);
  for (const car of cars) syncCarMesh(car);
  // BUG FIX (was: police cars never synced, so their meshes sat at the
  // origin and a chase showed no police): sync every police car too.
  for (const u of G.police.units) {
    if (u.kind === 'car') syncCarMesh(u.car);
  }
  // helicopter mesh follows its state (scaled up 2x: a police heli reads
  // as a toy at 1x from the chase camera, and the HUD banner says it is
  // the reason the tail will not drop)
  heliMesh.visible = G.heli.active;
  heliMesh.scale.setScalar(2.0);
  if (G.heli.active) {
    heliMesh.position.set(G.heli.x, G.heli.y, G.heli.z);
    heliMesh.userData.rotor.rotation.y += dt * 28;
    heliMesh.rotation.y = Math.atan2(-(p.x - G.heli.x), -(p.z - G.heli.z));
  }
  for (const ped of G.peds.list) {
    const mesh = meshForPed(ped);
    syncPedMesh(mesh, ped);
    if (ped.down > 0) mesh.rotation.x = Math.PI / 2 * 0.9;
    else mesh.rotation.x = 0;
  }
  for (const u of G.police.units) {
    if (u.kind === 'foot') {
      const mesh = meshForPed(u.ped);
      syncPedMesh(mesh, u.ped);
      if (u.ped.down > 0) mesh.rotation.x = Math.PI / 2 * 0.9;
      else mesh.rotation.x = 0;
    }
  }
  // gang members: same human mesh, gang colours; down = lying down
  for (const m of G.gangs.members) {
    const mesh = meshForGang(m);
    syncPedMesh(mesh, m);
    if (m.down > 0) mesh.rotation.x = Math.PI / 2 * 0.9;
    else mesh.rotation.x = 0;
  }

  // --- camera, audio, hud ---
  const heading = p.onFoot ? G.camYaw : p.heading;
  // a staged shot camera wins over the follow rig in shot mode (the gang
  // war shot needs a composed angle the rig cannot frame: both gangs
  // across the street at once, with the player between them)
  if (SHOT && G.shotCamera) {
    camera.position.set(G.shotCamera.pos.x, G.shotCamera.pos.y, G.shotCamera.pos.z);
    camera.lookAt(G.shotCamera.look.x, G.shotCamera.look.y, G.shotCamera.look.z);
  } else {
    cameraRig.update(dt, { x: p.x, z: p.z }, heading, !p.onFoot, drag.dx);
  }
  audio.engine(p.car ? p.car.speed : null);
  audio.siren(dt, G.police.units.length > 0 && dist2(G.police.units[0] ? (G.police.units[0].kind === 'car' ? G.police.units[0].car : G.police.units[0].ped) : p, p) < 80 * 80);
  effects.update(dt);
  tracers.update(dt);
  hud.update(G, dt);

  // --- prompts ---
  const stallNear = p.onFoot ? nearestStall(4.5) : null;
  if (stallNear) {
    hud.setPrompt('[E] ' + stallNear.name + ': ' + stallNear.item + ' $' + stallNear.price + ' (+' + stallNear.heal + ' nyawa)');
  } else if (!G.missions.active) {
    const id = nextMissionId(G.missions.done);
    if (id) {
      const def = missionById(id);
      hud.setPrompt('Misi berikutnya: ' + def.title + ' - tekan Enter untuk mulai');
    } else {
      hud.setPrompt('Semua misi selesai! Jelajahi kota sesukamu.');
    }
  } else {
    const step = G.missions.currentStep();
    hud.setPrompt(step ? step.label : '');
  }

  // --- autosave ---
  G.saveTimer += dt;
  if (G.saveTimer > 30) {
    G.saveTimer = 0;
    doSave();
  }
}

function nextMissionStart() {
  const id = nextMissionId(G.missions.done);
  if (!id) return null;
  return missionById(id).start;
}

function cameraRigYaw() {
  return G.camYaw || G.player.heading;
}

// ---------- menu keys (global, work on any screen) ----------
// Pause toggling lives ONLY here (not in update): the input object's key
// state would otherwise re-trigger a pause the frame after resuming.
function openMap(from) {
  G.mapReturn = from;
  G.screen = 'map';
  hud.showMap(G);
}
function closeMap() {
  hud.hideMap();
  G.screen = G.mapReturn === 'paused' ? 'paused' : 'play';
  hud.showScreen(G.screen === 'paused' ? 'paused' : 'play');
}
G.openMap = openMap;
G.closeMap = closeMap;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    if (G.screen === 'play') openMap('play');
    else if (G.screen === 'paused') openMap('paused');
    else if (G.screen === 'map') closeMap();
    return;
  }
  // Phone menu tabs: 1-4 switch panes while the map screen is open.
  if (G.screen === 'map' && /^Digit[1-4]$/.test(e.code)) {
    hud.showPhoneTab(['peta', 'misi', 'kontak', 'stats'][Number(e.code.slice(5)) - 1]);
    return;
  }
  if (e.code === 'Escape' && G.screen === 'map') { closeMap(); return; }
  if (e.code === 'Enter') {
    // Only the global handler acts on title/busted/wasted; during play the
    // update loop consumes Enter to start missions, so do not clear it there.
    if (G.screen === 'title') { input.keys['Enter'] = false; audio.unlock(); startGame(false); }
    else if (G.screen === 'busted' || G.screen === 'wasted') { input.keys['Enter'] = false; startGame(false); }
  }
  if (e.code === 'KeyC' && G.screen === 'title' && G.save.exists) {
    input.keys['KeyC'] = false;
    audio.unlock(); startGame(true);
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    input.keys['KeyP'] = false;
    input.keys['Escape'] = false;
    if (G.screen === 'play') {
      G.screen = 'paused';
      hud.showScreen('paused');
    } else if (G.screen === 'paused') {
      G.screen = 'play';
      hud.showScreen('play');
    }
  }
});
document.getElementById('screen-title').addEventListener('click', () => {
  if (G.screen === 'title') { audio.unlock(); startGame(false); }
});
document.getElementById('title-new').addEventListener('click', (e) => {
  e.stopPropagation();
  if (G.screen === 'title') { audio.unlock(); startGame(false); }
});
document.getElementById('title-continue').addEventListener('click', (e) => {
  e.stopPropagation();
  if (G.screen === 'title' && G.save.exists) { audio.unlock(); startGame(true); }
});
document.getElementById('pause-resume').addEventListener('click', () => {
  if (G.screen === 'paused') { G.screen = 'play'; hud.showScreen('play'); }
});
document.getElementById('pause-map').addEventListener('click', () => {
  if (G.screen === 'paused') openMap('paused');
});
document.getElementById('pause-save').addEventListener('click', (e) => {
  doSave();
  e.target.textContent = 'TERSIMPAN!';
  setTimeout(() => { e.target.textContent = 'SIMPAN'; }, 1200);
});
document.getElementById('pause-menu').addEventListener('click', () => {
  if (G.screen === 'paused') showTitle();
});
document.getElementById('map-close').addEventListener('click', () => {
  if (G.screen === 'map') closeMap();
});
document.getElementById('map-save').addEventListener('click', (e) => {
  doSave();
  e.target.textContent = 'TERSIMPAN!';
  setTimeout(() => { e.target.textContent = 'SIMPAN'; }, 1200);
});
document.getElementById('map-menu').addEventListener('click', () => {
  if (G.screen === 'map') { hud.hideMap(); showTitle(); }
});

// ---------- boot ----------
showTitle();
hud.update(G, 0); // draw the minimap once so the title screen shows it
if (SHOT) {
  stageShot(G, SHOT);
  if (G.shotScreen === 'map') {
    // 4-mission stages the map + phone menu screen, not gameplay:
    // hide the title first (it is showing at boot), then open the map.
    hud.showScreen('play');
    openMap('play');
  } else {
    G.screen = SHOT === '1-start' ? 'title' : 'play';
    hud.showScreen(G.screen);
  }
  // staged missions need their objective banner set (startNextMission
  // normally does this; stageShot starts the mission directly)
  if (G.missions.active) {
    const step0 = G.missions.currentStep();
    hud.setObjective(G.missions.active.def.title + ': ' + (step0 ? step0.label : ''));
  }
  // one update to settle meshes before the first staged frame (not for
  // the title or the map screen: their scenes are staged, not played)
  if (SHOT !== '1-start' && SHOT !== '4-mission') update(0.016, performance.now());
  hud.update(G, 0); // refresh clock / district / sight for the staged hour
  requestAnimationFrame(frame);
} else {
  requestAnimationFrame(frame);
}
