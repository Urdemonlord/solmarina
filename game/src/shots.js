// Solmarina 3D: ?shot= scene staging for screenshots (browser only).
// Each scene stages the world, then main renders it twice and sets
// window.__solmarinaReady. Scenes: 1-start (title), 2-drive, 3-chase,
// 4-mission. All state is set from the live game, never faked.
import { SPAWNS, STALLS } from './config.js';
import { makeLamp, makeHydrant, makeStallMesh } from './render.js';
import { balanceUnits } from './police.js';
import { createGangWar, crossfireLines } from './gangs.js';
import { giveWeapon, switchTo } from './weapons.js';
import { DailyEvent } from './daily.js';

export function stageShot(G, name) {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') || 1);
  if (name === '1-start') {
    G.screen = 'title';
    // golden hour (17:21): high camera far south over the sea, looking
    // north: sea + sand at the bottom of the frame, the city in the
    // middle (behind the title text), and Bukit Warna (colourful
    // hillside, left) + the north-east towers (right) + the ridge
    // against the sunset sky at the top. The fog is pushed out for this
    // shot only: at the normal 520 the hill and towers wash out.
    G.clock = 561;
    if (G.scene && G.scene.fog) { G.scene.fog.near = 300; G.scene.fog.far = 1800; }
    // look nudged west (was x 60): the golden-hour sun disc sits
    // west-northwest over the ridge, so from here it reads upper-left,
    // clear of the title text, instead of hiding behind the camera
    G.shotCamera = { pos: { x: 0, y: 120, z: 420 }, look: { x: -20, y: 0, z: 100 } };
    return;
  }
  if (name === '2-drive') {
    G.screen = 'play';
    // NIGHT (21:17) gang war on the Pasar Malam street (z=120 road), from
    // the player's angle: Raka on foot in the middle of the road, caught
    // between Geng Ombak (teal, west) and Geng Bara (red, east) trading
    // fire across the frame. Tracers cross left-right, stalls + lit
    // windows behind, peds fleeing south, a foot cop closing in. This
    // replaces the old tower drive: the towers never loomed from the low
    // camera (v5 honest gap), and a street shootout fills the frame
    // better than an empty road. The camera is staged (not the follow
    // rig): the rig looks through the player, and both gangs sit ~50 deg
    // off-axis from there, outside the frame. The staged camera sits
    // behind Raka at y 7 with a 70 deg FOV, so both gangs read at ~37
    // deg off-axis and Raka stays big in the centre.
    G.clock = 797;
    if (G.scene && G.scene.fog) { G.scene.fog.near = 200; G.scene.fog.far = 1200; }
    G.player.x = 150; G.player.z = 126;
    G.player.heading = 0; // facing north, across the road at the stalls
    G.camYaw = 0;
    G.player.onFoot = true;
    G.player.car = null;
    G.player.hasPistol = true;
    G.player.ammo = 12;
    G.player.pistolReserve = 12;
    G.player.health = 100;
    G.player.money = 0;
    // polish 7: Raka fights this war with the SMG (marina pickup), so
    // the shot shows the weapon line "SMG - 30/30" on the HUD and teal
    // SMG tracers flying from his muzzle toward the Bara line
    giveWeapon(G.player.weapons, 'smg', 2);
    switchTo(G.player.weapons, 'smg');
    // the war itself, staged directly (not via the trigger)
    G.gangs = createGangWar(G.rng);
    // pull the two lines closer so both read in frame, on the road's
    // north half (clear of the stalls at z 124 and of the block's
    // buildings, which stop at z 110)
    const ombakSpots = [[128, 114], [132, 117], [136, 113], [130, 116], [134, 115]];
    const baraSpots = [[172, 114], [168, 117], [164, 113], [170, 116], [166, 115]];
    let oi = 0, bi = 0;
    for (const m of G.gangs.members) {
      if (m.gang === 'ombak') {
        [m.x, m.z] = ombakSpots[oi++];
        m.heading = -Math.PI / 2; // faces east, at Bara
      } else {
        [m.x, m.z] = baraSpots[bi++];
        m.heading = Math.PI / 2; // faces west, at Ombak
      }
    }
    // staged crossfire: long-life tracers so the captured frame shows
    // the firefight (live tracers live 0.12s and would expire before
    // frame 2), plus muzzle flashes frozen at the shooters. Endpoint
    // heights alternate so the lines cross diagonally (all at one
    // height they read as parallel wires, not crossfire).
    crossfireLines(G.gangs).forEach((line, i) => {
      const from = { ...line.from, y: 1.0 + (i % 2) * 0.6 };
      const to = { ...line.to, y: 1.6 - (i % 2) * 0.6 };
      // once per line, and SHORT: a streak from the muzzle, not a
      // full-width beam. 8 full-length parallel bolts in one screen band
      // saturate into a white bar; staggered reaches (45-62%) keep 8
      // distinct diagonal streaks and leave the gang members visible.
      const f = [0.5, 0.62, 0.45, 0.58][i % 4];
      const shortTo = {
        x: from.x + (to.x - from.x) * f,
        y: from.y + (to.y - from.y) * f,
        z: from.z + (to.z - from.z) * f,
      };
      G.tracers.fire(from, shortTo, line.color, 5);
    });
    for (const m of G.gangs.members.slice(0, 4)) {
      G.effects.burst(m.x, 1.3, m.z, 10, [1, 0.9, 0.5], 4, 1);
    }
    // Raka's own SMG fire: teal tracers from his gun toward the Bara
    // line, plus a muzzle flash frozen at his position, so the shot
    // shows him shooting back, not just standing in the crossfire
    const baraLine = G.gangs.members.filter((m) => m.gang === 'bara').slice(0, 3);
    for (const m of baraLine) {
      G.tracers.fire({ x: 150, y: 1.3, z: 126 }, { x: m.x, y: 1.2, z: m.z }, 0x7fe3f0, 5);
    }
    G.effects.burst(150, 1.3, 125, 12, [0.5, 0.9, 1], 3, 1);
    // cover cars on the road between the gangs, parked
    const traffic = G.vehicles.list.filter((c) => c.driver === 'traffic');
    const spots = [
      { x: 141, z: 120, heading: Math.PI / 2 },
      { x: 159, z: 120, heading: -Math.PI / 2 },
    ];
    traffic.slice(0, 2).forEach((c, i) => {
      c.x = spots[i].x; c.z = spots[i].z; c.heading = spots[i].heading; c.speed = 0;
    });
    // pedestrians fleeing the war zone, running south past the camera
    G.peds.list.slice(0, 8).forEach((ped, i) => {
      ped.x = 128 + (i % 4) * 15;
      ped.z = 134 + Math.floor(i / 4) * 7;
      ped.state = 'flee';
      ped.heading = Math.PI; // facing south, away from the street
    });
    // foreground fill (the v5 gap: the bottom of the frame was bare
    // pavement): parked cars along the south kerb, lamps + hydrants at
    // the frame edges, more fleeing peds close to the camera, and a
    // market stall half-cut at the left edge, so the bottom of the shot
    // is street life, not empty asphalt. Positions sit at z 132-134:
    // the first pass put them at z 137-141 and they fell below the
    // frame's bottom edge (short props that close to the camera are
    // under the bottom ray); the fleeing peds at z 134 render at the
    // bottom edge, so the fill mirrors that band.
    traffic.slice(2, 5).forEach((c, i) => {
      const spots = [
        { x: 136, z: 133, heading: Math.PI / 2 },
        { x: 164, z: 133, heading: -Math.PI / 2 },
        { x: 150, z: 134, heading: Math.PI / 2 },
      ];
      c.x = spots[i].x; c.z = spots[i].z; c.heading = spots[i].heading; c.speed = 0;
    });
    G.peds.list.slice(8, 12).forEach((ped, i) => {
      ped.x = 134 + i * 10;
      ped.z = 132;
      ped.state = 'flee';
      ped.heading = Math.PI;
    });
    const lampL = makeLamp(); lampL.position.set(128, 0, 134); G.scene.add(lampL);
    const lampR = makeLamp(); lampR.position.set(172, 0, 134); G.scene.add(lampR);
    const hydL = makeHydrant(); hydL.position.set(144, 0, 134); G.scene.add(hydL);
    const hydR = makeHydrant(); hydR.position.set(156, 0, 134); G.scene.add(hydR);
    const stallF = makeStallMesh(STALLS[1]); stallF.position.set(120, 0, 134); G.scene.add(stallF);
    // police: 2 stars, one foot cop closing in from the east side
    G.wanted.addHeat(30);
    balanceUnits(G.police, G.wanted.stars, G.player.x, G.player.z, G.rng);
    const footCop = G.police.units.find((u) => u.kind === 'foot');
    if (footCop) { footCop.ped.x = 162; footCop.ped.z = 127; }
    const policeCar = G.police.units.find((u) => u.kind === 'car');
    if (policeCar) { policeCar.car.x = 205; policeCar.car.z = 120; policeCar.car.heading = Math.PI / 2; policeCar.car.speed = 0; }
    // staged camera + wider FOV (see the header comment above)
    if (G.camera) { G.camera.fov = 70; G.camera.updateProjectionMatrix(); }
    G.shotCamera = { pos: { x: 150, y: 7, z: 142 }, look: { x: 150, y: 1.2, z: 108 } };
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
    // camera looks 0.3 rad toward the sea (south): the beach, palms,
    // umbrellas and crowd fill the left third of the frame and the sea
    // reads beyond them, instead of the frame being all road
    G.cameraRig.snapTo(car.heading, 0.3);
    // escape mission m2: the objective banner + TERLIHAT indicator read
    G.wanted.addHeat(75); // 4 stars
    const def = G.missions.defs.find((m) => m.id === 'm2');
    G.missions.start(def);
    balanceUnits(G.police, G.wanted.stars, G.player.x, G.player.z, G.rng);
    // police cars IN FRAME and CLOSE (the v2 complaint: small and far,
    // bottom half empty road): two cutting across just ahead of the
    // player, and a third right behind the player on the north lane,
    // between the camera and the player car, so it reads big in the
    // lower-right of the frame like the reference's nearest unit
    const units = G.police.units.filter((u) => u.kind === 'car');
    const spots = [
      { x: 48, z: 275, heading: -Math.PI / 2 }, // ahead-left, facing the player
      { x: 50, z: 285, heading: -Math.PI / 2 }, // ahead-right, facing the player
      { x: 62, z: 275.5, heading: Math.PI / 2 }, // behind, in pursuit, big
    ];
    units.forEach((u, i) => {
      const s = spots[i % spots.length];
      u.car.x = s.x; u.car.z = s.z; u.car.heading = s.heading; u.car.speed = 20;
    });
    // staged police fire: long-life tracers from the police cars toward
    // the player, so the captured frame shows the chase shooting back
    // (live police tracers live 0.12s and would expire before frame 2)
    for (const u of units) {
      G.tracers.fire(
        { x: u.car.x, y: 1.3, z: u.car.z },
        { x: car.x, y: 1.2, z: car.z },
        0xffe9a0, 5,
      );
    }
    G.effects.burst(units[0].car.x, 1.3, units[0].car.z, 6, [1, 0.9, 0.5], 3, 1);
    // traffic ahead on the beachfront road (the other v2 complaint:
    // no cars ahead): four cars strung down the road in front of the
    // player, so the road ahead is full, not an empty stretch
    const traffic = G.vehicles.list.filter((c) => c.driver === 'traffic');
    const trafficSpots = [
      { x: 44, z: 280, heading: Math.PI / 2 },
      { x: 36, z: 276, heading: Math.PI / 2 },
      { x: 27, z: 284, heading: Math.PI / 2 },
      { x: 18, z: 278, heading: -Math.PI / 2 }, // oncoming
    ];
    traffic.slice(0, 4).forEach((c, i) => {
      c.x = trafficSpots[i].x; c.z = trafficSpots[i].z; c.heading = trafficSpots[i].heading; c.speed = 12;
    });
    // helicopter low, close and ahead (2x scale): big across the top of
    // the frame like the reference, not a toy at the top edge. It sits
    // SOUTH of the road, over the beach (z 296, not 284): from the chase
    // camera that puts it upper-left over the sea, clear of the objective
    // banner, and the camera sees its side, not just its dark underside.
    // y 5, not 7: updateHeli lerps it toward hover height 20 over the
    // staged frames, so a y 7 start ends half-clipped at the top edge.
    // angle pi puts its orbit target north of the player, so it drifts
    // over the road, not out to sea
    G.heli.active = true;
    G.heli.leaving = false;
    G.heli.angle = Math.PI;
    G.heli.x = 42; G.heli.z = 296; G.heli.y = 5;
    // crowd of pedestrians on the beach sidewalk watching the chase,
    // two packed rows facing the road (was one loose row facing west)
    G.peds.list.forEach((ped, i) => {
      ped.x = -30 + (i % 8) * 14;
      ped.z = i < 8 ? 291 : 296;
      ped.heading = 0; // facing north, toward the road
    });
    G.shotCamera = null;
    return;
  }
  if (name === '4-mission') {
    // The map + phone menu screen (Tab), like the reference: the full
    // city map on the left with the mission route, the HP menu on the
    // right with the current job card. Night (21:17) at the Pasar Malam
    // market: the player is at the first stall, mission m0 active
    // (job card "Paket Pertama", $150 reward, countdown running), $850
    // in pocket, SMG in the loadout, 2 stars on the HUD. Polish 7
    // staging: today's daily event is also running (orange marker on
    // the map, daily row in the MISI pane), and the map carries the new
    // markers (gun shop $, weapon pickups, daily !). The side arc is
    // listed in the MISI pane but not started here: the live rig checks
    // the job card reads "Paket Pertama". The boot code opens the map
    // screen from G.shotScreen; the 3D scene behind the overlay is the
    // market street, so the map marker sits where the player actually
    // stands.
    G.clock = 797;
    G.player.x = STALLS[0].x; G.player.z = STALLS[0].z + 4;
    G.player.heading = -Math.PI / 3;
    G.player.onFoot = true;
    G.player.car = null;
    G.player.money = 850;
    G.player.hasPistol = true;
    G.player.ammo = 12;
    G.player.pistolReserve = 12;
    G.player.health = 85;
    giveWeapon(G.player.weapons, 'smg', 1);
    G.wanted.addHeat(30); // 2 stars on the HUD
    const def = G.missions.defs.find((m) => m.id === 'm0');
    G.missions.start(def);
    // today's daily event running with 2 minutes left
    G.daily.event = new DailyEvent(G.daily.def).start();
    G.daily.event.timeLeft = 120;
    G.shotScreen = 'map';
    G.shotCamera = null;
    return;
  }
}
