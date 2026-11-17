// Solmarina 3D: feedback layer (game-feel). One feedback(tier, pos) call
// fires the whole bundle for an event: particles + shake + sound + flash.
// Tiers follow the game-feel skill: small / medium / large.
import { createParticles, createSkids } from './render.js';

export function createEffects(scene, audio, cameraRig, hud) {
  const particles = createParticles(scene);
  const skids = createSkids(scene);
  let hitStopUntil = 0;
  let hitStopScale = 1;
  let now = 0;

  return {
    particles, skids,
    // timeScale for the main loop: 0.05 during a hit-stop, else 1.
    timeScale(t) {
      now = t;
      return now < hitStopUntil ? hitStopScale : 1;
    },
    feedback(tier, x, y, z) {
      if (tier === 'small') {
        particles.burst(x, y, z, 4, [0.9, 0.9, 0.9], 2, 1.5);
      } else if (tier === 'medium') {
        particles.burst(x, y, z, 10, [1, 0.85, 0.4], 4, 2.5);
        cameraRig.addTrauma(0.35);
        audio.crash(4);
      } else {
        particles.burst(x, y, z, 26, [1, 0.6, 0.2], 7, 4);
        particles.burst(x, y, z, 12, [0.25, 0.25, 0.25], 3, 3);
        cameraRig.addTrauma(0.8);
        hitStopUntil = now + 0.09;
        hitStopScale = 0.05;
        audio.crash(14);
        if (hud) hud.flash();
      }
    },
    burst(x, y, z, n, color, speed, up) {
      particles.burst(x, y, z, n, color, speed, up);
    },
    smoke(x, y, z) { particles.smoke(x, y, z); },
    update(dt) {
      particles.update(dt);
      skids.update(dt);
    },
  };
}
