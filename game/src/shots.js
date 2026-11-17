// Solmarina 3D: ?shot= scene staging for screenshots (browser only).
// Each scene stages the world, then main renders it twice and sets
// window.__solmarinaReady. Scenes: 1-start (title), 2-drive, 3-chase,
// 4-mission. All state is set from the live game, never faked.
import { SPAWNS } from './config.js';
import { balanceUnits } from './police.js';

export function stageShot(G, name) {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') || 1);
  if (name === '1-start') {
    G.screen = 'title';
    // camera vantage: high diagonal across the city toward the beach, so
    // rooftops, streets and the coast all sit behind the title panel
    G.shotCamera = { pos: { x: -140, y: 95, z: -190 }, look: { x: 80, y: 0, z: 130 } };
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
    G.shotCamera = null;
    return;
  }
  if (name === '3-chase') {
    G.screen = 'play';
    const car = G.vehicles.list.find((c) => c.type === 'sports' && !c.driver);
    G.player.x = car.x + 3; G.player.z = car.z;
    G.enterCar(car, true);
    car.speed = 18;
    car.damage = 62;
    car.heading = Math.PI;
    G.wanted.addHeat(75); // 4 stars
    balanceUnits(G.police, G.wanted.stars, G.player.x, G.player.z, G.rng);
    // put two police cars right behind the player
    const units = G.police.units.filter((u) => u.kind === 'car');
    units.forEach((u, i) => {
      u.car.x = car.x + (i === 0 ? 8 : -6);
      u.car.z = car.z + 12 + i * 6;
      u.car.heading = Math.PI;
      u.car.speed = 20;
    });
    G.shotCamera = null;
    return;
  }
  if (name === '4-mission') {
    G.screen = 'play';
    const car = G.vehicles.list.find((c) => c.type === 'taxi' && !c.driver);
    G.player.x = car.x + 3; G.player.z = car.z;
    G.enterCar(car, true);
    car.speed = 15;
    car.heading = Math.PI * 0.5; // east toward the cafe
    const def = G.missions.defs.find((m) => m.id === 'm0');
    G.missions.start(def);
    // stage the player mid-route to the cafe
    car.x = 60; car.z = 120;
    G.player.x = car.x; G.player.z = car.z;
    G.shotCamera = null;
    return;
  }
}
