// Solmarina 3D: ?shot= scene staging for screenshots (browser only).
// Each scene stages the world, then main renders it twice and sets
// window.__solmarinaReady. Scenes: 1-start (title), 2-drive, 3-chase,
// 4-mission. All state is set from the live game, never faked.
import { SPAWNS, STALLS } from './config.js';
import { balanceUnits } from './police.js';

export function stageShot(G, name) {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') || 1);
  if (name === '1-start') {
    G.screen = 'title';
    // golden hour (17:21): warm sunset over the sea, high camera north-east
    // looking south-west across the whole city so rooftops, Bukit Warna,
    // the beachfront and the sea all fill the frame behind the title
    G.clock = 561;
    G.shotCamera = { pos: { x: 190, y: 105, z: -250 }, look: { x: -60, y: 0, z: 200 } };
    return;
  }
  if (name === '2-drive') {
    G.screen = 'play';
    const car = G.vehicles.list.find((c) => c.type === 'sports' && !c.driver);
    G.player.x = car.x + 3; G.player.z = car.z;
    G.enterCar(car, true);
    car.speed = 22;
    car.heading = Math.PI; // driving south down the main road
    G.player.x = car.x; G.player.z = car.z;
    G.cameraRig.snapTo(car.heading); // snap: the rig lerps and would not
    // converge in the two staged frames, leaving the camera off-axis
    G.shotCamera = null;
    return;
  }
  if (name === '3-chase') {
    G.screen = 'play';
    // golden hour on the beachfront road: sea, palms and mountains behind,
    // warm sunset light
    G.clock = 561;
    const car = G.vehicles.list.find((c) => c.type === 'sports' && !c.driver);
    G.player.x = car.x + 3; G.player.z = car.z;
    G.enterCar(car, true);
    car.speed = 18;
    car.damage = 62;
    // beachfront road (z = 280), driving west; the camera sits behind the
    // player looking west, so the sea is on the left of the frame
    car.x = 60; car.z = 280;
    car.heading = Math.PI / 2;
    G.player.x = car.x; G.player.z = car.z;
    G.cameraRig.snapTo(car.heading);
    // escape mission m2: the objective banner + TERLIHAT indicator read
    G.wanted.addHeat(75); // 4 stars
    const def = G.missions.defs.find((m) => m.id === 'm2');
    G.missions.start(def);
    balanceUnits(G.police, G.wanted.stars, G.player.x, G.player.z, G.rng);
    // police cars IN FRAME: two cutting across ahead of the player (the
    // chase camera looks forward, so pursuers behind the player are
    // invisible); a third closes in from behind
    const units = G.police.units.filter((u) => u.kind === 'car');
    const spots = [
      { x: 38, z: 274, heading: -Math.PI / 2 }, // ahead-left, facing the player
      { x: 42, z: 288, heading: -Math.PI / 2 }, // ahead-right, facing the player
      { x: 84, z: 280, heading: Math.PI / 2 }, // behind, in pursuit
    ];
    units.forEach((u, i) => {
      const s = spots[i % spots.length];
      u.car.x = s.x; u.car.z = s.z; u.car.heading = s.heading; u.car.speed = 20;
    });
    // helicopter hovering low and far ahead down the beachfront road:
    // the chase camera pitches down steeply, so a heli at hover height
    // sits above the frame; low and far ahead it reads at the top edge
    G.heli.active = true;
    G.heli.leaving = false;
    G.heli.x = 0; G.heli.z = 260; G.heli.y = 15;
    // crowd of pedestrians on the beach sidewalk watching the chase
    G.peds.list.forEach((ped, i) => {
      ped.x = -20 + (i % 8) * 12;
      ped.z = 292 + Math.floor(i / 8) * 6;
      ped.heading = Math.PI / 2;
    });
    G.shotCamera = null;
    return;
  }
  if (name === '4-mission') {
    G.screen = 'play';
    // night (21:17) at the Pasar Malam street market: lit towers, stalls,
    // the [E] interact prompt. Player on foot at the first stall, taxi
    // parked beside him on the same street, mission m0 active (the cafe
    // beacon sits down the road to the east).
    G.clock = 797;
    const car = G.vehicles.list.find((c) => c.type === 'taxi' && !c.driver);
    car.x = 108; car.z = 114; car.heading = Math.PI;
    G.player.x = STALLS[0].x; G.player.z = STALLS[0].z + 4;
    G.player.heading = 0; // facing north, toward the stall
    G.player.onFoot = true;
    G.player.car = null;
    G.cameraRig.snapTo(0);
    G.player.money = 150;
    G.player.hasPistol = true;
    G.player.ammo = 24;
    G.player.health = 85;
    G.wanted.addHeat(30); // 2 stars on the HUD
    const def = G.missions.defs.find((m) => m.id === 'm0');
    G.missions.start(def);
    G.shotCamera = null;
    return;
  }
}
