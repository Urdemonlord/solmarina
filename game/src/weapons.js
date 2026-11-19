// Solmarina 3D: weapons + loadout (pure logic; no DOM, no THREE).
// The pistol stays the starter gun (park pickup, existing code owns it);
// the SMG and shotgun are free pickups on the map, the rifle is sold
// only at the gun shop. Ammo is per weapon: a magazine plus a reserve.
// Fire rates are in seconds between shots; auto weapons keep firing
// while the trigger is held, semi weapons fire once per click.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Pistol', damage: 34, rate: 0.35, magSize: 12,
    range: 40, auto: false, spread: 0, pellets: 1, kick: 0.25,
    tracer: 0xffd27f, price: 0,
  },
  smg: {
    id: 'smg', name: 'SMG', damage: 18, rate: 0.09, magSize: 30,
    range: 35, auto: true, spread: 0.05, pellets: 1, kick: 0.12,
    tracer: 0x7fe3f0, price: 0,
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', damage: 12, rate: 0.9, magSize: 6,
    range: 22, auto: false, spread: 0.16, pellets: 6, kick: 0.55,
    tracer: 0xffb36b, price: 0,
  },
  rifle: {
    id: 'rifle', name: 'Rifle', damage: 60, rate: 0.8, magSize: 8,
    range: 60, auto: false, spread: 0.01, pellets: 1, kick: 0.4,
    tracer: 0xffe9a0, price: 800,
  },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];
export const AMMO_PRICE = 60; // one full magazine for the current weapon
export const RELOAD_TIME = 1.2; // seconds

// A loadout tracks the non-pistol weapons. The pistol's own mag/reserve
// live on the player (hasPistol/ammo) as before, so the old code paths
// keep working; this loadout mirrors the pistol as 'pistol' for the
// HUD and the switcher.
export function createLoadout() {
  return {
    current: 'pistol',
    owned: {}, // id -> { mag, reserve }
    cooldown: 0, // seconds until the next shot may fire
    reloading: 0, // >0 while a reload is running
    reloadFor: null,
  };
}

export function owns(loadout, id) {
  if (id === 'pistol') return true; // the pistol slot always exists
  return !!loadout.owned[id];
}

export function giveWeapon(loadout, id, mags = 1) {
  const def = WEAPONS[id];
  if (!def) return false;
  if (id === 'pistol') return false; // pistol comes from the park pickup
  if (!loadout.owned[id]) {
    loadout.owned[id] = { mag: def.magSize, reserve: def.magSize * (mags - 1) };
  } else {
    loadout.owned[id].reserve += def.magSize * mags;
  }
  return true;
}

export function giveAmmo(loadout, id, mags = 1) {
  const def = WEAPONS[id];
  if (!def || !owns(loadout, id)) return false;
  if (id === 'pistol') return false; // pistol ammo is player.ammo
  loadout.owned[id].reserve += def.magSize * mags;
  return true;
}

export function switchTo(loadout, id) {
  if (!owns(loadout, id)) return false;
  if (loadout.current === id) return false;
  loadout.current = id;
  loadout.cooldown = 0;
  loadout.reloading = 0;
  loadout.reloadFor = null;
  return true;
}

export function cycleWeapon(loadout) {
  const owned = WEAPON_ORDER.filter((id) => owns(loadout, id));
  if (owned.length < 2) return null;
  const i = owned.indexOf(loadout.current);
  const next = owned[(i + 1) % owned.length];
  loadout.current = next;
  loadout.cooldown = 0;
  loadout.reloading = 0;
  loadout.reloadFor = null;
  return next;
}

// Ammo in the current magazine. The pistol reads player.ammo instead.
export function magAmmo(loadout, id, pistolAmmo) {
  if (id === 'pistol') return pistolAmmo;
  return loadout.owned[id] ? loadout.owned[id].mag : 0;
}

export function reserveAmmo(loadout, id, pistolReserve) {
  if (id === 'pistol') return pistolReserve;
  return loadout.owned[id] ? loadout.owned[id].reserve : 0;
}

// Try to fire once. now is a timestamp in seconds (performance.now()/1000).
// Returns { fired, empty, weapon } — empty when the mag is dry.
export function tryFire(loadout, id, now, pistolAmmo) {
  const def = WEAPONS[id];
  if (!def || loadout.reloading > 0 || loadout.cooldown > now) {
    return { fired: false, empty: false, weapon: def };
  }
  const mag = magAmmo(loadout, id, pistolAmmo);
  if (mag <= 0) return { fired: false, empty: true, weapon: def };
  loadout.cooldown = now + def.rate;
  return { fired: true, empty: false, weapon: def };
}

// Consume one round from the magazine after a shot connected (or not).
// Returns the new mag count.
export function spendRound(loadout, id, pistolAmmo) {
  if (id === 'pistol') return pistolAmmo - 1;
  const slot = loadout.owned[id];
  if (!slot) return 0;
  slot.mag = Math.max(0, slot.mag - 1);
  return slot.mag;
}

export function startReload(loadout, id, pistolAmmo, pistolReserve) {
  const def = WEAPONS[id];
  if (!def || loadout.reloading > 0) return false;
  const mag = magAmmo(loadout, id, pistolAmmo);
  const reserve = reserveAmmo(loadout, id, pistolReserve);
  if (mag >= def.magSize || reserve <= 0) return false;
  loadout.reloading = RELOAD_TIME;
  loadout.reloadFor = id;
  return true;
}

// Advance the reload timer. Returns { done, id, mag, reserve } when a
// reload finishes (the caller writes the pistol numbers back), else null.
export function updateReload(loadout, dt, pistolAmmo, pistolReserve) {
  if (loadout.reloading <= 0) return null;
  loadout.reloading -= dt;
  if (loadout.reloading > 0) return null;
  const id = loadout.reloadFor;
  const def = WEAPONS[id];
  loadout.reloading = 0;
  loadout.reloadFor = null;
  const mag = magAmmo(loadout, id, pistolAmmo);
  const reserve = reserveAmmo(loadout, id, pistolReserve);
  const need = def.magSize - mag;
  const take = Math.min(need, reserve);
  if (id === 'pistol') {
    return { done: true, id, mag: mag + take, reserve: reserve - take };
  }
  const slot = loadout.owned[id];
  slot.mag += take;
  slot.reserve -= take;
  return { done: true, id, mag: slot.mag, reserve: slot.reserve };
}

// Serialise the non-pistol loadout for the save file.
export function saveLoadout(loadout) {
  const owned = {};
  for (const [id, slot] of Object.entries(loadout.owned)) {
    owned[id] = { mag: slot.mag, reserve: slot.reserve };
  }
  return { current: loadout.current, owned };
}

export function loadLoadout(saved) {
  const l = createLoadout();
  if (!saved) return l;
  for (const [id, slot] of Object.entries(saved.owned || {})) {
    if (WEAPONS[id] && id !== 'pistol') l.owned[id] = { mag: slot.mag, reserve: slot.reserve };
  }
  if (saved.current && WEAPONS[saved.current] && (saved.current === 'pistol' || l.owned[saved.current])) {
    l.current = saved.current;
  }
  return l;
}
