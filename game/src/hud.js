// Solmarina 3D: DOM HUD + 2D minimap + menu screens (browser only).
// The DOM lives in index.html; this wires it and draws the minimap.
import { WORLD } from './config.js';
import { roadLines } from './city.js';

export function createHud(buildings) {
  const $ = (id) => document.getElementById(id);
  const el = {
    money: $('hud-money'), health: $('hud-health-fill'), healthText: $('hud-health-text'),
    stars: $('hud-stars'), clock: $('hud-clock'), speed: $('hud-speed'),
    objective: $('hud-objective'), prompt: $('hud-prompt'),
    minimap: $('hud-minimap'), crosshair: $('hud-crosshair'),
    screens: { title: $('screen-title'), paused: $('screen-paused'), busted: $('screen-busted'), wasted: $('screen-wasted') },
    titleSave: $('title-save'), titleMoney: $('title-money'),
    flash: $('hud-flash'),
  };
  const ctx = el.minimap.getContext('2d');
  const MW = el.minimap.width, MH = el.minimap.height;
  const lines = roadLines();
  let flashUntil = 0;

  function mapX(x) { return ((x + 320) / 660) * MW; }
  function mapZ(z) { return ((z + 320) / 720) * MH; }

  function drawMinimap(G) {
    ctx.fillStyle = '#23272e';
    ctx.fillRect(0, 0, MW, MH);
    // beach + water (south)
    ctx.fillStyle = '#2f7fb8';
    ctx.fillRect(0, mapZ(WORLD.waterZ), MW, MH - mapZ(WORLD.waterZ));
    ctx.fillStyle = '#e8d5a0';
    ctx.fillRect(0, mapZ(WORLD.beachZ), MW, mapZ(WORLD.waterZ) - mapZ(WORLD.beachZ));
    // roads
    ctx.strokeStyle = '#5d636e';
    ctx.lineWidth = 3;
    for (const l of lines) {
      ctx.beginPath(); ctx.moveTo(mapX(l), 0); ctx.lineTo(mapX(l), MH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, mapZ(l)); ctx.lineTo(MW, mapZ(l)); ctx.stroke();
    }
    // buildings
    ctx.fillStyle = '#9aa0ab';
    for (const b of buildings) {
      ctx.fillRect(mapX(b.x - b.w / 2), mapZ(b.z - b.d / 2), Math.max(1.5, (b.w / 660) * MW), Math.max(1.5, (b.d / 720) * MH));
    }
    // mission blip
    const step = G.missions.currentStep();
    if (step && step.target) {
      const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(mapX(step.target.x), mapZ(step.target.z), pulse + 2, 0, Math.PI * 2); ctx.fill();
    }
    // traffic
    ctx.fillStyle = '#c8ccd4';
    for (const c of G.vehicles.list) {
      if (c.driver === 'traffic') ctx.fillRect(mapX(c.x) - 1, mapZ(c.z) - 1, 2, 2);
    }
    // police
    for (const u of G.police.units) {
      const p = u.kind === 'car' ? u.car : u.ped;
      ctx.fillStyle = u.kind === 'car' ? '#ff4040' : '#4080ff';
      ctx.beginPath(); ctx.arc(mapX(p.x), mapZ(p.z), 3, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    ctx.save();
    ctx.translate(mapX(G.player.x), mapZ(G.player.z));
    ctx.rotate(-G.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  return {
    flash() { flashUntil = performance.now() + 180; },
    setObjective(text) { el.objective.textContent = text; },
    setPrompt(text) { el.prompt.textContent = text || ''; },
    showScreen(name, saveInfo) {
      for (const [key, node] of Object.entries(el.screens)) {
        node.style.display = key === name ? 'flex' : 'none';
      }
      if (name === 'title' && saveInfo) {
        el.titleSave.style.display = 'block';
        el.titleMoney.textContent = 'Uang $' + saveInfo.money + ' - ' + saveInfo.done.length + ' misi selesai';
      } else if (name === 'title') {
        el.titleSave.style.display = 'none';
      }
    },
    update(G, dt) {
      el.money.textContent = '$' + G.player.money;
      const hp = Math.max(0, Math.round(G.player.health));
      el.health.style.width = hp + '%';
      el.healthText.textContent = 'NYAWA ' + hp;
      el.health.style.background = hp > 50 ? '#58c96b' : hp > 25 ? '#e8c832' : '#e04848';
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < G.wanted.stars ? '★' : '☆';
      el.stars.textContent = stars;
      el.stars.style.color = G.wanted.stars > 0 ? '#ffd23e' : '#8a8f98';
      const clock = Math.max(0, G.clock);
      const h = Math.floor(clock / 60) + 8;
      const m = Math.floor(clock % 60);
      el.clock.textContent = String(h % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      if (G.player.car) {
        const car = G.player.car;
        el.speed.style.display = 'block';
        el.speed.innerHTML = Math.round(Math.abs(car.speed) * 3.6) + ' km/jam<br><span>Mobil: ' + car.name + ' - Rusak ' + Math.round(car.damage) + '%</span>';
      } else {
        el.speed.style.display = 'none';
      }
      el.crosshair.style.display = (G.player.hasPistol && G.player.onFoot) ? 'block' : 'none';
      el.flash.style.opacity = performance.now() < flashUntil ? '0.45' : '0';
      drawMinimap(G);
    },
  };
}
