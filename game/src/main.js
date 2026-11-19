// Solmarina 3D: bootstrap + game loop (browser only).
// Original open-world crime game: city Solmarina, protagonist Raka.
// Third-person on foot and by car, traffic, pedestrians, wanted + police,
// 5 missions, combat, HUD + minimap, save. Three.js (vendored) + DOM HUD.
import { WORLD, PLAYER, CAR, WANTED, GANGS, MISSIONS, SPAWNS, LIMITS, STALLS, SIDE_MISSIONS, GUNSHOP, WEAPON_PICKUPS, COLLECT_SPOTS } from './config.js';
import { mulberry32, clamp, turnToward, dist2 } from './random.js';
import { hourFromClock } from './daynight.js';
import { Wanted } from './wanted.js';
import { MissionRunner, nextMissionId, missionById } from './missions.js';
import { DailyEvent, dailyDefFor, todayKey } from './daily.js';
import {
  WEAPONS, createLoadout, giveWeapon, giveAmmo, switchTo, cycleWeapon,
  tryFire, spendRound, startReload, updateReload, saveLoadout, loadLoadout,
  AMMO_PRICE,
} from './weapons.js';
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
  makePickupMesh, makeCrateMesh, makeHealthBar, faceHealthBar, makeHeliMesh, createCameraRig, createTracers,
} from './render.js';
import { createEffects } from './effects.js';
import { createHud, nextSideId } from './hud.js';
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
  side: new MissionRunner(),
  sideDone: [],
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
  // polish 7: daily event (one per real day), weapon pickups, gun
  // shop, collect crates, bounty target, escort, kill/collect counts
  daily: { def: dailyDefFor(), event: null, doneToday: false, key: todayKey() },
  weaponPickups: WEAPON_PICKUPS.map((p) => ({ ...p, taken: false })),
  gunshop: GUNSHOP,
  collectCrates: COLLECT_SPOTS.map((s) => ({ ...s, taken: false })),
  collectCount: 0,
  killCount: 0,
  bountyTarget: null,
  escort: null,
};
G.missions.defs = MISSIONS;
G.side.defs = SIDE_MISSIONS;
G.player.weapons = createLoadout();
G.player.pistolReserve = 0;
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
// polish 7 meshes: free weapon pickups (coloured rings), the gun shop
// beacon (green), the daily event beacon (orange), collect crates
const pickupMeshes = new Map();
for (const pk of G.weaponPickups) {
  const m = makePickupMesh(pk.color);
  m.position.set(pk.x, 1.2, pk.z);
  scene.add(m);
  pickupMeshes.set(pk, m);
}
const shopBeacon = makeBeaconMesh(0x58d96b);
shopBeacon.position.set(GUNSHOP.x, 0, GUNSHOP.z);
scene.add(shopBeacon);
const dailyBeacon = makeBeaconMesh(0xff8c2e);
dailyBeacon.position.set(G.daily.def.start.x, 0, G.daily.def.start.z);
scene.add(dailyBeacon);
const crateMeshes = new Map();
for (const c of G.collectCrates) {
  const m = makeCrateMesh();
  m.position.set(c.x, 0, c.z);
  m.visible = false; // only during the m8 collect mission
  scene.add(m);
  crateMeshes.set(c, m);
}
// enemy health bars: one pool, reassigned every frame to standing gang
// members, foot cops and the bounty target
const healthBars = [];
for (let i = 0; i < 16; i++) {
  const bar = makeHealthBar();
  scene.add(bar);
  healthBars.push(bar);
}
G.healthBars = healthBars;
// bounty target: a red-shirted ped with a red headband, bigger than a
// normal ped so he reads as a named target
const bountyMesh = makeHumanMesh(0xe04848, 0x22242a, 0xd9a066);
bountyMesh.scale.setScalar(1.15);
bountyMesh.visible = false;
scene.add(bountyMesh);
const escortMesh = makeHumanMesh(0xe07856, 0x2e2a26, 0xd9a066);
escortMesh.visible = false;
scene.add(escortMesh);

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
  if (!id) {
    // main arc done: the side arc (m5-m8) unlocks, one at a time
    const sid = nextSideId(G.sideDone || []);
    if (!sid) { hud.setPrompt('Semua misi selesai!'); return; }
    const sdef = SIDE_MISSIONS.find((m) => m.id === sid);
    if (sid === 'm5') spawnEscort();
    if (sid === 'm6') G.killCount = 0;
    if (sid === 'm8') G.collectCount = 0;
    G.side.start(sdef);
    audio.missionStart();
    hud.setObjective(sdef.title + ': ' + sdef.steps[0].label);
    return;
  }
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

// The escort for m5: Dimas, an informant in an orange shirt, spawns
// next to Raka and follows him on foot to the harbour.
function spawnEscort() {
  G.escort = {
    x: G.player.x + 3, z: G.player.z, heading: G.player.heading,
    health: 100, alive: true, state: 'walk', walkPhase: 0, dead: false,
  };
  escortMesh.visible = true;
}

// The daily bounty target: a red-shirted fugitive hiding in Taman Kota.
// He flees from Raka and takes real damage (see combat.js 'bounty').
function spawnBounty() {
  const t = G.daily.def.target;
  G.bountyTarget = {
    x: t.x, z: t.z, heading: 0, health: 100, down: 0, bounty: true,
    shirt: 0xe04848, pants: 0x22242a, walkPhase: 0, state: 'walk',
    speed: 4, dead: false, cop: false,
  };
  bountyMesh.visible = true;
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
  // the current step's target: main mission first, then the side arc.
  // No active step: the next mission's start point, so the beacon
  // always points at the next thing to do.
  const step = G.missions.currentStep() || G.side.currentStep();
  if (!step) {
    const nextId = nextMissionId(G.missions.done || []);
    if (nextId) return missionById(nextId).start;
    const sid = nextSideId(G.sideDone || []);
    if (sid) return SIDE_MISSIONS.find((m) => m.id === sid).start;
    return null;
  }
  if (step.kind === 'ram' && targetCar) return { x: targetCar.x, z: targetCar.z };
  return step.target || null;
}

function dailyTarget() {
  // the daily event's current target (checkpoint, stop, or bounty
  // hideout), or the event start marker when it has not started yet
  if (G.daily.event && G.daily.event.active) return G.daily.event.currentTarget();
  if (!G.daily.doneToday) return G.daily.def.start;
  return null;
}

function applySaveData(s) {
  G.player.money = s.money;
  G.missions.done = [...s.done];
  G.sideDone = [...(s.sideDone || [])];
  G.player.health = s.health;
  G.player.x = s.player.x;
  G.player.z = s.player.z;
  G.player.heading = s.player.heading;
  G.player.hasPistol = !!s.hasPistol;
  G.player.ammo = G.player.hasPistol ? 12 : 0;
  // polish 7: restore the loadout + daily completion. Old saves lack
  // these fields entirely; every read is default-guarded. A pistol
  // owner with no recorded reserve gets one spare magazine.
  G.player.pistolReserve = s.pistolReserve || (G.player.hasPistol ? 12 : 0);
  if (s.weapons) G.player.weapons = loadLoadout(s.weapons);
  if (s.dailyDone === todayKey()) G.daily.doneToday = true;
}

function doSave() {
  writeSave(window.localStorage, {
    money: G.player.money,
    done: G.missions.done || [],
    sideDone: G.sideDone || [],
    health: G.player.health,
    playerX: G.player.x,
    playerZ: G.player.z,
    heading: G.player.heading,
    hasPistol: G.player.hasPistol,
    weapons: saveLoadout(G.player.weapons),
    pistolReserve: G.player.pistolReserve || 0,
    dailyDone: G.daily.doneToday ? todayKey() : null,
  });
}
G.missions.done = [];

// ---------- screens ----------
function showTitle() {
  G.screen = 'title';
  hud.hideMap();
  const s = readSave(window.localStorage);
  G.save.exists = !!s;
  // today's event on the title screen, so the day's work is visible
  // before the player even presses Enter
  const td = document.getElementById('title-daily');
  if (td) {
    td.textContent = G.daily.doneToday
      ? 'EVENT HARI INI: ' + G.daily.def.name + ' - SELESAI ✓'
      : 'EVENT HARI INI: ' + G.daily.def.name + ' (+$' + G.daily.def.reward + ') - ' + G.daily.def.blurb;
  }
  hud.showScreen('title', s);
}
function startGame(fromSave) {
  if (fromSave) {
    const s = readSave(window.localStorage);
    if (s) applySaveData(s);
  } else {
    G.player.money = 0;
    G.missions.done = [];
    G.sideDone = [];
    G.side.abort();
    G.player.health = PLAYER.health;
    // a fresh game resets the day's progress (same real day, new run)
    G.daily.event = null;
    G.daily.doneToday = false;
    if (G.bountyTarget) { bountyMesh.visible = false; G.bountyTarget = null; }
    if (G.escort) { escortMesh.visible = false; G.escort = null; }
  }
  G.screen = 'play';
  hud.showScreen('play');
  audio.unlock();
  audio.click();
  cameraRig.snapTo(G.player.heading);
}

// Busted / wasted: the active mission, side mission and daily event all
// end, and the escort / bounty NPCs leave the scene.
function abortFreeRoam() {
  G.side.abort();
  if (G.daily.event) G.daily.event = null;
  if (G.bountyTarget) { bountyMesh.visible = false; G.bountyTarget = null; }
  if (G.escort) { escortMesh.visible = false; G.escort = null; }
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
    if (!G.missions.active && !G.side.active) startNextMission();
  }
  // weapon switching: 1-4 pick a slot, Q cycles, R reloads. Switching
  // is free; only owned weapons can be selected (pistol is always owned
  // once Raka has picked it up).
  if (input.consume('Digit1')) switchTo(G.player.weapons, 'pistol');
  if (input.consume('Digit2')) switchTo(G.player.weapons, 'smg');
  if (input.consume('Digit3')) switchTo(G.player.weapons, 'shotgun');
  if (input.consume('Digit4')) switchTo(G.player.weapons, 'rifle');
  if (input.consume('KeyQ')) cycleWeapon(G.player.weapons);
  if (input.consume('KeyR')) {
    const w = G.player.weapons;
    if (w.current === 'pistol') {
      if (p.hasPistol) startReload(w, 'pistol', p.ammo, p.pistolReserve);
    } else {
      startReload(w, w.current, 0, 0);
    }
  }
  // daily event: T near the orange marker starts today's event
  if (input.consume('KeyT')) {
    if (!G.daily.doneToday && !G.daily.event) {
      if (dist2(p.x, p.z, G.daily.def.start.x, G.daily.def.start.z) < 8 * 8) {
        G.daily.event = new DailyEvent(G.daily.def).start();
        if (G.daily.def.id === 'bounty') spawnBounty();
        audio.missionStart();
        hud.setObjective('EVENT HARI INI: ' + G.daily.def.name + ' - ' + G.daily.event.stepLabel());
        hud.setPrompt(G.daily.def.blurb);
      } else {
        hud.setPrompt('Event hari ini di marker oranye: ' + G.daily.def.name);
      }
    }
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
      } else if (dist2(p.x, p.z, GUNSHOP.x, GUNSHOP.z) < 5 * 5) {
        // gun shop: rifle $800 once, then ammo $60 per full magazine
        const w = G.player.weapons;
        if (!w.owned.rifle) {
          if (p.money >= GUNSHOP.riflePrice) {
            p.money -= GUNSHOP.riflePrice;
            giveWeapon(w, 'rifle', 2);
            switchTo(w, 'rifle');
            audio.pickup();
            hud.setPrompt('Senapan dibeli! $800 (sisa $' + p.money + ') - tekan 4 atau Q');
          } else {
            hud.setPrompt('Toko Senjata Bang Joko: senapan $800, amunisi $60/mag. Uangmu $' + p.money);
          }
        } else if (p.money >= AMMO_PRICE) {
          p.money -= AMMO_PRICE;
          if (w.current === 'pistol') p.pistolReserve += 12;
          else giveAmmo(w, w.current, 1);
          audio.pickup();
          hud.setPrompt('Amunisi dibeli! $60 (sisa $' + p.money + ')');
        } else {
          hud.setPrompt('Toko Senjata Bang Joko: amunisi $60/mag. Uangmu $' + p.money);
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
    const punchPeds = G.bountyTarget && G.bountyTarget.down <= 0
      ? [...G.peds.list, G.bountyTarget] : G.peds.list;
    const hit = punch(p, punchPeds, G.police.units, effects, G.gangs.active ? G.gangs : null);
    audio.punch();
    if (hit && hit.kind === 'cop') G.wanted.addHeat(WANTED.crimeHeat.hitCop);
    else if (hit && hit.kind === 'gang') G.wanted.addHeat(WANTED.crimeHeat.shoot);
    else if (hit && hit.kind === 'bounty') { /* the daily target: no heat, it is the job */ }
    else if (hit) G.wanted.addHeat(WANTED.crimeHeat.punch);
    cameraRig.addTrauma(0.15);
  }
  // --- shooting: every weapon fires through the loadout, not the
  // pistol special case. SMG holds to fire; the shotgun fires 6
  // pellets with spread; the rifle hits hardest at long range.
  // A spent round comes from the magazine (pistol: p.ammo + reserve);
  // an empty magazine reloads automatically, R reloads early.
  if (p.onFoot) {
    const w = G.player.weapons;
    const def = WEAPONS[w.current];
    const armed = w.current === 'pistol' ? p.hasPistol : !!w.owned[w.current];
    if (armed) {
      // reload timer: the pistol's numbers live on the player, the
      // others in the loadout; updateReload returns the finished
      // pistol numbers for the caller to write back
      const reloaded = updateReload(w, dt, p.ammo, p.pistolReserve);
      if (reloaded && reloaded.id === 'pistol') {
        p.ammo = reloaded.mag;
        p.pistolReserve = reloaded.reserve;
      }
      const magAmmo = w.current === 'pistol' ? p.ammo : w.owned[w.current].mag;
      const trigger = def.auto ? input.mouse.down : input.consumeClick();
      if (trigger) {
        const fire = tryFire(w, w.current, now / 1000, magAmmo);
        if (fire.fired) {
          if (w.current === 'pistol') p.ammo = spendRound(w, 'pistol', p.ammo);
          else spendRound(w, w.current, w.owned[w.current].mag);
          audio.gunshot();
          // horizontal aim from the gun along the camera's forward (see
          // shootAim in combat.js: the centre ray used to dive into the
          // ground 2.7 units past Raka, so the pistol could never hit
          // anything further away)
          const aim = new THREE.Vector3();
          camera.getWorldDirection(aim);
          aim.y = 0; aim.normalize();
          const origin = { x: p.x, y: 1.3, z: p.z };
          const targets = [];
          for (const [ped] of pedMeshes) targets.push({ ref: { kind: ped.cop ? 'cop' : 'ped', ped } });
          for (const [car] of carMeshes) targets.push({ ref: { kind: 'car', car } });
          for (const [member] of gangMeshes) targets.push({ ref: { kind: 'gang', member, war: G.gangs } });
          if (G.bountyTarget && G.bountyTarget.down <= 0) targets.push({ ref: { kind: 'bounty', ped: G.bountyTarget } });
          // muzzle flash: a short bright burst at the gun + a tracer per pellet
          effects.burst(origin.x + aim.x * 0.6, 1.3, origin.z + aim.z * 0.6, 6, [1, 0.85, 0.4], 2, 1);
          let anyHit = false;
          for (let pellet = 0; pellet < def.pellets; pellet++) {
            const jitter = def.pellets > 1 ? (Math.random() * 2 - 1) * def.spread : 0;
            const cos = Math.cos(jitter), sin = Math.sin(jitter);
            const dir = { x: aim.x * cos - aim.z * sin, z: aim.x * sin + aim.z * cos };
            // remember what was standing before the shot, so a kill is
            // only rewarded (and counted) when this shot drops it
            const before = new Map();
            for (const t of targets) {
              const r = t.ref;
              if (r.kind === 'gang') before.set(r.member, r.member.down);
              else if (r.kind === 'cop' || r.kind === 'bounty') before.set(r.ped, r.ped.down);
            }
            const res = shootAim(origin, dir, targets, effects, { damage: def.damage, range: def.range });
            if (res) {
              tracers.fire(origin, res.point, def.tracer, 0.09);
              if (res.victim) {
                anyHit = true;
                hud.hitMarker();
                G.wanted.addHeat(WANTED.crimeHeat.shoot);
                const v = res.victim;
                const wasDown = before.get(v.ped || v.member);
                const nowDown = v.kind === 'gang' ? v.member.down > 0
                  : v.kind === 'car' ? false : v.ped.down > 0;
                if (wasDown <= 0 && nowDown) {
                  // a kill pays $25 on the spot (the economy's combat leg)
                  p.money += 25;
                  if (v.kind === 'gang') G.killCount += 1;
                }
              }
            }
          }
          if (!anyHit && def.pellets === 1) { /* clean miss: no heat beyond the shot itself */ }
          cameraRig.addTrauma(def.kick);
        } else if (fire.empty) {
          startReload(w, w.current, p.ammo, p.pistolReserve);
        }
      }
    }
  }

  // --- movement ---
  const drag = input.consumeDrag();
  if (p.onFoot) {
    const newCamYaw = updatePlayerOnFoot(p, input, cameraRigYaw(), dt, buildings);
    G.camYaw = newCamYaw;
    // pistol pickup: a full magazine plus one spare in reserve
    if (!p.hasPistol && dist2(p.x, p.z, SPAWNS.pistolPickup.x, SPAWNS.pistolPickup.z) < 4) {
      p.hasPistol = true;
      p.ammo = 12;
      p.pistolReserve = 12;
      pickup.visible = false;
      audio.pickup();
      hud.setPrompt('Pistol didapat! Klik untuk menembak');
    }
    // free weapon pickups: SMG at the marina, shotgun on the beach.
    // Walking over one equips it immediately (keys 1-4 / Q switch).
    for (const pk of G.weaponPickups) {
      if (pk.taken) continue;
      if (dist2(p.x, p.z, pk.x, pk.z) < 4 * 4) {
        pk.taken = true;
        giveWeapon(p.weapons, pk.id, 2);
        switchTo(p.weapons, pk.id);
        const mesh = pickupMeshes.get(pk);
        if (mesh) mesh.visible = false;
        audio.pickup();
        hud.setPrompt(WEAPONS[pk.id].name + ' didapat! Tekan ' + (pk.id === 'smg' ? '2' : '3') + ' atau Q untuk ganti senjata');
      }
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
    abortFreeRoam();
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
    abortFreeRoam();
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

  // --- side missions (m5-m8): same machine, plus escort/takedown/
  // collect steps. The side arc unlocks after the main arc.
  const sideEvent = G.side.update(dt, {
    playerX: p.x, playerZ: p.z,
    playerInCar: !p.onFoot, stars: G.wanted.stars,
    collected: G.collectCount, kills: G.killCount,
    escortAlive: G.escort ? G.escort.alive : true,
  });
  if (sideEvent === 'step') {
    const step = G.side.currentStep();
    hud.setObjective(G.side.active.def.title + ': ' + (step ? step.label : ''));
    audio.pickup();
  } else if (sideEvent === 'done') {
    const fin = G.side.lastFinished;
    const reward = fin ? fin.reward : 0;
    p.money += reward;
    if (fin) G.sideDone.push(fin.def.id);
    if (G.escort) { escortMesh.visible = false; G.escort = null; }
    audio.missionDone();
    hud.setObjective('Misi selesai! +$' + reward);
    doSave();
  } else if (sideEvent === 'fail') {
    if (G.escort) { escortMesh.visible = false; G.escort = null; }
    audio.missionFail();
    hud.setObjective('Misi gagal. Tekan Enter untuk coba lagi.');
  }

  // --- daily event: one per real day, started with T at the orange
  // marker. A race/delivery advances on checkpoints/stops; the bounty
  // completes when its target goes down.
  if (G.daily.event) {
    const ev = G.daily.event;
    const dailyResult = ev.update(dt, {
      playerX: p.x, playerZ: p.z, playerInCar: !p.onFoot,
      bountyDown: G.bountyTarget ? G.bountyTarget.down > 0 : false,
    });
    if (dailyResult === 'step') {
      audio.pickup();
      hud.setObjective('EVENT HARI INI: ' + ev.def.name + ' - ' + ev.stepLabel());
    } else if (dailyResult === 'done') {
      p.money += ev.def.reward;
      G.daily.doneToday = true;
      G.daily.event = null;
      if (G.bountyTarget) { bountyMesh.visible = false; G.bountyTarget = null; }
      audio.missionDone();
      hud.setObjective('EVENT HARI INI SELESAI! +$' + ev.def.reward);
      doSave();
    } else if (dailyResult === 'fail') {
      G.daily.event = null;
      if (G.bountyTarget) { bountyMesh.visible = false; G.bountyTarget = null; }
      audio.missionFail();
      hud.setObjective('Event hari ini gagal. Coba lagi besok!');
    }
  }

  // --- escort + bounty NPCs ---
  // Dimas follows Raka on foot (m5): he walks at 8 u/s when further
  // than 5 units away, and a car hit costs him 40 health.
  if (G.escort && G.escort.alive) {
    const e = G.escort;
    const dx = p.x - e.x, dz = p.z - e.z;
    const d = Math.hypot(dx, dz);
    if (d > 5) {
      e.x += (dx / d) * 8 * dt;
      e.z += (dz / d) * 8 * dt;
      e.heading = Math.atan2(-dx, -dz);
      e.walkPhase += dt * 8 * 2.2;
    }
    for (const car of cars) {
      if (car.destroyed || Math.abs(car.speed) < 3) continue;
      if (dist2(car.x, car.z, e.x, e.z) < 2.6 * 2.6) {
        e.health -= 40;
        e.x += (e.x - car.x) * 0.4;
        e.z += (e.z - car.z) * 0.4;
        effects.burst(e.x, 1, e.z, 8, [1, 0.9, 0.4], 4, 3);
        if (e.health <= 0) e.alive = false;
      }
    }
  }
  // the bounty target flees from Raka when he gets close (m5's escort
  // aside, this is the only NPC with real flee AI)
  if (G.bountyTarget && G.bountyTarget.down <= 0) {
    const b = G.bountyTarget;
    const dx = b.x - p.x, dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 12) {
      b.heading = Math.atan2(-dx, -dz);
      b.x += -Math.sin(b.heading) * 4 * dt;
      b.z += -Math.cos(b.heading) * 4 * dt;
      b.walkPhase += dt * 4 * 2.2;
      b.state = 'flee';
    } else {
      b.state = 'walk';
    }
    b.x = clamp(b.x, -WORLD.half - 10, WORLD.half + 10);
    b.z = clamp(b.z, -WORLD.half - 10, WORLD.beachZ + 24);
  }
  // collect crates (m8): visible only while the collect mission runs;
  // walking over one banks it
  const collecting = G.side.active && G.side.active.def.id === 'm8';
  for (const c of G.collectCrates) {
    const mesh = crateMeshes.get(c);
    if (!mesh) continue;
    mesh.visible = collecting && !c.taken;
    if (collecting && !c.taken && dist2(p.x, p.z, c.x, c.z) < 3 * 3) {
      c.taken = true;
      G.collectCount += 1;
      mesh.visible = false;
      effects.burst(c.x, 1, c.z, 10, [1, 0.85, 0.3], 4, 3);
      audio.pickup();
      hud.setPrompt('Paket ' + G.collectCount + '/5 terkumpul!');
    }
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
  // daily beacon: follows the event's current target while active, the
  // start marker before it starts; gone once today is done
  const dTarget = dailyTarget();
  dailyBeacon.visible = !!dTarget;
  if (dTarget) {
    dailyBeacon.position.set(dTarget.x, 0, dTarget.z);
    dailyBeacon.userData.gem.rotation.y += dt * 2;
    dailyBeacon.userData.gem.position.y = 4.5 + Math.sin(now * 0.003) * 0.4;
  }
  // gun shop beacon pulses gently; weapon pickups spin like the pistol
  shopBeacon.userData.gem.rotation.y += dt * 1.2;
  shopBeacon.userData.gem.position.y = 4.5 + Math.sin(now * 0.002) * 0.3;
  for (const [pk, mesh] of pickupMeshes) {
    if (pk.taken) continue;
    mesh.rotation.y += dt * 1.5;
    mesh.position.y = 1.2 + Math.sin(now * 0.004 + pk.x) * 0.15;
  }

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
  // bounty target + escort NPC meshes
  if (G.bountyTarget) {
    syncPedMesh(bountyMesh, G.bountyTarget);
    bountyMesh.visible = G.bountyTarget.down <= 0;
    if (G.bountyTarget.down > 0) bountyMesh.rotation.x = Math.PI / 2 * 0.9;
    else bountyMesh.rotation.x = 0;
  }
  if (G.escort) {
    syncPedMesh(escortMesh, G.escort);
    escortMesh.visible = G.escort.alive;
  }
  // enemy health bars: gang members, foot cops, the bounty target.
  // Bars are a fixed pool; unused ones hide.
  let barI = 0;
  const barFor = (x, y, z, health) => {
    if (barI >= healthBars.length) return;
    faceHealthBar(healthBars[barI++], x, y, z, health, camera);
  };
  for (const m of G.gangs.members) {
    if (m.down > 0) continue;
    barFor(m.x, 2.3, m.z, m.health);
  }
  for (const u of G.police.units) {
    if (u.kind === 'foot' && u.ped.down <= 0) barFor(u.ped.x, 2.3, u.ped.z, u.ped.health || 100);
  }
  if (G.bountyTarget && G.bountyTarget.down <= 0) barFor(G.bountyTarget.x, 2.6, G.bountyTarget.z, G.bountyTarget.health);
  for (; barI < healthBars.length; barI++) healthBars[barI].visible = false;

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
  } else if (p.onFoot && dist2(p.x, p.z, GUNSHOP.x, GUNSHOP.z) < 5 * 5) {
    hud.setPrompt('[E] Toko Senjata Bang Joko: senapan $800, amunisi $60/mag');
  } else if (!G.missions.active && !G.side.active) {
    const id = nextMissionId(G.missions.done);
    if (id) {
      const def = missionById(id);
      hud.setPrompt('Misi berikutnya: ' + def.title + ' - tekan Enter untuk mulai');
    } else {
      const sid = nextSideId(G.sideDone || []);
      if (sid) {
        const def = SIDE_MISSIONS.find((m) => m.id === sid);
        hud.setPrompt('Misi sampingan: ' + def.title + ' - tekan Enter untuk mulai');
      } else {
        hud.setPrompt('Semua misi selesai! Jelajahi kota sesukamu.');
      }
    }
  } else {
    const step = G.missions.currentStep() || G.side.currentStep();
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
