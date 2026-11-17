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
    const car = G.vehicles.list.find((c) => c.type === 'sports' && !c.driver);
    G.player.x = car.x + 3; G.player.z = car.z;
    G.enterCar(car, true);
    car.speed = 22;
    car.heading = Math.PI; // driving south down the main road
    G.player.x = car.x; G.player.z = car.z;
    G.cameraRig.snapTo(car.heading); // snap: the rig lerps and would not
    // converge in the two staged frames, leaving the camera off-axis
    // traffic ahead on the same road, so the drive reads as a city
    // street with cars in it, not an empty stretch of asphalt
    const traffic = G.vehicles.list.filter((c) => c.driver === 'traffic');
    const spots = [
      { x: 120, z: 24, heading: Math.PI },
      { x: 124, z: 52, heading: Math.PI },
      { x: 116, z: 78, heading: 0 }, // oncoming taxi lane
    ];
    traffic.slice(0, 3).forEach((c, i) => {
      c.x = spots[i].x; c.z = spots[i].z; c.heading = spots[i].heading; c.speed = 12;
    });
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
    G.screen = 'play';
    // night (21:17) at the Pasar Malam street market: lit towers, stalls,
    // the [E] interact prompt. Player on foot at the first stall, facing
    // north-east so the second and third stalls read down the street to
    // the right, taxi parked on the same street, mission m0 active (the
    // cafe beacon sits down the road to the east). Shoppers crowd the
    // stalls so the market feels alive.
    G.clock = 797;
    const car = G.vehicles.list.find((c) => c.type === 'taxi' && !c.driver);
    car.x = 136; car.z = 112; car.heading = -Math.PI / 2;
    G.player.x = STALLS[0].x; G.player.z = STALLS[0].z + 4;
    G.player.heading = -Math.PI / 3; // facing east-north-east, down the
    // market row: stalls 2 and 3 and the gold cafe beacon read across
    // the frame to the right, instead of sitting behind the minimap
    G.player.onFoot = true;
    G.player.car = null;
    G.cameraRig.snapTo(-Math.PI / 3);
    // shoppers at ALL THREE stalls plus two in the FOREGROUND, one at
    // each lower corner of the frame (was 4 shoppers at one stall):
    // the market reads busy, and the bottom half of the frame is people
    // and street, not empty pavement. Foreground spots are beside the
    // camera-player axis, not behind the camera: south of the player is
    // behind the camera from this angle, so the first attempt at (92,134)
    // never rendered. All face south, toward the camera.
    G.peds.list.slice(0, 8).forEach((ped, i) => {
      const spots = [
        [100, 128], [112, 130], // stall 1 (Sate Madura)
        [124, 128], [136, 130], // stall 2 (Es Kelapa)
        [156, 128], [168, 130], // stall 3 (Gorengan)
        [93, 125], [99, 132], // foreground, lower-left / lower-right
      ];
      ped.x = spots[i][0]; ped.z = spots[i][1];
      ped.heading = Math.PI;
    });
    // traffic on the market street, so the road to the right is busy
    // too (the taxi is already parked at 136,112)
    const traffic = G.vehicles.list.filter((c) => c.driver === 'traffic');
    const trafficSpots = [
      { x: 180, z: 116, heading: -Math.PI / 2 }, // eastbound
      { x: 204, z: 124, heading: Math.PI / 2 }, // westbound
    ];
    traffic.slice(0, 2).forEach((c, i) => {
      c.x = trafficSpots[i].x; c.z = trafficSpots[i].z; c.heading = trafficSpots[i].heading; c.speed = 10;
    });
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
