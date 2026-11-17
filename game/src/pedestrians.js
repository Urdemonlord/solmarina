// Solmarina 3D: pedestrians (browser only). They walk the sidewalks,
// turn at intersections, and flee from crimes and fast cars.
import { WORLD } from './config.js';
import { roadLines, nearestRoadPoint } from './city.js';
import { mulberry32, range, pick } from './random.js';
import { poseWalk, poseIdle } from './render.js';

const SHIRTS = [0xd95d4e, 0x4e7dd9, 0x58a05c, 0xe0a83c, 0x8e6bbf, 0xd9d9d9, 0x2e8b8b];
const PANTS = [0x2e3a46, 0x5a4632, 0x3a3a3a, 0x4a5a6a];

export function createPeds(rng, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const x = range(rng, -WORLD.half + 20, WORLD.half - 20);
    const z = range(rng, -WORLD.half + 20, WORLD.half - 20);
    const p = nearestRoadPoint(x, z);
    list.push({
      x: p.x + (rng() < 0.5 ? -1 : 1) * (WORLD.road / 2 + 2.5),
      z: p.z + (rng() < 0.5 ? -1 : 1) * (WORLD.road / 2 + 2.5),
      heading: rng() * Math.PI * 2,
      speed: 1.6 + rng() * 1.2,
      state: 'walk', // walk | flee
      shirt: pick(rng, SHIRTS),
      pants: pick(rng, PANTS),
      walkPhase: rng() * 6,
      fleeTimer: 0,
      cop: false,
      dead: false,
    });
  }
  return list;
}

// dt seconds; threats: [{x, z, radius}] the peds run from.
export function updatePeds(list, dt, threats, buildings) {
  for (const p of list) {
    if (p.dead) continue;
    let flee = false;
    for (const t of threats) {
      const dx = p.x - t.x, dz = p.z - t.z;
      if (dx * dx + dz * dz < t.radius * t.radius) { flee = true; break; }
    }
    if (flee) {
      p.state = 'flee';
      p.fleeTimer = 2;
    } else if (p.fleeTimer > 0) {
      p.fleeTimer -= dt;
    } else {
      p.state = 'walk';
    }
    const speed = p.state === 'flee' ? 5.5 : p.speed;
    // turn at intersections: pick a new road direction sometimes
    if (Math.random() < dt * 0.12) {
      p.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    if (p.state === 'flee' && threats.length) {
      // run away from the nearest threat
      const t = threats[0];
      p.heading = Math.atan2(-(p.x - t.x), -(p.z - t.z));
    }
    p.x += -Math.sin(p.heading) * speed * dt;
    p.z += -Math.cos(p.heading) * speed * dt;
    // keep inside the city
    p.x = Math.max(-WORLD.half - 10, Math.min(WORLD.half + 10, p.x));
    p.z = Math.max(-WORLD.half - 10, Math.min(WORLD.beachZ + 10, p.z));
    p.walkPhase += dt * speed * 2.2;
  }
}

export function syncPedMesh(mesh, ped) {
  mesh.position.set(ped.x, 0, ped.z);
  mesh.rotation.y = ped.heading;
  if (ped.state === 'flee') poseWalk(mesh, ped.walkPhase, 0.7);
  else poseWalk(mesh, ped.walkPhase, 0.4);
  mesh.visible = !ped.dead;
}
