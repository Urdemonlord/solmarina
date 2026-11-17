// Solmarina 3D: world constants, tuning and the mission arc.
// Pure data, no DOM, no THREE: imported by the game and by the unit tests.
export const WORLD = {
  block: 64, // city block size (units)
  road: 16, // road width
  blocks: 7, // blocks per side
  // City spans x,z in [-half, half]; the beach is south of z = beachZ.
  get half() { return (this.blocks * this.block + (this.blocks + 1) * this.road) / 2; },
  beachZ: 296, // sand starts here
  waterZ: 330, // water plane starts here
  seaLevel: 0,
};

export const PLAYER = {
  height: 1.8,
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.6,
  health: 100,
};

export const CAR = {
  // Arcade handling, per car type: top speed (units/s), accel, brake, steer.
  types: {
    sedan:  { top: 34, accel: 16, brake: 30, steer: 1.9, color: 0x5b7fa6, name: 'Sedan' },
    taxi:   { top: 32, accel: 15, brake: 30, steer: 1.9, color: 0xf2c230, name: 'Taksi' },
    sports: { top: 46, accel: 24, brake: 36, steer: 2.3, color: 0xc0392b, name: 'Sport' },
    truck:  { top: 26, accel: 10, brake: 24, steer: 1.5, color: 0xd8d3c3, name: 'Truk' },
    police: { top: 40, accel: 20, brake: 34, steer: 2.1, color: 0xf2f2f2, name: 'Polisi' },
  },
  length: 4.4,
  width: 2.0,
  radius: 2.2, // collision circle
  maxDamage: 100,
};

export const WANTED = {
  // heat thresholds per star; heat decays when no crime for decayDelay seconds.
  starAt: [12, 30, 55, 75, 90],
  decayDelay: 8,
  decayRate: 2.5, // heat per second while hidden
  crimeHeat: {
    stealCar: 14,
    carjack: 20,
    hitPed: 18,
    hitCop: 30,
    shoot: 12,
    punch: 6,
    crash: 2,
  },
};

export const POLICE = {
  maxCars: 4, // at 5 stars
  maxFoot: 3,
  carSpeed: 38,
  footSpeed: 7.5,
  shootRange: 26,
  shootDamage: 8,
  bustRadius: 1.8,
  bustTime: 1.2,
  fine: 100,
};

// Mission arc: same story as the 2D game, re-staged in 3D coordinates.
// x east, z south; the city centre is (0, 0).
export const MISSIONS = [
  {
    id: 'm0', title: 'Paket Pertama', reward: 150, time: 150,
    start: { x: 0, z: -40 }, // mission marker near the park
    steps: [
      { kind: 'goto', label: 'Antar paket ke Kafe Ombak', target: { x: 160, z: 120 } },
    ],
  },
  {
    id: 'm1', title: 'Kejar Target', reward: 250, time: 180,
    start: { x: 0, z: -40 },
    steps: [
      { kind: 'ram', label: 'Tabrak mobil target 3 kali', hits: 3 },
    ],
  },
  {
    id: 'm2', title: 'Kabur dari Polisi', reward: 300, time: 150,
    start: { x: 0, z: -40 },
    steps: [
      { kind: 'escape', label: 'Hilang dari kejaran polisi', seconds: 60 },
    ],
  },
  {
    id: 'm3', title: 'Rampas Mobil', reward: 400, time: 240,
    start: { x: 0, z: -40 },
    steps: [
      { kind: 'steal', label: 'Curi mobil sport merah di marina', target: { x: -210, z: 250 } },
      { kind: 'goto', label: 'Antar ke bengkel', target: { x: -160, z: -120 } },
    ],
  },
  {
    id: 'm4', title: 'Antar Bos', reward: 600, time: 180,
    start: { x: 0, z: -40 },
    steps: [
      { kind: 'goto', label: 'Antar Marlo ke marina', target: { x: -210, z: 250 } },
    ],
  },
];

export const SPAWNS = {
  player: { x: 0, z: -8, heading: 0 },
  policeStation: { x: -210, z: -210 },
  hospital: { x: 210, z: -210 },
  pistolPickup: { x: 40, z: -160 }, // in the park
  garage: { x: -160, z: -120 },
  marina: { x: -210, z: 250 },
  cafe: { x: 160, z: 120 },
};

export const LIMITS = {
  trafficCars: 10,
  peds: 14,
  particles: 300,
  skids: 120,
};
