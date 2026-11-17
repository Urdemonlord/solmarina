// Solmarina 3D: city layout data (pure). The renderer builds meshes from
// this; collision and traffic read the same data. x east, z south, centre (0,0).
// Roads run on grid lines; blocks sit between them.
import { WORLD, DISTRICTS } from './config.js';
import { mulberry32, range, pick } from './random.js';

export const BUILDING_COLORS = [
  0xe07856, // terracotta
  0xe8dcc0, // cream
  0x5f9e8f, // teal
  0xe0a83c, // mustard
  0xc97b84, // dusty pink
  0x8a9bb0, // slate blue
  0xd9c9a3, // sand
];

export const PARK_BLOCK = { bx: 2, bz: 5 }; // park replaces buildings here
export const BEACH_BLOCKS = null; // beach is the strip south of the city

// Road centre lines: grid lines at these coordinates.
export function roadLines() {
  const lines = [];
  const step = WORLD.block + WORLD.road;
  const start = -WORLD.half + WORLD.road / 2;
  for (let i = 0; i <= WORLD.blocks; i++) {
    lines.push(start + i * step);
  }
  return lines;
}

// Block centres: the square between four roads.
export function blockCentres() {
  const out = [];
  const lines = roadLines();
  for (let bz = 0; bz < WORLD.blocks; bz++) {
    for (let bx = 0; bx < WORLD.blocks; bx++) {
      out.push({
        bx, bz,
        x: (lines[bx] + lines[bx + 1]) / 2,
        z: (lines[bz] + lines[bz + 1]) / 2,
      });
    }
  }
  return out;
}

// Deterministic building list for one seed: {x, z, w, d, h, color}.
// Each block holds 1-4 buildings with a sidewalk margin; the park block
// holds none. Buildings are axis-aligned boxes (AABBs) for collision.
export function generateBuildings(seed) {
  const rng = mulberry32(seed);
  const list = [];
  for (const b of blockCentres()) {
    if (b.bx === PARK_BLOCK.bx && b.bz === PARK_BLOCK.bz) continue;
    const n = 1 + Math.floor(rng() * 3); // 1-3 buildings per block
    const margin = 10;
    const inner = WORLD.block - margin * 2;
    if (n === 1) {
      const w = range(rng, inner * 0.55, inner * 0.8);
      const d = range(rng, inner * 0.55, inner * 0.8);
      list.push({ x: b.x, z: b.z, w, d, h: range(rng, 10, 42), color: pick(rng, BUILDING_COLORS) });
    } else {
      // split the block into n slabs along x
      const gap = 6;
      const w = (inner - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const x = b.x - inner / 2 + w / 2 + i * (w + gap);
        list.push({
          x, z: b.z + range(rng, -6, 6),
          w: w * range(rng, 0.85, 1), d: range(rng, inner * 0.5, inner * 0.8),
          h: range(rng, 8, 34), color: pick(rng, BUILDING_COLORS),
        });
      }
    }
  }
  return list;
}

// AABB collision: push a circle (x, z, r) out of every building it overlaps.
// Returns true when a push happened.
export function collideBuildings(buildings, p, r) {
  let hit = false;
  for (const b of buildings) {
    const hw = b.w / 2, hd = b.d / 2;
    const cx = Math.max(b.x - hw, Math.min(p.x, b.x + hw));
    const cz = Math.max(b.z - hd, Math.min(p.z, b.z + hd));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest axis
        const px = hw + r - Math.abs(p.x - b.x);
        const pz = hd + r - Math.abs(p.z - b.z);
        if (px < pz) p.x = b.x + Math.sign(p.x - b.x || 1) * (hw + r);
        else p.z = b.z + Math.sign(p.z - b.z || 1) * (hd + r);
      }
    }
  }
  return hit;
}

// Is (x, z) on a road (within half road width of a grid line)?
export function onRoad(x, z) {
  const lines = roadLines();
  const hw = WORLD.road / 2;
  for (const l of lines) {
    if (Math.abs(x - l) < hw || Math.abs(z - l) < hw) return true;
  }
  return false;
}

// Nearest point on the road network to (x, z): snaps to the closest line.
export function nearestRoadPoint(x, z) {
  const lines = roadLines();
  let bx = lines[0], bz = lines[0];
  for (const l of lines) {
    if (Math.abs(x - l) < Math.abs(x - bx)) bx = l;
    if (Math.abs(z - l) < Math.abs(z - bz)) bz = l;
  }
  // Prefer the closer axis: snap x if the vertical road is closer, else z.
  if (Math.abs(x - bx) < Math.abs(z - bz)) return { x: bx, z };
  return { x, z: bz };
}

// Named district containing (x, z), or null outside every district rect.
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (Math.abs(x - d.x) <= d.w / 2 && Math.abs(z - d.z) <= d.h / 2) return d.name;
  }
  return null;
}

// Manhattan route along the road grid from `from` to `to`, for the HUD
// arrow's ground line and the full map screen. Points are {x, z}.
export function routePoints(from, to) {
  const a = nearestRoadPoint(from.x, from.z);
  const b = nearestRoadPoint(to.x, to.z);
  const pts = [{ x: from.x, z: from.z }, a];
  if (a.x !== b.x && a.z !== b.z) pts.push({ x: b.x, z: a.z });
  pts.push(b);
  pts.push({ x: to.x, z: to.z });
  // drop consecutive duplicates
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.z !== p.z) out.push(p);
  }
  return out;
}

// Rectangular loop around one block, for traffic cars.
export function blockLoop(bx, bz) {
  const lines = roadLines();
  const x0 = lines[bx], x1 = lines[bx + 1];
  const z0 = lines[bz], z1 = lines[bz + 1];
  return [
    { x: x0, z: z0 }, { x: x1, z: z0 },
    { x: x1, z: z1 }, { x: x0, z: z1 },
  ];
}
