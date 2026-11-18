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
  // Once no police unit has had line of sight for hiddenBoostAfter seconds,
  // the player is properly losing the tail: heat drains much faster.
  hiddenDecayRate: 8,
  hiddenBoostAfter: 3,
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

// Police helicopter: joins the chase at 3+ stars. It keeps line of sight
// from the air unless the player breaks it by hugging a building (cover)
// or outrunning its watch radius.
export const HELI = {
  minStars: 3,
  watchRadius: 55, // horizontal distance inside which it can see the player
  followSpeed: 22, // units/s: slower than a sports car, faster than on foot
  hoverHeight: 20,
  orbitRadius: 26,
};

// Named districts of Solmarina (rect centres + sizes, for the HUD label and
// the full map screen). x east, z south; the beach is the southern strip.
export const DISTRICTS = [
  { name: 'Bukit Warna', x: -230, z: -230, w: 150, h: 150 },
  { name: 'Kota Tua', x: -195, z: 30, w: 150, h: 190 },
  { name: 'Pusat Kota', x: -10, z: -60, w: 220, h: 200 },
  { name: 'Pelabuhan', x: 205, z: -195, w: 150, h: 150 },
  { name: 'Taman Kota', x: -80, z: 160, w: 130, h: 110 },
  { name: 'Pasar Malam', x: 150, z: 120, w: 180, h: 170 },
  { name: 'Marina', x: -205, z: 245, w: 150, h: 110 },
  { name: 'Pantai Ombak', x: 0, z: 325, w: 560, h: 100 },
];

// Night-market stalls (Pasar Malam). Buying heals; each stall also has a
// flavour line when the player is broke.
export const STALLS = [
  { name: 'Warung Sate Madura', item: 'Sate ayam + lontong', price: 10, heal: 25, x: 96, z: 124, flavor: 'Sate habis, tinggal tusuknya. Besok lagi ya.' },
  { name: 'Es Kelapa Muda', item: 'Es kelapa muda', price: 8, heal: 15, x: 128, z: 124, flavor: 'Kelapa habis, es batunya masih.' },
  { name: 'Gorengan Bu Tini', item: 'Gorengan campur', price: 5, heal: 10, x: 160, z: 124, flavor: 'Gorengan tinggal piringnya. Datang pagi-pagi.' },
];

// Phone contacts for the map screen (avatar colour drives the HP menu).
export const CONTACTS = [
  { name: 'Marlo', role: 'Bos - yang kasih misi', detail: 'Jangan bikin ribut di Pasar Malam.', color: '#e07856' },
  { name: 'Sari', role: 'Montir bengkel', detail: 'Mobil rusak? Bawa ke bengkel, jangan ke laut.', color: '#5f9e8f' },
  { name: 'Dimas', role: 'Informan pelabuhan', detail: 'Polisi patroli jam 8 malam. Hati-hati.', color: '#8a9bb0' },
];

// Phone menu tabs (HP Raka), in order: Peta shows the current job card
// + mission progress, Misi lists the whole arc, Kontak the contacts,
// Stats the numbers. The reference phone (Mare Alta) has the same four.
export const PHONE_TABS = ['peta', 'misi', 'kontak', 'stats'];

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

// Gang war: Geng Ombak (teal, west end of the Pasar Malam street) vs
// Geng Bara (red, east end). A free-roam event, not a mission.
export const GANGS = {
  zone: { x: 150, z: 120, radius: 42 }, // the z=120 road through Pasar Malam
  size: 5, // members per side
  range: 30, // shooting range
  damage: 8, // damage to the player per crossfire hit
  heatPerSecond: 0.4, // gunfire draws police while the player watches
  cooldown: 60, // seconds before the war can start again
  sides: [
    { id: 'ombak', name: 'Geng Ombak', shirt: 0x2cc3e6, pants: 0x1d2f38 },
    { id: 'bara', name: 'Geng Bara', shirt: 0xef4a32, pants: 0x2e2a26 },
  ],
};

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
