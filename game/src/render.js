// Drawing only: the city, its people and cars, the effects, the light, then
// the HUD. The camera follows the player with trauma shake (game-feel: shake
// is trauma squared, summed sines, decaying in real time, and it only ever
// moves the camera, never the simulation).

import { BEACH, FONT, MARINA, PALETTE, PARK, PLAZA, ROADS, VIEW, WORLD } from './config.js';
import { drawHud } from './hud.js';
import { drawMinimap } from './minimap.js';
import { waypoint } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_STORY = 'story';

const SHADOW = 'rgba(40, 30, 20, 0.28)';

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.arcTo(x + width, y, x + width, y + radius, radius);
  context.lineTo(x + width, y + height - radius);
  context.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  context.lineTo(x + radius, y + height);
  context.arcTo(x, y + height, x, y + height - radius, radius);
  context.lineTo(x, y + radius);
  context.arcTo(x, y, x + radius, y, radius);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  const tracers = [];

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function drawGround(G) {
    const city = G.city;
    context.fillStyle = PALETTE.ground;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Sidewalks: pale strips hugging every road.
    context.fillStyle = PALETTE.sidewalk;
    for (const v of ROADS.vertical) {
      context.fillRect(v - ROADS.width / 2 - 14, 0, ROADS.width + 28, BEACH.sandTop);
    }
    for (const h of ROADS.horizontal) {
      context.fillRect(0, h - ROADS.width / 2 - 14, WORLD.width, ROADS.width + 28);
    }
    // Roads.
    context.fillStyle = PALETTE.road;
    for (const v of ROADS.vertical) {
      context.fillRect(v - ROADS.width / 2, 0, ROADS.width, BEACH.sandTop);
    }
    for (const h of ROADS.horizontal) {
      context.fillRect(0, h - ROADS.width / 2, WORLD.width, ROADS.width);
    }
    // Centre dashes.
    context.fillStyle = PALETTE.roadLine;
    for (const v of ROADS.vertical) {
      for (let y = 60; y < BEACH.sandTop; y += 72) context.fillRect(v - 3, y, 6, 34);
    }
    for (const h of ROADS.horizontal) {
      for (let x = 60; x < WORLD.width; x += 72) context.fillRect(x, h - 3, 34, 6);
    }
    // Beach: sand, then the sea with three wave lines.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, BEACH.sandTop, WORLD.width, BEACH.seaTop - BEACH.sandTop);
    context.fillStyle = PALETTE.sea;
    context.fillRect(0, BEACH.seaTop, WORLD.width, WORLD.height - BEACH.seaTop);
    context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    context.lineWidth = 3;
    for (let row = 0; row < 3; row += 1) {
      context.beginPath();
      for (let x = 0; x <= WORLD.width; x += 40) {
        const y = BEACH.seaTop + 14 + row * 18 + Math.sin((x + G.time * 30 + row * 90) * 0.01) * 4;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    // Park: grass, a pond, paths.
    context.fillStyle = PALETTE.grass;
    context.fillRect(PARK.x, PARK.y, PARK.width, PARK.height);
    context.fillStyle = PALETTE.sea;
    context.beginPath();
    context.ellipse(PARK.x + PARK.width / 2, PARK.y + PARK.height / 2, 52, 36, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.sidewalk;
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(PARK.x, PARK.y + PARK.height / 2);
    context.lineTo(PARK.x + PARK.width, PARK.y + PARK.height / 2);
    context.stroke();
    // Marina basin, docks and boats.
    context.fillStyle = PALETTE.seaDeep;
    context.fillRect(MARINA.x, MARINA.y, MARINA.width, MARINA.height);
    context.fillStyle = '#8a6f4a';
    context.fillRect(MARINA.x, MARINA.y + MARINA.height / 2 - 8, MARINA.width, 16);
    for (let index = 0; index < 3; index += 1) {
      const bx = MARINA.x + 40 + index * 90;
      context.fillStyle = '#f5f1e6';
      roundedRect(context, bx, MARINA.y + 60 + (index % 2) * 120, 56, 20, 8);
      context.fill();
      context.fillStyle = '#c94a3a';
      context.fillRect(bx + 20, MARINA.y + 48 + (index % 2) * 120, 16, 14);
    }
    // Plaza: pale paving and a fountain.
    context.fillStyle = '#d8cfb8';
    context.fillRect(PLAZA.x, PLAZA.y, PLAZA.width, PLAZA.height);
    context.fillStyle = PALETTE.sea;
    context.beginPath();
    context.arc(PLAZA.x + PLAZA.width / 2, PLAZA.y + PLAZA.height / 2, 34, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f5f1e6';
    context.beginPath();
    context.arc(PLAZA.x + PLAZA.width / 2, PLAZA.y + PLAZA.height / 2, 12, 0, Math.PI * 2);
    context.fill();
    void city;
  }

  function drawBuildings(G) {
    for (const b of G.city.buildings) {
      // Soft shadow to the south-east, then wall, roof and windows.
      context.fillStyle = SHADOW;
      context.fillRect(b.x + 8, b.y + 10, b.width, b.height);
      context.fillStyle = PALETTE.buildingWall;
      context.fillRect(b.x, b.y, b.width, b.height);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 5, b.y + 5, b.width - 10, b.height - 10);
      context.fillStyle = 'rgba(255, 255, 255, 0.35)';
      const cols = Math.max(1, Math.floor(b.width / 34));
      const rows = Math.max(1, Math.floor(b.height / 34));
      for (let col = 0; col < cols; col += 1) {
        for (let row = 0; row < rows; row += 1) {
          context.fillRect(b.x + 12 + col * 34, b.y + 12 + row * 34, 12, 9);
        }
      }
    }
  }

  function drawProps(G) {
    for (const tree of G.city.props.trees) {
      context.fillStyle = SHADOW;
      context.beginPath();
      context.ellipse(tree.x + 5, tree.y + 6, tree.r, tree.r * 0.7, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.treeDark;
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.tree;
      context.beginPath();
      context.arc(tree.x - 3, tree.y - 3, tree.r * 0.65, 0, Math.PI * 2);
      context.fill();
    }
    for (const lamp of G.city.props.lamps) {
      context.fillStyle = '#5a5348';
      context.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.arc(lamp.x, lamp.y, 4, 0, Math.PI * 2);
      context.fill();
    }
    for (const hydrant of G.city.props.hydrants) {
      context.fillStyle = '#c94a3a';
      context.fillRect(hydrant.x - 4, hydrant.y - 5, 8, 10);
    }
    for (const bench of G.city.props.benches) {
      context.fillStyle = '#8a6f4a';
      context.fillRect(bench.x - 12, bench.y - 4, 24, 8);
    }
  }

  function drawSkids(G) {
    context.strokeStyle = 'rgba(30, 30, 30, 0.35)';
    context.lineWidth = 5;
    for (const skid of G.effects.skids) {
      context.beginPath();
      context.moveTo(skid.x, skid.y);
      context.lineTo(skid.x + Math.cos(skid.angle) * 18, skid.y + Math.sin(skid.angle) * 18);
      context.stroke();
    }
  }

  function drawMarker(G) {
    const point = waypoint(G);
    if (!point) return;
    const pulse = 1 + Math.sin(G.time * 5) * 0.12;
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(point.x, point.y, 34 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.moveTo(point.x, point.y - 52 * pulse);
    context.lineTo(point.x - 12, point.y - 30);
    context.lineTo(point.x + 12, point.y - 30);
    context.closePath();
    context.fill();
    // A light pillar so the marker reads from far away.
    context.fillStyle = 'rgba(242, 201, 76, 0.12)';
    context.fillRect(point.x - 12, point.y - 260, 24, 260);
  }

  function drawPickups(G) {
    for (const pickup of G.combat.pickups) {
      if (pickup.taken) continue;
      const bob = Math.sin(G.time * 4 + pickup.x) * 3;
      context.fillStyle = '#22222a';
      context.fillRect(pickup.x - 14, pickup.y - 8 + bob, 28, 16);
      context.fillStyle = '#f2c94c';
      context.fillRect(pickup.x - 10, pickup.y - 4 + bob, 20, 3);
      context.fillStyle = '#f5f1e6';
      text('PISTOL', pickup.x, pickup.y + 26, 11, '#f5f1e6', 'center');
    }
  }

  function drawPed(G, ped) {
    if (ped.down) {
      context.fillStyle = ped.cop ? PALETTE.copDark : ped.color;
      context.beginPath();
      context.ellipse(ped.x, ped.y, 16, 9, ped.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = SHADOW;
    context.beginPath();
    context.ellipse(ped.x + 3, ped.y + 4, 12, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.cop ? PALETTE.cop : ped.color;
    context.beginPath();
    context.arc(ped.x, ped.y, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
    context.fill();
    if (ped.cop) {
      context.fillStyle = PALETTE.copDark;
      context.beginPath();
      context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCar(G, car) {
    const def = car.def;
    const halfL = def.length / 2;
    const halfW = def.width / 2;
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = SHADOW;
    roundedRect(context, -halfL + 4, -halfW + 5, def.length, def.width, 8);
    context.fill();
    // Wheels.
    context.fillStyle = '#1a1a1a';
    const wheelY = halfW - 2;
    context.fillRect(-halfL + 8, -wheelY - 4, 14, 7);
    context.fillRect(halfL - 22, -wheelY - 4, 14, 7);
    context.fillRect(-halfL + 8, wheelY - 3, 14, 7);
    context.fillRect(halfL - 22, wheelY - 3, 14, 7);
    // Body.
    context.fillStyle = car.destroyed ? '#3a3a3a' : car.color;
    roundedRect(context, -halfL, -halfW, def.length, def.width, 8);
    context.fill();
    // Windshield and roof.
    context.fillStyle = 'rgba(20, 30, 44, 0.85)';
    context.fillRect(halfL - 26, -halfW + 5, 10, def.width - 10);
    context.fillRect(-halfL + 12, -halfW + 5, 8, def.width - 10);
    context.fillStyle = 'rgba(255, 255, 255, 0.22)';
    context.fillRect(-halfL + 24, -halfW + 4, halfL - 6, def.width - 8);
    // Headlights.
    context.fillStyle = '#fff6c9';
    context.fillRect(halfL - 3, -halfW + 4, 3, 6);
    context.fillRect(halfL - 3, halfW - 10, 3, 6);
    if (car.type === 'taxi') {
      context.fillStyle = '#22222a';
      context.fillRect(-8, -halfW - 4, 16, 6);
      context.fillStyle = '#f2c94c';
      text('TAXI', 0, -halfW - 6, 8, '#f2c94c', 'center');
    }
    if (car.type === 'police') {
      const flash = Math.floor(G.time * 6) % 2 === 0;
      context.fillStyle = flash ? '#e53a3a' : '#3a6fe5';
      context.fillRect(-6, -halfW - 3, 12, 5);
      context.fillStyle = '#22222a';
      text('POLISI', 0, 4, 10, '#22222a', 'center');
    }
    if (car.damage > 45) {
      context.fillStyle = 'rgba(30, 30, 30, 0.5)';
      context.beginPath();
      context.arc(-halfL + 14, 0, 8, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawPlayer(G) {
    const player = G.player;
    if (!player.onFoot) return;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) return;
    context.fillStyle = SHADOW;
    context.beginPath();
    context.ellipse(player.x + 3, player.y + 4, 13, 10, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerDark;
    context.beginPath();
    context.arc(player.x, player.y, 12, Math.PI * 0.15, Math.PI * 0.85);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(player.x + Math.cos(player.angle) * 3, player.y + Math.sin(player.angle) * 3, 5.5, 0, Math.PI * 2);
    context.fill();
    // Facing tick, and a punch arc while swinging.
    context.strokeStyle = PALETTE.playerDark;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.angle) * 12, player.y + Math.sin(player.angle) * 12);
    context.lineTo(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
    context.stroke();
    if (player.punchAnim > 0) {
      context.strokeStyle = 'rgba(232, 93, 61, 0.8)';
      context.lineWidth = 5;
      context.beginPath();
      context.arc(player.x, player.y, 26, player.angle - 0.7, player.angle + 0.7);
      context.stroke();
    }
  }

  function drawBullets(G) {
    context.strokeStyle = '#ffe9a8';
    context.lineWidth = 3;
    for (const bullet of G.combat.bullets) {
      context.beginPath();
      context.moveTo(bullet.x - Math.cos(bullet.angle) * 14, bullet.y - Math.sin(bullet.angle) * 14);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
    }
    // Cop-shot tracers, fed from this frame's events, fading fast.
    for (const event of G.events) {
      if (event.kind === 'copShot') tracers.push({ x: event.x, y: event.y, tx: event.tx, ty: event.ty, life: 0.15 });
    }
    for (let index = tracers.length - 1; index >= 0; index -= 1) {
      const tracer = tracers[index];
      tracer.life -= 1 / 60;
      if (tracer.life <= 0) {
        tracers.splice(index, 1);
        continue;
      }
      context.strokeStyle = `rgba(255, 120, 90, ${tracer.life / 0.15})`;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(tracer.x, tracer.y);
      context.lineTo(tracer.tx, tracer.ty);
      context.stroke();
    }
  }

  function drawParticles(G) {
    for (const particle of G.effects.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      context.globalAlpha = alpha;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawLighting(G) {
    // Warm afternoon sun, then a soft vignette so the centre reads first.
    context.fillStyle = 'rgba(255, 196, 120, 0.05)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const gradient = context.createRadialGradient(
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.45,
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.85,
    );
    gradient.addColorStop(0, 'rgba(20, 16, 10, 0)');
    gradient.addColorStop(1, 'rgba(20, 16, 10, 0.22)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const lineHeight = 32;
    const height = 150 + lines.length * lineHeight + 64;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    roundedRect(context, x, y, width, height, 12);
    context.fill();
    text(title, VIEW.width / 2, y + 66, 44, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + 118 + index * lineHeight, 20, '#cfc7b4', 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 22, PALETTE.marker, 'center');
  }

  function draw(G, screen) {
    const camera = G.camera;
    const trauma = camera.trauma * camera.trauma;
    const t = camera.t;
    const shakeX = trauma * 11 * (Math.sin(t * 1.7) + Math.sin(t * 2.9) * 0.5);
    const shakeY = trauma * 8 * (Math.sin(t * 2.3) + Math.sin(t * 3.1) * 0.5);
    const camX = Math.max(VIEW.width / 2, Math.min(WORLD.width - VIEW.width / 2, camera.x)) + shakeX;
    const camY = Math.max(VIEW.height / 2, Math.min(WORLD.height - VIEW.height / 2, camera.y)) + shakeY;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#141210';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.save();
    context.translate(VIEW.width / 2 - camX, VIEW.height / 2 - camY);

    drawGround(G);
    drawBuildings(G);
    drawProps(G);
    drawSkids(G);
    drawMarker(G);
    drawPickups(G);
    for (const ped of G.peds.list) drawPed(G, ped);
    for (const car of G.vehicles.list) drawCar(G, car);
    drawPlayer(G);
    drawBullets(G);
    drawParticles(G);
    context.restore();

    // Screen-space light, then the HUD and the screens.
    drawLighting(G);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawHud(G, context, view, text);
      drawMinimap(G, context, text);
    }
    if (screen === SCREEN_TITLE) {
      const lines = [
        'Raka, kurir Solmarina, terseret ke dunia bawah kota.',
        'Curi mobil, kabur dari polisi, kerjakan misi Marlo.',
        'WASD jalan / nyetir  •  Shift lari  •  E masuk mobil  •  F pukul  •  M bisu',
        G.save && G.save.exists ? 'Ada save tersimpan: tekan C untuk lanjut.' : '',
      ];
      drawPanel('SOLMARINA', lines, G.save && G.save.exists ? 'Enter mulai baru  •  C lanjutkan  •  klik untuk mulai' : 'Tekan Enter atau klik untuk mulai');
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('Jeda', ['Kota menunggu. Misi tetap di tempatnya.'], 'Tekan P untuk lanjut');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('TERTANGKAP', [`Denda $${G.bustedFine || 100} — polisi menyita sebagian uangmu.`, 'Raka dibebaskan di kantor polisi pelabuhan.'], 'Tekan Enter untuk lanjut');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('RAKA TUMBANG', ['Ambulans membawamu ke rumah sakit kota.', 'Tagihan rumah sakit dipotong dari uangmu.'], 'Tekan Enter untuk bangkit');
    } else if (screen === SCREEN_STORY) {
      drawPanel('SOLMARINA MILIKMU', ['Lima misi selesai. Marlo angkat topi.', 'Kota ini sekarang ladangmu. Main bebas, kapan pun.'], 'Tekan Enter untuk main bebas');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
