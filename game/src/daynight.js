// Solmarina 3D: day/night cycle (pure, no DOM, no THREE).
// The game clock runs 08:00 -> 24h; this maps an hour of day to the
// lighting bucket the renderer applies: sky/fog colours, sun colour,
// height and intensity, hemisphere light, and whether lamps and windows
// are lit. Buckets blend linearly at their edges so dusk and dawn read
// as warm sunsets, not hard cuts.

export function hourFromClock(clockMinutes) {
  return ((8 + clockMinutes / 60) % 24 + 24) % 24;
}

// One lighting keyframe. sky/fog/sun are [r, g, b] 0..1.
const KEYS = [
  // hour, sky, fog, sun colour, sun intensity, sun elevation (0..1), hemi
  { h: 0, sky: [0.05, 0.07, 0.14], fog: [0.07, 0.09, 0.16], sun: [0.65, 0.75, 1.0], sunI: 0.4, elev: 0.35, hemi: 0.32 },
  { h: 5, sky: [0.05, 0.07, 0.14], fog: [0.07, 0.09, 0.16], sun: [0.65, 0.75, 1.0], sunI: 0.4, elev: 0.35, hemi: 0.32 },
  { h: 6.5, sky: [0.98, 0.62, 0.45], fog: [0.98, 0.72, 0.55], sun: [1.0, 0.55, 0.25], sunI: 1.1, elev: 0.12, hemi: 0.55 },
  { h: 8, sky: [0.53, 0.71, 0.84], fog: [0.75, 0.85, 0.91], sun: [1.0, 0.95, 0.85], sunI: 1.6, elev: 0.55, hemi: 1.4 },
  { h: 16, sky: [0.53, 0.71, 0.84], fog: [0.75, 0.85, 0.91], sun: [1.0, 0.95, 0.85], sunI: 1.6, elev: 0.55, hemi: 1.4 },
  { h: 17.5, sky: [1.0, 0.62, 0.35], fog: [1.0, 0.72, 0.45], sun: [1.0, 0.5, 0.2], sunI: 1.35, elev: 0.14, hemi: 0.6 },
  { h: 18.75, sky: [0.85, 0.42, 0.38], fog: [0.9, 0.5, 0.42], sun: [1.0, 0.42, 0.18], sunI: 0.9, elev: 0.07, hemi: 0.45 },
  { h: 19.5, sky: [0.07, 0.09, 0.18], fog: [0.09, 0.11, 0.2], sun: [0.65, 0.75, 1.0], sunI: 0.4, elev: 0.4, hemi: 0.38 },
  { h: 24, sky: [0.05, 0.07, 0.14], fog: [0.07, 0.09, 0.16], sun: [0.65, 0.75, 1.0], sunI: 0.4, elev: 0.35, hemi: 0.32 },
];

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function timeOfDay(hour) {
  const h = ((hour % 24) + 24) % 24;
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (h >= KEYS[i].h && h <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const span = (b.h - a.h) || 1;
  const t = Math.max(0, Math.min(1, (h - a.h) / span));
  const night = h >= 19.5 || h < 5.5;
  const golden = (h >= 16.75 && h < 19.25) || (h >= 5.75 && h < 7.5);
  return {
    hour: h,
    night,
    golden,
    lampsOn: night || h >= 18.25,
    sky: lerp3(a.sky, b.sky, t),
    fog: lerp3(a.fog, b.fog, t),
    sunColor: lerp3(a.sun, b.sun, t),
    sunIntensity: a.sunI + (b.sunI - a.sunI) * t,
    sunElevation: a.elev + (b.elev - a.elev) * t,
    hemiIntensity: a.hemi + (b.hemi - a.hemi) * t,
  };
}
