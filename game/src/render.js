// Solmarina 3D: Three.js rendering (browser only). Ground canvas texture,
// low-poly buildings with facade textures, props, car/human mesh factories,
// particles, skid marks and the third-person camera rig.
import { WORLD, CAR, LIMITS, STALLS } from './config.js';
import { timeOfDay } from './daynight.js';
import {
  generateBuildings, roadLines, blockCentres, PARK_BLOCK,
} from './city.js';
import { mulberry32, range, pick, clamp, lerp, angleDiff } from './random.js';

// ---------- shared geometry / material caches ----------
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
const matCache = new Map();
function mat(color, opts) {
  const key = color + '|' + JSON.stringify(opts || {});
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color, ...(opts || {}) }));
  }
  return matCache.get(key);
}
function box(w, h, d, material) {
  const m = new THREE.Mesh(boxGeo, material);
  m.scale.set(w, h, d);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- facade textures ----------
// One call builds three canvases for the same window layout (same rng
// draws, so the lit windows match across all three):
//   day      — facade in daylight, a few lit windows
//   night    — darkened facade, most windows lit warm
//   emissive — black, only the lit windows: the night material's
//              emissiveMap, so lit windows actually GLOW after dark
//              instead of going dark with the rest of the facade.
const facadeCache = new Map();
function shade(color, f) {
  const r = Math.round(((color >> 16) & 255) * f);
  const g = Math.round(((color >> 8) & 255) * f);
  const b = Math.round((color & 255) * f);
  return (r << 16) | (g << 8) | b;
}
function facadeTextures(color, floors, cols, rng) {
  const key = color + '/' + floors + '/' + cols;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const hex = '#' + color.toString(16).padStart(6, '0');
  const nightHex = '#' + shade(color, 0.45).toString(16).padStart(6, '0');
  const day = document.createElement('canvas');
  const night = document.createElement('canvas');
  const emissive = document.createElement('canvas');
  for (const c of [day, night, emissive]) { c.width = 128; c.height = 256; }
  const gDay = day.getContext('2d');
  const gNight = night.getContext('2d');
  const gEm = emissive.getContext('2d');
  gDay.fillStyle = hex;
  gDay.fillRect(0, 0, 128, 256);
  gNight.fillStyle = nightHex;
  gNight.fillRect(0, 0, 128, 256);
  gEm.fillStyle = '#000000';
  gEm.fillRect(0, 0, 128, 256);
  // subtle vertical shading on the day facade
  gDay.fillStyle = 'rgba(0,0,0,0.08)';
  gDay.fillRect(0, 0, 128, 12);
  const ww = 128 / cols, wh = 256 / floors;
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const x = col * ww + ww * 0.22, y = f * wh + wh * 0.25, w = ww * 0.56, h = wh * 0.5;
      const litDay = rng() < 0.18;
      const litNight = rng() < 0.65;
      gDay.fillStyle = litDay ? '#ffe9a8' : '#2e3a46';
      gDay.fillRect(x, y, w, h);
      gNight.fillStyle = litNight ? '#ffd76a' : '#10141c';
      gNight.fillRect(x, y, w, h);
      if (litNight) {
        gEm.fillStyle = '#ffd76a';
        gEm.fillRect(x, y, w, h);
      }
    }
  }
  const out = {};
  for (const [name, canvas] of [['day', day], ['night', night], ['emissive', emissive]]) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    out[name] = tex;
  }
  facadeCache.set(key, out);
  return out;
}

// ---------- ground texture (one canvas: roads, sidewalks, park, beach) ----------
function groundTexture(seed) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const X0 = -320, Z0 = -320, X1 = 320, Z1 = 400; // world extent mapped
  const sx = (x) => ((x - X0) / (X1 - X0)) * S;
  const sz = (z) => ((z - Z0) / (Z1 - Z0)) * S;
  const ux = (u) => (u / (X1 - X0)) * S; // units -> px (x)
  const uz = (u) => (u / (Z1 - Z0)) * S; // units -> px (z)

  g.fillStyle = '#b5a996'; // city ground (concrete)
  g.fillRect(0, 0, S, S);
  // beach sand (south strip)
  g.fillStyle = '#e8d5a0';
  g.fillRect(0, sz(WORLD.beachZ), S, S - sz(WORLD.beachZ));
  // park block
  const lines = roadLines();
  const parkX0 = lines[PARK_BLOCK.bx], parkX1 = lines[PARK_BLOCK.bx + 1];
  const parkZ0 = lines[PARK_BLOCK.bz], parkZ1 = lines[PARK_BLOCK.bz + 1];
  g.fillStyle = '#7fb069';
  g.fillRect(sx(parkX0), sz(parkZ0), ux(parkX1 - parkX0), uz(parkZ1 - parkZ0));
  // sidewalks: light border inside each block
  g.fillStyle = '#c9bda6';
  for (const b of blockCentres()) {
    if (b.bx === PARK_BLOCK.bx && b.bz === PARK_BLOCK.bz) continue;
    g.fillRect(sx(b.x - WORLD.block / 2), sz(b.z - WORLD.block / 2), ux(WORLD.block), uz(WORLD.block));
  }
  // roads
  g.fillStyle = '#4a4a52';
  for (const l of lines) {
    g.fillRect(sx(l - WORLD.road / 2), 0, ux(WORLD.road), S);
    g.fillRect(0, sz(l - WORLD.road / 2), S, uz(WORLD.road));
  }
  // lane dashes (yellow, along each road centre)
  g.fillStyle = '#e8c832';
  for (const l of lines) {
    for (let t = -WORLD.half; t < WORLD.half + 80; t += 16) {
      g.fillRect(sx(l - 0.5), sz(t), ux(1), uz(8));
      g.fillRect(sx(t), sz(l - 0.5), ux(8), uz(1));
    }
  }
  // crosswalks at intersections
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const lx of lines) {
    for (const lz of lines) {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(sx(lx + i * 2 - 0.8), sz(lz - WORLD.road / 2 + 1), ux(1.6), uz(4));
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------- renderer / scene ----------
export function initRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5d6);
  scene.fog = new THREE.Fog(0xbfd9e8, 150, 520);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 8, 14);

  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x8a7a5a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0015;
  scene.add(sun);
  scene.add(sun.target);
  return { renderer, scene, camera, sun, hemi };
}

// Build the static city. Returns { buildings, water, parkTrees }.
export function buildEnvironment(scene, seed) {
  const rng = mulberry32(seed);
  const tex = groundTexture(seed);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 720),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  // water (south of the beach)
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 120),
    new THREE.MeshLambertMaterial({ color: 0x2f7fb8, transparent: true, opacity: 0.9 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.15, WORLD.waterZ + 45);
  scene.add(water);

  // buildings (record each facade material + its day/night/emissive
  // textures so the day/night applier can swap lit windows in after dark)
  const buildings = generateBuildings(seed);
  const facadeMats = [];
  for (const b of buildings) {
    const floors = Math.max(2, Math.round(b.h / 6));
    const cols = Math.max(2, Math.round(b.w / 9));
    const tex = facadeTextures(b.color, floors, cols, rng);
    const side = new THREE.MeshLambertMaterial({ map: tex.day, emissive: 0x000000, emissiveMap: tex.emissive });
    facadeMats.push({ material: side, day: tex.day, night: tex.night });
    const roof = mat(0x6b6258);
    const mesh = new THREE.Mesh(boxGeo, [side, side, roof, roof, side, side]);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Bukit Warna: hillside district north-west, a low hill crowded with
  // small colourful houses (the title screen's skyline anchor).
  const hill = new THREE.Mesh(
    new THREE.ConeGeometry(95, 55, 24),
    new THREE.MeshLambertMaterial({ color: 0x9a7b52 }),
  );
  hill.position.set(-235, 27.5, -235);
  hill.receiveShadow = true;
  scene.add(hill);
  const hillRng = mulberry32(seed + 77);
  for (let i = 0; i < 56; i++) {
    const a = hillRng() * Math.PI * 2;
    const r = 12 + hillRng() * 68;
    const x = -235 + Math.sin(a) * r;
    const z = -235 + Math.cos(a) * r;
    const y = Math.max(0, 55 * (1 - r / 95));
    const hw = 6 + hillRng() * 3, hd = 6 + hillRng() * 3, hh = 5 + hillRng() * 3;
    const house = box(hw, hh, hd, mat(pick(hillRng, [0xe07856, 0xe8dcc0, 0x5f9e8f, 0xe0a83c, 0xc97b84, 0x8a9bb0, 0xd95d4e, 0x58a05c])));
    house.position.set(x, y + hh / 2 - 0.5, z);
    house.rotation.y = hillRng() * Math.PI;
    house.castShadow = false; // decor only: 42 houses must not double the shadow pass
    scene.add(house);
    const hRoof = box(hw + 0.6, 0.5, hd + 0.6, mat(0x7a4a30));
    hRoof.position.set(x, y + hh + 0.1, z);
    hRoof.rotation.y = house.rotation.y;
    hRoof.castShadow = false;
    scene.add(hRoof);
  }

  // distant mountains: an overlapping north ridge + two islands south
  // beyond the sea, so the horizon reads as a mountain range, not
  // isolated pale pyramids. Dusky mauve/plum at sunset, dark slate
  // to the south; varied heights and a random twist per peak. Kept
  // light enough that the shaded faces read as dusk, not black.
  const ridgeRng = mulberry32(seed + 31);
  for (const [mx, mz, ms, mh, mc] of [
    [-340, -440, 170, 95, 0x8a6f83], [-220, -460, 190, 125, 0x9a6f88],
    [-90, -450, 170, 100, 0x7d6a84], [40, -465, 200, 130, 0x9a6f88],
    [170, -445, 160, 90, 0x8a6f83], [290, -430, 180, 110, 0x756a80],
    [380, -450, 150, 80, 0x8a6f83],
    [-320, 480, 120, 55, 0x5a6a80], [260, 490, 150, 70, 0x5a6a80],
  ]) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(ms, mh, 6),
      new THREE.MeshLambertMaterial({ color: mc }),
    );
    m.position.set(mx, mh / 2 - 4, mz);
    m.rotation.y = ridgeRng() * Math.PI;
    scene.add(m);
  }
  // distant skyline towers north-east, outside the drivable city: a
  // downtown cluster just north of the city edge, tall enough to rise
  // above the rooftops into the title screen's skyline
  for (const [tx, tz, th] of [[170, -300, 85], [220, -295, 110], [270, -300, 75], [290, -295, 95], [130, -300, 60]]) {
    const floors = Math.max(4, Math.round(th / 6));
    const tex = facadeTextures(0x8a9bb0, floors, 5, rng);
    const side = new THREE.MeshLambertMaterial({ map: tex.day, emissive: 0x000000, emissiveMap: tex.emissive });
    facadeMats.push({ material: side, day: tex.day, night: tex.night });
    const tower = new THREE.Mesh(boxGeo, [side, side, mat(0x4a4640), mat(0x4a4640), side, side]);
    tower.scale.set(26, th, 26);
    tower.position.set(tx, th / 2, tz);
    scene.add(tower);
  }

  // sun / moon disc on the horizon (the day/night applier moves it).
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }),
  );
  scene.add(sunDisc);

  // park trees + benches
  const lines = roadLines();
  const parkTrees = [];
  const px0 = lines[PARK_BLOCK.bx], px1 = lines[PARK_BLOCK.bx + 1];
  const pz0 = lines[PARK_BLOCK.bz], pz1 = lines[PARK_BLOCK.bz + 1];
  for (let i = 0; i < 14; i++) {
    const x = range(rng, px0 + 8, px1 - 8);
    const z = range(rng, pz0 + 8, pz1 - 8);
    const tree = makeTree(rng);
    tree.position.set(x, 0, z);
    scene.add(tree);
    parkTrees.push(tree);
  }
  // street trees along some roads
  for (let i = 0; i < 20; i++) {
    const line = pick(rng, lines);
    const t = range(rng, -WORLD.half + 20, WORLD.half - 20);
    const tree = makeTree(rng);
    tree.position.set(line + WORLD.road / 2 + 3, 0, t);
    scene.add(tree);
  }
  // lamps at intersections
  const lampMats = [];
  for (const lx of lines) {
    for (const lz of lines) {
      if (rng() < 0.5) continue;
      const lamp = makeLamp();
      lamp.position.set(lx + WORLD.road / 2 + 1.5, 0, lz + WORLD.road / 2 + 1.5);
      scene.add(lamp);
      lampMats.push(lamp.userData.headMat);
    }
  }
  // palm trees along the beachfront road (z = 280 line) and the park
  for (let x = -280; x <= 280; x += 28) {
    if (rng() < 0.2) continue;
    const palm = makePalm(rng);
    palm.position.set(x + range(rng, -4, 4), 0, 288 + range(rng, -2, 6));
    scene.add(palm);
  }
  for (let i = 0; i < 6; i++) {
    const palm = makePalm(rng);
    palm.position.set(range(rng, px0 + 8, px1 - 8), 0, range(rng, pz0 + 8, pz1 - 8));
    scene.add(palm);
  }
  // beach umbrellas on the sand (z 300-310, just south of the crowd),
  // seeded on their own rng so the rest of the decor keeps its v2
  // layout: the chase shot's crowd sits among them and they read from
  // the road as a beach strip
  const umRng = mulberry32(seed + 911);
  for (let x = -160; x <= 140; x += 24) {
    if (umRng() < 0.25) continue;
    const um = makeUmbrella(umRng);
    um.position.set(x + range(umRng, -6, 6), 0, 298 + range(umRng, 0, 8));
    um.rotation.y = umRng() * Math.PI;
    scene.add(um);
  }
  // hydrants
  for (let i = 0; i < 8; i++) {
    const line = pick(rng, lines);
    const t = range(rng, -WORLD.half + 20, WORLD.half - 20);
    const h = makeHydrant();
    h.position.set(line + WORLD.road / 2 + 2, 0, t);
    scene.add(h);
  }
  // night-market stalls (Pasar Malam) + a vendor standing at each one.
  // Each stall also gets a warm point light: at night the market glows
  // and the ground in front of the counter is lit, instead of the whole
  // foreground falling to black.
  const stalls = [];
  for (const s of STALLS) {
    const stall = makeStallMesh(s);
    stall.position.set(s.x, 0, s.z);
    scene.add(stall);
    const vendor = makeHumanMesh(0xd95d4e, 0x2e3a46, 0xd9a066);
    vendor.position.set(s.x, 0, s.z + 2.2);
    vendor.rotation.y = Math.PI;
    scene.add(vendor);
    const glow = new THREE.PointLight(0xffb45e, 0, 18, 1.6);
    glow.position.set(s.x, 3.2, s.z);
    scene.add(glow);
    stalls.push({ ...s, mesh: stall, light: glow });
  }
  return { buildings, water, parkTrees, facadeMats, lampMats, sunDisc, stalls };
}

// Day/night lighting applier. Cheap per frame (colour lerps); the
// texture/lamp swaps only run when the lighting bucket changes.
export function createDayNight(scene, sun, hemi, env) {
  let lastBucket = null;
  const api = {
    sunOffset: { x: 80, y: 120, z: 60 },
    apply(hour) {
      const t = timeOfDay(hour);
      const bucket = (t.night ? 'n' : t.golden ? 'g' : 'd') + (t.lampsOn ? 'L' : '');
      // NOTE: setRGB values are sRGB here (THREE.SRGBColorSpace); the
      // default linear interpretation washed the sunset out to pale peach.
      scene.background.setRGB(t.sky[0], t.sky[1], t.sky[2], THREE.SRGBColorSpace);
      scene.fog.color.setRGB(t.fog[0], t.fog[1], t.fog[2], THREE.SRGBColorSpace);
      sun.color.setRGB(t.sunColor[0], t.sunColor[1], t.sunColor[2], THREE.SRGBColorSpace);
      sun.intensity = t.sunIntensity;
      hemi.intensity = t.hemiIntensity;
      // low sun at golden hour (long shadows toward the north-east), high
      // at noon, cool moonlight at night
      const low = 1 - Math.max(0, Math.min(1, (t.sunElevation - 0.07) / 0.48));
      api.sunOffset = { x: 80 - 200 * low, y: 120 - 84 * low, z: 60 + 80 * low };
      // sun/moon disc low over the sea to the south-west at golden hour
      const disc = env.sunDisc;
      if (t.night) {
        disc.position.set(-100, 170, 430);
        disc.material.color.setHex(0xdfe8ff);
        disc.scale.setScalar(0.8);
      } else if (t.golden) {
        // west-northwest over the ridge, NOT south-west over the sea: the
        // title camera sits south looking north, so a south-west disc is
        // behind it and the title has no visible sun. From the re-aimed
        // title camera this disc sits upper-left, clear of the title
        // text; from the west-looking chase camera it is out of frame,
        // instead of a clipped orange blob at the top edge.
        disc.position.set(-420, 80, -120);
        disc.material.color.setHex(0xffd76a);
        disc.scale.setScalar(1.8);
      } else {
        disc.position.set(200, 190, 430);
        disc.material.color.setHex(0xfff2c0);
        disc.scale.setScalar(1);
      }
      disc.lookAt(0, 60, -200);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        for (const f of env.facadeMats) {
          f.material.map = t.night ? f.night : f.day;
          // lit windows glow after dark (emissiveMap holds only the lit
          // windows, so the facade itself stays dark)
          if (t.night) {
            f.material.emissive.setHex(0xffc46b);
            f.material.emissiveIntensity = 1.0;
          } else {
            f.material.emissive.setHex(0x000000);
            f.material.emissiveIntensity = 0;
          }
        }
        for (const m of env.lampMats) m.emissiveIntensity = t.lampsOn ? 2.4 : 0.4;
        for (const s of env.stalls) {
          s.mesh.userData.bulbMat.emissiveIntensity = t.lampsOn ? 2.4 : 0.5;
          s.light.intensity = t.lampsOn ? 30 : 0;
        }
      }
      return t;
    },
  };
  return api;
}

export function makeTree(rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), mat(0x7a5230));
  trunk.position.y = 1.1; trunk.castShadow = true;
  const s = range(rng, 0.9, 1.4);
  const top = new THREE.Mesh(
    new THREE.ConeGeometry(1.8 * s, 3.6 * s, 8), mat(0x4e8a3f));
  top.position.y = 3.6 * s; top.castShadow = true;
  g.add(trunk, top);
  return g;
}

export function makeLamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5, 6), mat(0x3a3f44));
  pole.position.y = 2.5; pole.castShadow = true;
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), headMat);
  head.position.set(0.7, 5, 0);
  const arm = box(1.4, 0.12, 0.12, mat(0x3a3f44));
  arm.position.set(0.7, 4.9, 0);
  g.add(pole, arm, head);
  g.userData.headMat = headMat;
  return g;
}

// Beach umbrella: pole + bright cone canopy. Static decor on the sand
// south of the beachfront road, so the beach reads as a beach (crowd +
// umbrellas + sea) from the chase camera, like the reference.
export function makeUmbrella(rng) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), mat(0xe8e2d0));
  pole.position.y = 1.2; pole.castShadow = false;
  g.add(pole);
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.9, 0.9, 8),
    mat(pick(rng, [0xe04848, 0xf2c230, 0x2f7fb8, 0xe07856, 0x58a05c, 0xf2f2f2])),
  );
  canopy.position.y = 2.7; canopy.castShadow = false;
  g.add(canopy);
  return g;
}

// Palm tree: leaning trunk + a crown of flat fronds.
export function makePalm(rng) {
  const g = new THREE.Group();
  const lean = range(rng, -0.12, 0.12);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.26, 4.6, 6), mat(0x8a6a42));
  trunk.position.y = 2.3; trunk.rotation.z = lean; trunk.castShadow = false;
  g.add(trunk);
  const topX = -Math.sin(lean) * 4.6, topY = 4.6;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 2.6, 4),
      mat(i % 2 ? 0x3f7d33 : 0x4e8a3f));
    frond.position.set(topX + Math.sin(a) * 1.0, topY - 0.15, Math.cos(a) * 1.0);
    frond.rotation.set(Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1);
    frond.scale.set(1, 1, 0.28);
    frond.castShadow = false;
    g.add(frond);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), mat(0x6b4a26));
  nuts.position.set(topX, topY - 0.4, 0);
  g.add(nuts);
  return g;
}

// Night-market stall: counter + striped awning + goods crates.
export function makeStallMesh(stall) {
  const g = new THREE.Group();
  const counter = box(3.4, 1.1, 1.6, mat(0x7a4a30));
  counter.position.y = 0.55;
  const top = box(3.6, 0.12, 1.8, mat(0x5a3622));
  top.position.y = 1.15;
  g.add(counter, top);
  // striped awning: alternating canvas-coloured slats
  for (let i = 0; i < 6; i++) {
    const slat = box(0.6, 0.08, 2.2, mat(i % 2 ? 0xe04848 : 0xf2f2f2));
    slat.position.set(-1.5 + i * 0.6, 2.6, 0);
    slat.rotation.x = 0.25;
    g.add(slat);
  }
  for (const sx of [-1.5, 1.5]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), mat(0x3a3f44));
    pole.position.set(sx, 1.3, -0.9);
    g.add(pole);
  }
  // goods: crates + pots on the counter
  const goods = [0xe0a83c, 0x58a05c, 0xd95d4e, 0xe8dcc0];
  goods.forEach((c, i) => {
    const crate = box(0.6, 0.4, 0.5, mat(c));
    crate.position.set(-1.2 + i * 0.8, 1.4, 0);
    g.add(crate);
  });
  // warm bulb under the awning (glows at night via the day/night applier)
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.6 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bulbMat);
  bulb.position.set(0, 2.35, 0);
  g.add(bulb);
  g.userData.bulbMat = bulbMat;
  return g;
}

// Police helicopter: body, tail boom + rotor, skids, searchlight cone.
export function makeHeliMesh() {
  const g = new THREE.Group();
  // bright police blue, not dark navy: from the chase camera (below and
  // behind) a navy heli reads as a black slab; this reads as a helicopter
  const bodyMat = mat(0x4a7fb8);
  const body = box(2.6, 1.4, 4.2, bodyMat);
  body.position.y = 0;
  const glass = box(2.2, 0.8, 1.2, new THREE.MeshLambertMaterial({ color: 0x9fc4d8, emissive: 0x2a4a5a, emissiveIntensity: 0.4 }));
  glass.position.set(0, 0.2, -2.0);
  const tail = box(0.7, 0.7, 4.6, bodyMat);
  tail.position.set(0, 0.3, 4.0);
  const fin = box(0.25, 1.4, 0.9, mat(0x1e3a5f));
  fin.position.set(0, 0.8, 6.0);
  const rotor = new THREE.Group();
  const bladeMat = mat(0x22242a);
  for (const a of [0, Math.PI / 2]) {
    const blade = box(9.5, 0.08, 0.5, bladeMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  rotor.position.y = 1.1;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), mat(0x22242a));
  mast.position.y = 0.85;
  for (const sx of [-1, 1]) {
    const skid = box(0.14, 0.14, 3.4, mat(0x22242a));
    skid.position.set(sx * 1.1, -1.0, 0);
    const strut = box(0.1, 0.5, 0.1, mat(0x22242a));
    strut.position.set(sx * 1.1, -0.75, 0.8);
    g.add(skid, strut);
  }
  // belly: a darker inset panel + sensor ball + second strut pair, so
  // the underside reads as a helicopter from below instead of a flat
  // slab (the chase camera sits below the heli)
  const belly = box(2.0, 0.3, 3.0, mat(0x1e3a5f));
  belly.position.y = -0.8;
  g.add(belly);
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0x22242a));
  sensor.position.set(0, -1.0, -1.3);
  g.add(sensor);
  for (const sx of [-1, 1]) {
    const strut2 = box(0.1, 0.5, 0.1, mat(0x22242a));
    strut2.position.set(sx * 1.1, -0.75, -0.8);
    g.add(strut2);
  }
  // tail rotor on the fin, so the tail reads from the side too
  const tailRotor = new THREE.Group();
  for (const a of [0, Math.PI / 2]) {
    const blade = box(0.08, 1.1, 0.12, bladeMat);
    blade.rotation.x = a;
    tailRotor.add(blade);
  }
  tailRotor.position.set(0.2, 0.8, 6.0);
  g.add(tailRotor);
  // searchlight cone pointing down (subtle: at golden hour a bright
  // cone reads as a grey sail, so it stays faint)
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.5, 16, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = -8.5;
  beam.rotation.x = Math.PI; // apex up at the heli
  g.add(body, glass, tail, fin, mast, rotor, beam);
  g.userData.rotor = rotor;
  g.userData.beam = beam;
  return g;
}

export function makeHydrant() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 8), mat(0xc0392b));
  body.position.y = 0.45; body.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0x922b21));
  cap.position.y = 0.95;
  g.add(body, cap);
  return g;
}

// ---------- vehicles ----------
export function makeCarMesh(type) {
  const t = CAR.types[type] || CAR.types.sedan;
  const g = new THREE.Group();
  const bodyMat = mat(t.color);
  const darkMat = mat(0x22242a);
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2f3d, emissive: 0x0e1a24, emissiveIntensity: 0.6 });
  // body: lower slab + hood/trunk shaping via a slimmer upper slab
  const body = box(CAR.width, 0.75, CAR.length, bodyMat);
  body.position.y = 0.62;
  const hood = box(CAR.width * 0.94, 0.22, CAR.length * 0.24, bodyMat);
  hood.position.set(0, 1.05, -CAR.length * 0.32);
  // cabin: body-coloured shell with a dark glass band, not a glass brick
  const cabin = box(CAR.width * 0.8, 0.6, CAR.length * 0.46, bodyMat);
  cabin.position.set(0, 1.28, -0.15);
  const glassBand = box(CAR.width * 0.82, 0.34, CAR.length * 0.42, glassMat);
  glassBand.position.set(0, 1.3, -0.15);
  const roof = box(CAR.width * 0.78, 0.08, CAR.length * 0.44, bodyMat);
  roof.position.set(0, 1.62, -0.15);
  // windshield + rear window: slanted glass panes on the cabin faces
  const shield = box(CAR.width * 0.74, 0.5, 0.06, glassMat);
  shield.position.set(0, 1.32, -0.15 - CAR.length * 0.23);
  shield.rotation.x = -0.28;
  const rearGlass = box(CAR.width * 0.74, 0.42, 0.06, glassMat);
  rearGlass.position.set(0, 1.32, -0.15 + CAR.length * 0.23);
  rearGlass.rotation.x = 0.22;
  g.add(body, hood, cabin, glassBand, roof, shield, rearGlass);
  // bumpers
  for (const bz of [-CAR.length / 2 - 0.06, CAR.length / 2 + 0.06]) {
    const bumper = box(CAR.width * 0.96, 0.22, 0.14, mat(0x2e3138));
    bumper.position.set(0, 0.42, bz);
    g.add(bumper);
  }
  if (type === 'truck') {
    const boxBack = box(CAR.width * 0.95, 1.5, CAR.length * 0.5, mat(0xe8e2d0));
    boxBack.position.set(0, 1.35, 1.0);
    g.add(boxBack);
  }
  if (type === 'taxi') {
    const sign = box(0.9, 0.22, 0.4, new THREE.MeshLambertMaterial({ color: 0xffe9a0, emissive: 0xffd23e, emissiveIntensity: 0.5 }));
    sign.position.set(0, 1.75, -0.2);
    g.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Group();
    const red = box(0.5, 0.16, 0.3, new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 0.9 }));
    red.position.x = -0.35;
    const blue = box(0.5, 0.16, 0.3, new THREE.MeshLambertMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 0.9 }));
    blue.position.x = 0.35;
    bar.add(red, blue);
    bar.position.set(0, 1.72, -0.2);
    g.add(bar);
    g.userData.lightBar = bar;
  }
  // headlights + taillights
  const hl = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xfff2a0, emissiveIntensity: 0.8 });
  for (const s of [-1, 1]) {
    const h = box(0.4, 0.16, 0.08, hl);
    h.position.set(s * 0.7, 0.62, -CAR.length / 2 - 0.02);
    const tl = box(0.4, 0.16, 0.08, new THREE.MeshLambertMaterial({ color: 0xff3020, emissive: 0xff2020, emissiveIntensity: 0.6 }));
    tl.position.set(s * 0.7, 0.62, CAR.length / 2 + 0.02);
    g.add(h, tl);
  }
  // wheels + hubs (hub spins with the wheel: it is round, so no wobble)
  const wheels = [];
  const wheelMat = mat(0x1a1a1c);
  const hubMat = mat(0xb8bcc2);
  for (const [wx, wz] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    w.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10), hubMat);
    hub.rotation.z = Math.PI / 2;
    w.add(hub);
    g.add(w);
    wheels.push(w);
  }
  // headlight beams at night: one spotlight, only lit for the player's car
  const headlight = new THREE.SpotLight(0xffe9a0, 0, 42, 0.55, 0.5, 1.2);
  headlight.position.set(0, 1.0, -CAR.length / 2);
  const hlTarget = new THREE.Object3D();
  hlTarget.position.set(0, 0, -16);
  g.add(headlight, hlTarget);
  headlight.target = hlTarget;
  g.userData.wheels = wheels;
  g.userData.body = body;
  g.userData.headlight = headlight;
  return g;
}

// ---------- humans ----------
export function makeHumanMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = mat(shirt);
  const pantsMat = mat(pants);
  const skinMat = mat(skin || 0xd9a066);
  const torso = box(0.62, 0.72, 0.34, shirtMat);
  torso.position.y = 1.12;
  const head = box(0.34, 0.34, 0.32, skinMat);
  head.position.y = 1.68;
  const hair = box(0.36, 0.12, 0.34, mat(0x2a2018));
  hair.position.y = 1.86;
  const legL = box(0.24, 0.72, 0.26, pantsMat);
  legL.geometry = boxGeo;
  legL.position.set(-0.16, 0.36, 0);
  const legR = box(0.24, 0.72, 0.26, pantsMat);
  legR.position.set(0.16, 0.36, 0);
  const armL = box(0.18, 0.62, 0.2, shirtMat);
  armL.position.set(-0.42, 1.12, 0);
  const armR = box(0.18, 0.62, 0.2, shirtMat);
  armR.position.set(0.42, 1.12, 0);
  // pivot limbs at their top: wrap each in a pivot group
  function pivot(mesh, px, py) {
    const p = new THREE.Group();
    p.position.set(px, py, 0);
    mesh.position.set(0, mesh.position.y - py, 0);
    p.add(mesh);
    return p;
  }
  const pLegL = pivot(legL, -0.16, 0.72);
  const pLegR = pivot(legR, 0.16, 0.72);
  const pArmL = pivot(armL, -0.42, 1.42);
  const pArmR = pivot(armR, 0.42, 1.42);
  g.add(torso, head, hair, pLegL, pLegR, pArmL, pArmR);
  g.userData = { legL: pLegL, legR: pLegR, armL: pArmL, armR: pArmR, head };
  return g;
}

// Walk-cycle pose for a human mesh: phase advances with distance walked.
export function poseWalk(mesh, phase, amount) {
  const u = mesh.userData;
  const s = Math.sin(phase) * amount;
  u.legL.rotation.x = s;
  u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.8;
  u.armR.rotation.x = s * 0.8;
}
export function poseIdle(mesh) {
  poseWalk(mesh, 0, 0);
}

// ---------- mission beacon + pickup ----------
export function makeBeaconMesh() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 13;
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  gem.position.y = 4.5;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.14, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  g.add(beam, gem, ring);
  g.userData.gem = gem;
  return g;
}

export function makePickupMesh() {
  const g = new THREE.Group();
  const gun = box(0.5, 0.14, 0.16, mat(0x22242a));
  const grip = box(0.14, 0.3, 0.14, mat(0x22242a));
  grip.position.set(0.16, -0.18, 0);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.07, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
  );
  ring.rotation.x = Math.PI / 2;
  g.add(gun, grip, ring);
  g.userData.ring = ring;
  return g;
}

// ---------- particles ----------
export function createParticles(scene) {
  const N = LIMITS.particles;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const material = new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < N; i++) parts.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, max: 1, r: 1, g: 1, b: 1 });
  let cursor = 0;
  function spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const p = parts[cursor];
    cursor = (cursor + 1) % N;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.r = r; p.g = g; p.b = b;
  }
  return {
    burst(x, y, z, n, color, speed, up) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.6);
        spawn(x, y, z, Math.cos(a) * s, (up || 2) * Math.random(), Math.sin(a) * s,
          0.5 + Math.random() * 0.5, color[0], color[1], color[2]);
      }
    },
    smoke(x, y, z) {
      spawn(x, y, z, (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6,
        1.2, 0.25, 0.25, 0.25);
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.vy -= 1.5 * dt;
          if (p.y < 0.05) { p.y = 0.05; p.vy = 0; }
        } else {
          p.y = -99;
        }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        const f = p.life > 0 ? p.life / p.max : 0;
        col[i * 3] = p.r * f; col[i * 3 + 1] = p.g * f; col[i * 3 + 2] = p.b * f;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

// ---------- tracer lines ----------
// Gunfire reads as glowing bolts, not dots or wires: a pool of short
// additive cylinders (bright white core + coloured halo) stretched
// between shooter and target, fading fast (0.12s live). THREE.Line is
// always 1px no matter the distance, so at screenshot range it read as
// a wire; a cylinder keeps real thickness from every angle. Staged
// shots fire them with a long life instead, so the captured frame
// keeps them.
const _tracerUp = new THREE.Vector3(0, 1, 0);
export function createTracers(scene) {
  const N = 24;
  const bolts = [];
  const outerGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 6, 1, true);
  const coreGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 6, 1, true);
  for (let i = 0; i < N; i++) {
    const outerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(outerGeo, outerMat), new THREE.Mesh(coreGeo, coreMat));
    group.visible = false;
    scene.add(group);
    bolts.push({ group, outerMat, coreMat, life: 0, max: 1 });
  }
  let cursor = 0;
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  return {
    fire(from, to, color, life) {
      const t = bolts[cursor];
      cursor = (cursor + 1) % N;
      dir.set(to.x - from.x, to.y - from.y, to.z - from.z);
      const len = dir.length();
      if (len < 0.05) { t.group.visible = false; t.life = 0; return; }
      dir.divideScalar(len);
      mid.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      t.group.position.copy(mid);
      t.group.quaternion.setFromUnitVectors(_tracerUp, dir);
      t.group.scale.set(1, len, 1);
      const c = color || 0xffe9a0;
      t.outerMat.color.setHex(c);
      t.coreMat.color.setHex(c).lerp(new THREE.Color(0xffffff), 0.7);
      t.life = life || 0.12;
      t.max = t.life;
      t.outerMat.opacity = 0.7;
      t.coreMat.opacity = 1;
      t.group.visible = true;
    },
    update(dt) {
      for (const t of bolts) {
        if (t.life > 0) {
          t.life -= dt;
          const f = Math.max(0, t.life / t.max);
          t.outerMat.opacity = 0.7 * f;
          t.coreMat.opacity = f;
          if (t.life <= 0) t.group.visible = false;
        }
      }
    },
    get activeCount() { return bolts.filter((t) => t.life > 0).length; },
  };
}

// ---------- skid marks ----------
export function createSkids(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const marks = [];
  const geo = new THREE.PlaneGeometry(0.5, 1.4);
  const material = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.55, depthWrite: false });
  return {
    add(x, z, heading) {
      if (marks.length >= LIMITS.skids) {
        const old = marks.shift();
        group.remove(old.mesh);
      }
      const mesh = new THREE.Mesh(geo, material.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = heading;
      mesh.position.set(x, 0.03, z);
      group.add(mesh);
      marks.push({ mesh, life: 7 });
    },
    update(dt) {
      for (let i = marks.length - 1; i >= 0; i--) {
        const m = marks[i];
        m.life -= dt;
        if (m.life <= 0) {
          group.remove(m.mesh);
          marks.splice(i, 1);
        } else if (m.life < 2) {
          m.mesh.material.opacity = 0.55 * (m.life / 2);
        }
      }
    },
  };
}

// ---------- third-person camera rig ----------
export function createCameraRig(camera) {
  let yaw = 0; // world yaw the camera sits behind
  let freeYaw = 0; // drag offset, decays back to 0
  let yawOffset = 0; // staged offset off the follow axis (chase shot:
  // the camera looks 0.3 rad toward the sea so the beach fills the
  // left of the frame); persists in targetYaw so the per-frame lerp
  // does not eat it before the staged frame renders
  let trauma = 0;
  let t = 0;
  return {
    addTrauma(amount) { trauma = clamp(trauma + amount, 0, 1); },
    get trauma() { return trauma; },
    snapTo(heading, offset) { yawOffset = offset || 0; yaw = heading + yawOffset; freeYaw = 0; },
    // Title/menu orbit: high, slow, wide — the city fills the frame.
    updateMenu(dt, target, now) {
      t += dt;
      const a = now / 14000;
      const cx = target.x + Math.sin(a) * 190;
      const cz = target.z + Math.cos(a) * 190;
      camera.position.set(cx, 95, cz);
      camera.lookAt(target.x - 40, 0, target.z + 160);
    },
    // target: {x, z} of what to follow; heading: its facing; inCar: bool.
    update(dt, target, heading, inCar, dragDX) {
      t += dt;
      trauma = Math.max(0, trauma - dt * 1.4);
      freeYaw += (dragDX || 0) * 0.004;
      freeYaw *= Math.pow(0.5, dt / 1.5); // decay back toward following
      // follow the heading, but let the drag offset persist briefly
      const targetYaw = heading + yawOffset + freeYaw;
      yaw += angleDiff(yaw, targetYaw) * Math.min(1, dt * (inCar ? 2.2 : 3.2));
      // higher + further than the old rig, looking a touch further ahead:
      // the old low camera filled the bottom third of the frame with
      // empty near road, in the car and on foot alike. In the car the
      // rig is close and low instead, so the player's car fills the
      // bottom of the frame like the reference chase shot.
      const dist = inCar ? 9.5 : 5.5;
      const height = inCar ? 5.2 : 4.6;
      const cx = target.x + Math.sin(yaw) * dist;
      const cz = target.z + Math.cos(yaw) * dist;
      const sh = trauma * trauma;
      const shx = sh * 0.9 * Math.sin(t * 39.7);
      const shy = sh * 0.6 * Math.sin(t * 51.3);
      camera.position.set(cx + shx, height + shy, cz);
      camera.lookAt(target.x, inCar ? 1.6 : 1.5, target.z);
    },
  };
}
