// Solmarina 3D: Three.js rendering (browser only). Ground canvas texture,
// low-poly buildings with facade textures, props, car/human mesh factories,
// particles, skid marks and the third-person camera rig.
import { WORLD, CAR, LIMITS } from './config.js';
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
const facadeCache = new Map();
function facadeTexture(color, floors, cols, rng) {
  const key = color + '/' + floors + '/' + cols;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  g.fillStyle = 'rgba(0,0,0,0.08)';
  g.fillRect(0, 0, 128, 12);
  const ww = 128 / cols, wh = 256 / floors;
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() < 0.18;
      g.fillStyle = lit ? '#ffe9a8' : '#2e3a46';
      g.fillRect(col * ww + ww * 0.22, f * wh + wh * 0.25, ww * 0.56, wh * 0.5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  facadeCache.set(key, tex);
  return tex;
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
  g.fillStyle = '#3a3a40';
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
  return { renderer, scene, camera, sun };
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

  // buildings
  const buildings = generateBuildings(seed);
  for (const b of buildings) {
    const floors = Math.max(2, Math.round(b.h / 6));
    const cols = Math.max(2, Math.round(b.w / 9));
    const facade = facadeTexture(b.color, floors, cols, rng);
    const side = new THREE.MeshLambertMaterial({ map: facade });
    const roof = mat(0x6b6258);
    const mesh = new THREE.Mesh(boxGeo, [side, side, roof, roof, side, side]);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

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
  for (const lx of lines) {
    for (const lz of lines) {
      if (rng() < 0.5) continue;
      const lamp = makeLamp();
      lamp.position.set(lx + WORLD.road / 2 + 1.5, 0, lz + WORLD.road / 2 + 1.5);
      scene.add(lamp);
    }
  }
  // hydrants
  for (let i = 0; i < 8; i++) {
    const line = pick(rng, lines);
    const t = range(rng, -WORLD.half + 20, WORLD.half - 20);
    const h = makeHydrant();
    h.position.set(line + WORLD.road / 2 + 2, 0, t);
    scene.add(h);
  }
  return { buildings, water, parkTrees };
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
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.7 }));
  head.position.set(0.7, 5, 0);
  const arm = box(1.4, 0.12, 0.12, mat(0x3a3f44));
  arm.position.set(0.7, 4.9, 0);
  g.add(pole, arm, head);
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
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });
  const body = box(CAR.width, 0.75, CAR.length, bodyMat);
  body.position.y = 0.62;
  const cabin = box(CAR.width * 0.82, 0.62, CAR.length * 0.48, glassMat);
  cabin.position.set(0, 1.3, -0.2);
  g.add(body, cabin);
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
  // wheels
  const wheels = [];
  const wheelMat = mat(0x1a1a1c);
  for (const [wx, wz] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.body = body;
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
  let trauma = 0;
  let t = 0;
  return {
    addTrauma(amount) { trauma = clamp(trauma + amount, 0, 1); },
    get trauma() { return trauma; },
    snapTo(heading) { yaw = heading; freeYaw = 0; },
    // target: {x, z} of what to follow; heading: its facing; inCar: bool.
    update(dt, target, heading, inCar, dragDX) {
      t += dt;
      trauma = Math.max(0, trauma - dt * 1.4);
      freeYaw += (dragDX || 0) * 0.004;
      freeYaw *= Math.pow(0.5, dt / 1.5); // decay back toward following
      // follow the heading, but let the drag offset persist briefly
      const targetYaw = heading + freeYaw;
      yaw += angleDiff(yaw, targetYaw) * Math.min(1, dt * (inCar ? 2.2 : 3.2));
      const dist = inCar ? 13 : 9;
      const height = inCar ? 6.5 : 5;
      const cx = target.x + Math.sin(yaw) * dist;
      const cz = target.z + Math.cos(yaw) * dist;
      const sh = trauma * trauma;
      const shx = sh * 0.9 * Math.sin(t * 39.7);
      const shy = sh * 0.6 * Math.sin(t * 51.3);
      camera.position.set(cx + shx, height + shy, cz);
      camera.lookAt(target.x, inCar ? 1.6 : 1.4, target.z);
    },
  };
}
