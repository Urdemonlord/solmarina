// Every tuning number and colour in one place. Solmarina is a 3200x2400 coastal
// city; the renderer shows a 1280x720 logical view scaled to the window, so no
// rule below depends on the screen size. All art is procedural canvas drawing.

export const STEP = 1 / 60;

export const WORLD = { width: 3200, height: 2400 };

/** The camera's logical view. */
export const VIEW = { width: 1280, height: 720 };

/** Road centrelines: a regular grid, 400 px apart, roads 96 px wide. */
export const ROADS = {
  vertical: [200, 600, 1000, 1400, 1800, 2200, 2600, 3000],
  horizontal: [200, 600, 1000, 1400, 1800, 2200],
  width: 96,
};

/** The beach band along the south edge: sand, then sea at the bottom. */
export const BEACH = { sandTop: 2240, seaTop: 2330 };

/** The park block (between roads x 600-1000, y 200-600) and the marina basin. */
export const PARK = { x: 648, y: 248, width: 304, height: 304 };
export const MARINA = { x: 2648, y: 248, width: 304, height: 304 };
export const PLAZA = { x: 1448, y: 1048, width: 304, height: 304 };

export const PLAYER = {
  radius: 13,
  walk: 175,
  sprint: 285,
  health: 100,
  punchRange: 34,
  punchDamage: 18,
  punchCooldown: 0.45,
};

/** Arcade car tuning: accel in px/s^2, top speed px/s, turn in rad/s at speed. */
export const CAR_TYPES = {
  sedan: { name: 'Sedan', color: '#4a7fb5', accel: 420, topSpeed: 520, brake: 700, turn: 2.6, length: 64, width: 30, seats: 1 },
  taxi: { name: 'Taksi', color: '#e8b93a', accel: 400, topSpeed: 500, brake: 700, turn: 2.6, length: 64, width: 30, seats: 1 },
  sport: { name: 'Sport', color: '#c94a3a', accel: 620, topSpeed: 720, brake: 800, turn: 3.1, length: 62, width: 30, seats: 1 },
  truck: { name: 'Truk', color: '#7a7f85', accel: 260, topSpeed: 380, brake: 500, turn: 2.0, length: 84, width: 34, seats: 1 },
  police: { name: 'Patroli', color: '#e8e8e8', accel: 540, topSpeed: 640, brake: 800, turn: 3.0, length: 66, width: 30, seats: 1 },
};

export const WANTED = {
  /** Heat thresholds that light each star. */
  thresholds: [8, 25, 45, 65, 85],
  /** Heat added by each crime. */
  heat: { stealParked: 12, carjack: 18, punchPed: 10, killPed: 25, hitCop: 30, shoot: 15, crashCar: 4, ramPolice: 20 },
  /** Heat lost per second: hidden (no police near) vs exposed. */
  decayHidden: 3.0,
  decayExposed: 0.7,
  /** Seconds without a crime before decay starts. */
  graceSeconds: 8,
  /** Police units at each star count (index = stars). */
  policeCars: [0, 0, 1, 2, 3, 4],
  policeFoot: [0, 1, 1, 1, 2, 2],
};

export const POLICE = {
  footSpeed: 235,
  carChaseSpeed: 660,
  ramDamage: 14,
  punchDamage: 8,
  bulletDamage: 12,
  shootRange: 420,
  shootCooldown: 1.1,
  bustRadius: 30,
  bustSeconds: 0.9,
  carBustRadius: 80,
  carBustSeconds: 2.5,
};

export const COMBAT = {
  pistolAmmo: 24,
  bulletSpeed: 900,
  bulletDamage: 34,
  bulletRange: 620,
  shootCooldown: 0.22,
};

export const MISSION_REWARD = { m0: 150, m1: 300, m2: 400, m3: 600, m4: 1000 };

export const PALETTE = {
  ground: '#b5ac97',
  road: '#3d3d44',
  roadLine: '#d8c96a',
  sidewalk: '#cfc7b4',
  sand: '#e8d29a',
  sea: '#2e8b9a',
  seaDeep: '#1f6f8a',
  grass: '#7fae5a',
  grassDark: '#6b9a4a',
  buildingRoof: ['#c96f4a', '#d9b380', '#4a8a8a', '#e8dcc0', '#a85a4a', '#8a6f9e', '#c9a24a'],
  buildingWall: '#e5dcc8',
  tree: '#4e8a3f',
  treeDark: '#3c7031',
  player: '#e85d3d',
  playerDark: '#b73e26',
  money: '#3fae5a',
  text: '#f5f1e6',
  textDark: '#2a2620',
  panel: 'rgba(24, 22, 18, 0.88)',
  star: '#f2c94c',
  marker: '#f2c94c',
  cop: '#2a5fb5',
  copDark: '#1a3f7a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'solmarina.save.v1';
