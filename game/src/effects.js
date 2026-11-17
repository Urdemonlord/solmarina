// Juice, in one place: particles (dust, sparks, smoke), skid marks, and the
// camera trauma that screen shake reads. Nothing here changes the simulation;
// particles are paint, skid marks fade, trauma only moves the camera.

export function createEffects() {
  const effects = {
    particles: [],
    skids: [],
    spawn(kind, x, y, count, speed, life, color, size) {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const power = speed * (0.4 + Math.random() * 0.6);
        effects.particles.push({
          kind,
          x,
          y,
          vx: Math.cos(angle) * power,
          vy: Math.sin(angle) * power,
          life: life * (0.6 + Math.random() * 0.4),
          maxLife: life,
          color,
          size: size * (0.7 + Math.random() * 0.6),
        });
      }
      if (effects.particles.length > 400) effects.particles.splice(0, effects.particles.length - 400);
    },
    dust(x, y) {
      effects.spawn('dust', x, y, 1, 30, 0.5, 'rgba(200, 190, 160, 0.5)', 5);
    },
    sparks(x, y) {
      effects.spawn('spark', x, y, 10, 260, 0.35, '#f2c94c', 3);
    },
    smoke(x, y) {
      effects.spawn('smoke', x, y, 2, 40, 1.2, 'rgba(90, 90, 90, 0.45)', 9);
    },
    addSkid(x, y, angle) {
      effects.skids.push({ x, y, angle, life: 6 });
      if (effects.skids.length > 300) effects.skids.shift();
    },
    step(dt) {
      for (let index = effects.particles.length - 1; index >= 0; index -= 1) {
        const particle = effects.particles[index];
        particle.life -= dt;
        if (particle.life <= 0) {
          effects.particles.splice(index, 1);
          continue;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= Math.max(0, 1 - 3 * dt);
        particle.vy *= Math.max(0, 1 - 3 * dt);
        if (particle.kind === 'smoke') particle.y -= 24 * dt;
      }
      for (let index = effects.skids.length - 1; index >= 0; index -= 1) {
        effects.skids[index].life -= dt;
        if (effects.skids[index].life <= 0) effects.skids.splice(index, 1);
      }
    },
  };
  return effects;
}
