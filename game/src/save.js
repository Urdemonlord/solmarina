// Saving to localStorage: money, missions done, position, health and the
// clock. Everything is guarded, so a browser without storage (or the unit
// tests, which have no window) simply gets no save.

import { SAVE_KEY } from './config.js';

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadSave() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveGame(G) {
  const store = storage();
  if (!store) return false;
  try {
    const data = {
      money: Math.floor(G.player.money),
      done: G.missions.done.slice(),
      x: Math.round(G.player.x),
      y: Math.round(G.player.y),
      health: Math.round(G.player.health),
      clock: Math.round(G.clock),
      storyComplete: !!G.storyComplete,
      savedAt: Date.now(),
    };
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: the save is already gone for practical purposes.
  }
}
