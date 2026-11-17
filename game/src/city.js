// Solmarina itself: the road grid, the blocks between them, the buildings,
// the park, the marina basin, the beach and the sea, plus every collision and
// spawn query the rest of the game asks. The city is data, built once from a
// seed; nothing here draws or touches the browser.

import { BEACH, MARINA, PALETTE, PARK, PLAZA, ROADS, WORLD } from './config.js';
import { intIn, pick, range } from './random.js';

const HALF_ROAD = ROADS.width / 2;

/** Is (x, y) inside a road? */
export function onRoad(x, y) {
  for (const v of ROADS.vertical) if (Math.abs(x - v) < HALF_ROAD) return true;
  for (const h of ROADS.horizontal) if (Math.abs(y - h) < HALF_ROAD) return true;
  return false;
}

/** Is (x, y) in water (the sea or the marina basin)? */
export function inWater(x, y) {
  if (y >= BEACH.seaTop) return true;
  return x >= MARINA.x && x < MARINA.x + MARINA.width && y >= MARINA.y && y < MARINA.y + MARINA.height;
}

function blockBands() {
  const columns = [];
  const rows = [];
  const verticals = [0, ...ROADS.vertical, WORLD.width];
  const horizontals = [0, ...ROADS.horizontal, WORLD.height];
  for (let i = 0; i < verticals.length - 1; i += 1) {
    const from = verticals[i] + (i === 0 ? 0 : HALF_ROAD);
    const to = verticals[i + 1] - (i + 1 === verticals.length - 1 ? 0 : HALF_ROAD);
    if (to - from > 120) columns.push({ from, to });
  }
  for (let j = 0; j < horizontals.length - 1; j += 1) {
    const from = horizontals[j] + (j === 0 ? 0 : HALF_ROAD);
    const to = horizontals[j + 1] - (j + 1 === horizontals.length - 1 ? 0 : HALF_ROAD);
    if (to - from > 120 && to < BEACH.sandTop) rows.push({ from, to });
  }
  return { columns, rows };
}

function makeBuildings(random, blocks) {
  const buildings = [];
  for (const block of blocks) {
    const count = intIn(random, 1, 3);
    const inset = 26;
    const inner = {
      x: block.x + inset,
      y: block.y + inset,
      width: block.width - inset * 2,
      height: block.height - inset * 2,
    };
    if (count === 1) {
      buildings.push({
        x: inner.x + inner.width * 0.12,
        y: inner.y + inner.height * 0.12,
        width: inner.width * 0.76,
        height: inner.height * 0.76,
        roof: pick(random, PALETTE.buildingRoof),
        elevation: intIn(random, 14, 30),
      });
    } else if (count === 2) {
      const half = inner.width / 2 - 10;
      for (let side = 0; side < 2; side += 1) {
        buildings.push({
          x: inner.x + side * (half + 20),
          y: inner.y + inner.height * 0.15,
          width: half,
          height: inner.height * 0.7,
          roof: pick(random, PALETTE.buildingRoof),
          elevation: intIn(random, 12, 26),
        });
      }
    } else {
      buildings.push({
        x: inner.x,
        y: inner.y,
        width: inner.width * 0.55,
        height: inner.height * 0.45,
        roof: pick(random, PALETTE.buildingRoof),
        elevation: intIn(random, 12, 24),
      });
      buildings.push({
        x: inner.x + inner.width * 0.6,
        y: inner.y,
        width: inner.width * 0.4,
        height: inner.height * 0.45,
        roof: pick(random, PALETTE.buildingRoof),
        elevation: intIn(random, 12, 24),
      });
      buildings.push({
        x: inner.x,
        y: inner.y + inner.height * 0.55,
        width: inner.width,
        height: inner.height * 0.45,
        roof: pick(random, PALETTE.buildingRoof),
        elevation: intIn(random, 12, 24),
      });
    }
  }
  return buildings;
}

function makeProps(random, buildings) {
  const trees = [];
  const lamps = [];
  const hydrants = [];
  const benches = [];
  // Trees and lamps along the sidewalks, just outside the road edge.
  for (const v of ROADS.vertical) {
    for (let y = 120; y < BEACH.sandTop - 60; y += 190) {
      if (random() < 0.45) continue;
      const side = random() < 0.5 ? -1 : 1;
      trees.push({ x: v + side * (HALF_ROAD + 22), y: y + range(random, -30, 30), r: range(random, 12, 17) });
    }
    for (const h of ROADS.horizontal) {
      lamps.push({ x: v + (random() < 0.5 ? -1 : 1) * (HALF_ROAD + 8), y: h + (random() < 0.5 ? -1 : 1) * (HALF_ROAD + 8) });
    }
  }
  for (let index = 0; index < 14; index += 1) {
    const v = pick(random, ROADS.vertical);
    hydrants.push({ x: v + (random() < 0.5 ? -1 : 1) * (HALF_ROAD + 10), y: range(random, 200, BEACH.sandTop - 100), r: 6 });
  }
  // Park trees and benches, plaza benches.
  for (let index = 0; index < 10; index += 1) {
    trees.push({ x: range(random, PARK.x + 20, PARK.x + PARK.width - 20), y: range(random, PARK.y + 20, PARK.y + PARK.height - 20), r: range(random, 13, 18) });
  }
  for (let index = 0; index < 5; index += 1) {
    benches.push({ x: range(random, PARK.x + 30, PARK.x + PARK.width - 30), y: range(random, PARK.y + 30, PARK.y + PARK.height - 30) });
    benches.push({ x: range(random, PLAZA.x + 30, PLAZA.x + PLAZA.width - 30), y: range(random, PLAZA.y + 30, PLAZA.y + PLAZA.height - 30) });
  }
  // Keep props out of buildings.
  function clearOfBuildings(list) {
    return list.filter((prop) => {
      for (const b of buildings) {
        if (prop.x > b.x - 8 && prop.x < b.x + b.width + 8 && prop.y > b.y - 8 && prop.y < b.y + b.height + 8) return false;
      }
      return true;
    });
  }
  return {
    trees: clearOfBuildings(trees),
    lamps: clearOfBuildings(lamps),
    hydrants: clearOfBuildings(hydrants),
    benches: clearOfBuildings(benches),
  };
}

function makeParkingSpots(random) {
  const spots = [];
  for (let index = 0; index < 44; index += 1) {
    if (random() < 0.5) {
      const v = pick(random, ROADS.vertical);
      const side = random() < 0.5 ? -1 : 1;
      spots.push({ x: v + side * (HALF_ROAD + 14), y: range(random, 260, BEACH.sandTop - 120), angle: Math.PI / 2 });
    } else {
      const h = pick(random, ROADS.horizontal);
      const side = random() < 0.5 ? -1 : 1;
      spots.push({ x: range(random, 260, WORLD.width - 260), y: h + side * (HALF_ROAD + 14), angle: 0 });
    }
  }
  return spots;
}

export function createCity(random) {
  const { columns, rows } = blockBands();
  const blocks = [];
  for (const column of columns) {
    for (const row of rows) {
      const block = { x: column.from, y: row.from, width: column.to - column.from, height: row.to - row.from };
      blocks.push(block);
    }
  }
  // The three special blocks hold the park, the marina and the plaza, not buildings.
  function isSpecial(block) {
    const centreX = block.x + block.width / 2;
    const centreY = block.y + block.height / 2;
    return (
      (centreX > PARK.x && centreX < PARK.x + PARK.width && centreY > PARK.y && centreY < PARK.y + PARK.height) ||
      (centreX > MARINA.x && centreX < MARINA.x + MARINA.width && centreY > MARINA.y && centreY < MARINA.y + MARINA.height) ||
      (centreX > PLAZA.x && centreX < PLAZA.x + PLAZA.width && centreY > PLAZA.y && centreY < PLAZA.y + PLAZA.height)
    );
  }
  const buildingBlocks = blocks.filter((block) => !isSpecial(block));
  const buildings = makeBuildings(random, buildingBlocks);
  const props = makeProps(random, buildings);
  const parkingSpots = makeParkingSpots(random);
  const intersections = [];
  for (const v of ROADS.vertical) {
    for (const h of ROADS.horizontal) intersections.push({ x: v, y: h });
  }
  const city = { buildings, props, parkingSpots, intersections, blocks: buildingBlocks };
  return city;
}

/** Push a circle out of buildings, water and the world edge. Returns { x, y, hit }. */
export function collideCircle(city, x, y, radius) {
  let hit = false;
  let px = x;
  let py = y;
  for (const b of city.buildings) {
    const closestX = Math.max(b.x, Math.min(px, b.x + b.width));
    const closestY = Math.max(b.y, Math.min(py, b.y + b.height));
    const dx = px - closestX;
    const dy = py - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < radius * radius) {
      hit = true;
      if (distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        px = closestX + (dx / dist) * radius;
        py = closestY + (dy / dist) * radius;
      } else {
        // Centre inside the building: push out along the smallest overlap.
        const left = px - b.x;
        const right = b.x + b.width - px;
        const top = py - b.y;
        const bottom = b.y + b.height - py;
        const min = Math.min(left, right, top, bottom);
        if (min === left) px = b.x - radius;
        else if (min === right) px = b.x + b.width + radius;
        else if (min === top) py = b.y - radius;
        else py = b.y + b.height + radius;
      }
    }
  }
  // Water is solid ground for wheels and feet.
  if (py + radius > BEACH.seaTop) {
    py = BEACH.seaTop - radius;
    hit = true;
  }
  if (px > MARINA.x - radius && px < MARINA.x + MARINA.width + radius && py > MARINA.y - radius && py < MARINA.y + MARINA.height + radius) {
    const left = px - (MARINA.x - radius);
    const right = MARINA.x + MARINA.width + radius - px;
    const top = py - (MARINA.y - radius);
    const bottom = MARINA.y + MARINA.height + radius - py;
    const min = Math.min(left, right, top, bottom);
    if (min === left) px = MARINA.x - radius;
    else if (min === right) px = MARINA.x + MARINA.width + radius;
    else if (min === top) py = MARINA.y - radius;
    else py = MARINA.y + MARINA.height + radius;
    hit = true;
  }
  px = Math.max(radius, Math.min(WORLD.width - radius, px));
  py = Math.max(radius, Math.min(WORLD.height - radius, py));
  return { x: px, y: py, hit };
}

/** The nearest intersection to (x, y). */
export function nearestIntersection(city, x, y) {
  let best = city.intersections[0];
  let bestDist = Infinity;
  for (const point of city.intersections) {
    const dist = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  }
  return best;
}

/** A random point on a road, for spawns. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    return { x: pick(random, ROADS.vertical), y: range(random, 240, BEACH.sandTop - 120) };
  }
  return { x: range(random, 240, WORLD.width - 240), y: pick(random, ROADS.horizontal) };
}

/** A random point on a sidewalk (just off a road), for pedestrians. */
export function randomSidewalkPoint(random) {
  if (random() < 0.5) {
    const v = pick(random, ROADS.vertical);
    const side = random() < 0.5 ? -1 : 1;
    return { x: v + side * (HALF_ROAD + 12), y: range(random, 240, BEACH.sandTop - 120) };
  }
  const h = pick(random, ROADS.horizontal);
  const side = random() < 0.5 ? -1 : 1;
  return { x: range(random, 240, WORLD.width - 240), y: h + side * (HALF_ROAD + 12) };
}
