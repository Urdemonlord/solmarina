// Solmarina 3D: save / load. Pure logic over an injected storage object
// (localStorage in the browser, a plain object in the unit tests).
export const SAVE_KEY = 'solmarina.save.3d.v1';

export function makeSave(state) {
  return {
    version: 1,
    money: state.money,
    done: [...state.done],
    sideDone: [...(state.sideDone || [])],
    health: state.health,
    player: { x: state.playerX, z: state.playerZ, heading: state.heading },
    hasPistol: !!state.hasPistol,
    // polish 7: weapon loadout (non-pistol), daily event completion.
    // Old saves lack these fields; readers must default-guard.
    weapons: state.weapons || null,
    pistolReserve: state.pistolReserve || 0,
    dailyDone: state.dailyDone || null,
    savedAt: Date.now(),
  };
}

export function writeSave(storage, state) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(makeSave(state)));
    return true;
  } catch (e) {
    return false;
  }
}

export function readSave(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return null;
    return s;
  } catch (e) {
    return null;
  }
}

export function clearSave(storage) {
  try { storage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
