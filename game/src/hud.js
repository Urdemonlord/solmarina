// Solmarina 3D: DOM HUD + 2D minimap + menu screens (browser only).
// The DOM lives in index.html; this wires it and draws the minimap and
// the full map screen (Tab) with its phone/job panel.
import { WORLD, CONTACTS, DISTRICTS, STALLS } from './config.js';
import { roadLines, districtAt, routePoints } from './city.js';

export function createHud(buildings) {
  const $ = (id) => document.getElementById(id);
  const el = {
    money: $('hud-money'), health: $('hud-health-fill'), healthText: $('hud-health-text'),
    stars: $('hud-stars'), clock: $('hud-clock'), speed: $('hud-speed'),
    objective: $('hud-objective'), prompt: $('hud-prompt'),
    minimap: $('hud-minimap'), crosshair: $('hud-crosshair'),
    weapon: $('hud-weapon'), sight: $('hud-sight'),
    heli: $('hud-heli'),
    minimapLabel: $('hud-minimap-label'),
    mapScreen: $('screen-map'), mapCanvas: $('map-canvas'),
    phoneJob: $('phone-job'), phoneStats: $('phone-stats'),
    screens: { title: $('screen-title'), paused: $('screen-paused'), busted: $('screen-busted'), wasted: $('screen-wasted') },
    titleSave: $('title-save'), titleMoney: $('title-money'),
    titleContinue: $('title-continue'),
    flash: $('hud-flash'),
  };
  const ctx = el.minimap.getContext('2d');
  const MW = el.minimap.width, MH = el.minimap.height;
  const mapCtx = el.mapCanvas ? el.mapCanvas.getContext('2d') : null;
  const MAPW = el.mapCanvas ? el.mapCanvas.width : 0;
  const MAPH = el.mapCanvas ? el.mapCanvas.height : 0;
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
    // helicopter
    if (G.heli && G.heli.active) {
      ctx.fillStyle = '#ff9040';
      ctx.beginPath(); ctx.arc(mapX(G.heli.x), mapZ(G.heli.z), 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff9040';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mapX(G.heli.x), mapZ(G.heli.z), 7, 0, Math.PI * 2); ctx.stroke();
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

  // Full map screen (Tab): the whole city, named districts, the mission
  // route, player/mission/police/heli markers, plus the phone panel.
  function drawMap(G) {
    if (!mapCtx) return;
    const mx = (x) => ((x + 320) / 660) * MAPW;
    const mz = (z) => ((z + 320) / 720) * MAPH;
    mapCtx.fillStyle = '#e8dcc0';
    mapCtx.fillRect(0, 0, MAPW, MAPH);
    // water + beach (south)
    mapCtx.fillStyle = '#2f7fb8';
    mapCtx.fillRect(0, mz(WORLD.waterZ), MAPW, MAPH - mz(WORLD.waterZ));
    mapCtx.fillStyle = '#e8d5a0';
    mapCtx.fillRect(0, mz(WORLD.beachZ), MAPW, mz(WORLD.waterZ) - mz(WORLD.beachZ));
    // districts (tinted + labelled)
    const tints = ['rgba(224,120,86,0.25)', 'rgba(95,158,143,0.25)', 'rgba(224,168,60,0.25)', 'rgba(138,155,176,0.25)', 'rgba(88,160,92,0.25)', 'rgba(201,123,132,0.25)', 'rgba(93,125,217,0.25)', 'rgba(47,127,184,0.25)'];
    mapCtx.font = 'bold 15px Arial, sans-serif';
    mapCtx.textAlign = 'center';
    DISTRICTS.forEach((d, i) => {
      mapCtx.fillStyle = tints[i % tints.length];
      mapCtx.fillRect(mx(d.x - d.w / 2), mz(d.z - d.h / 2), (d.w / 660) * MAPW, (d.h / 720) * MAPH);
      mapCtx.fillStyle = '#22242a';
      mapCtx.fillText(d.name.toUpperCase(), mx(d.x), mz(d.z) + 5);
    });
    // roads
    mapCtx.strokeStyle = '#5d636e';
    mapCtx.lineWidth = 4;
    for (const l of lines) {
      mapCtx.beginPath(); mapCtx.moveTo(mx(l), 0); mapCtx.lineTo(mx(l), MAPH); mapCtx.stroke();
      mapCtx.beginPath(); mapCtx.moveTo(0, mz(l)); mapCtx.lineTo(MAPW, mz(l)); mapCtx.stroke();
    }
    // buildings
    mapCtx.fillStyle = '#9aa0ab';
    for (const b of buildings) {
      mapCtx.fillRect(mx(b.x - b.w / 2), mz(b.z - b.d / 2), Math.max(2, (b.w / 660) * MAPW), Math.max(2, (b.d / 720) * MAPH));
    }
    // mission route polyline (player -> target along the road grid)
    const step = G.missions.currentStep();
    const target = step && step.target ? step.target : null;
    if (target) {
      const pts = routePoints({ x: G.player.x, z: G.player.z }, target);
      mapCtx.strokeStyle = '#e04848';
      mapCtx.lineWidth = 4;
      mapCtx.setLineDash([10, 7]);
      mapCtx.beginPath();
      pts.forEach((p, i) => { if (i === 0) mapCtx.moveTo(mx(p.x), mz(p.z)); else mapCtx.lineTo(mx(p.x), mz(p.z)); });
      mapCtx.stroke();
      mapCtx.setLineDash([]);
      // mission marker
      mapCtx.fillStyle = '#ffd23e';
      mapCtx.strokeStyle = '#22242a';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(mx(target.x), mz(target.z), 10, 0, Math.PI * 2); mapCtx.fill(); mapCtx.stroke();
      mapCtx.fillStyle = '#22242a';
      mapCtx.font = 'bold 13px Arial, sans-serif';
      mapCtx.fillText('!', mx(target.x), mz(target.z) + 5);
    }
    // market stalls
    mapCtx.fillStyle = '#e04848';
    for (const s of STALLS) mapCtx.fillRect(mx(s.x) - 4, mz(s.z) - 4, 8, 8);
    // police + heli
    for (const u of G.police.units) {
      const p = u.kind === 'car' ? u.car : u.ped;
      mapCtx.fillStyle = u.kind === 'car' ? '#ff2020' : '#2040ff';
      mapCtx.beginPath(); mapCtx.arc(mx(p.x), mz(p.z), 5, 0, Math.PI * 2); mapCtx.fill();
    }
    if (G.heli && G.heli.active) {
      mapCtx.fillStyle = '#ff9040';
      mapCtx.beginPath(); mapCtx.arc(mx(G.heli.x), mz(G.heli.z), 7, 0, Math.PI * 2); mapCtx.fill();
    }
    // player arrow
    mapCtx.save();
    mapCtx.translate(mx(G.player.x), mz(G.player.z));
    mapCtx.rotate(-G.player.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#22242a';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(0, -12); mapCtx.lineTo(9, 10); mapCtx.lineTo(0, 5); mapCtx.lineTo(-9, 10);
    mapCtx.closePath(); mapCtx.fill(); mapCtx.stroke();
    mapCtx.restore();
  }

  function fillPhone(G) {
    if (!el.phoneJob) return;
    const step = G.missions.currentStep();
    const active = G.missions.active;
    const next = !active && G.missions.done ? G.missions.done.length : 0;
    let jobHtml;
    if (active) {
      const t = Math.max(0, Math.ceil(active.timeLeft));
      jobHtml = '<div class="phone-job-title">' + active.def.title + ' &mdash; $' + active.def.reward + '</div>'
        + '<div class="phone-job-desc">' + (step ? step.label : '') + '</div>'
        + '<div class="phone-job-time">Sisa waktu ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + '</div>';
    } else if (next < 5) {
      jobHtml = '<div class="phone-job-title">Belum ada misi aktif</div>'
        + '<div class="phone-job-desc">Tekan Enter untuk mulai misi berikutnya.</div>';
    } else {
      jobHtml = '<div class="phone-job-title">Semua misi selesai!</div>'
        + '<div class="phone-job-desc">Kota ini milikmu, Raka. Jelajahi sesukamu.</div>';
    }
    el.phoneJob.innerHTML = jobHtml;
    const stars = '★'.repeat(G.wanted.stars) + '☆'.repeat(5 - G.wanted.stars);
    el.phoneStats.innerHTML = '<div>Uang: <b>$' + G.player.money + '</b></div>'
      + '<div>Misi selesai: <b>' + G.missions.done.length + ' / 5</b></div>'
      + '<div>Wanted: <b>' + stars + '</b></div>'
      + '<div>Nyawa: <b>' + Math.max(0, Math.round(G.player.health)) + '</b></div>'
      + '<div>Senjata: <b>' + (G.player.hasPistol ? 'Pistol (' + G.player.ammo + ' peluru)' : 'Tangan kosong') + '</b></div>'
      + '<div>Kontak: <b>' + CONTACTS.map((c) => c.name).join(', ') + '</b></div>';
  }

  return {
    flash() { flashUntil = performance.now() + 180; },
    setObjective(text) {
      el.objective.textContent = text;
      el.objective.style.display = text ? 'block' : 'none';
    },
    setPrompt(text) {
      el.prompt.textContent = text || '';
      el.prompt.style.display = text ? 'block' : 'none';
    },
    showMap(G) {
      if (!el.mapScreen) return;
      el.mapScreen.style.display = 'flex';
      drawMap(G);
      fillPhone(G);
    },
    hideMap() { if (el.mapScreen) el.mapScreen.style.display = 'none'; },
    showScreen(name, saveInfo) {
      for (const [key, node] of Object.entries(el.screens)) {
        node.style.display = key === name ? 'flex' : 'none';
      }
      if (name === 'title') {
        if (saveInfo) {
          el.titleSave.style.display = 'block';
          el.titleMoney.textContent = 'Uang $' + saveInfo.money + ' - ' + saveInfo.done.length + ' misi selesai';
          if (el.titleContinue) el.titleContinue.style.display = 'inline-block';
        } else {
          el.titleSave.style.display = 'none';
          if (el.titleContinue) el.titleContinue.style.display = 'none';
        }
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
      // weapon line: name + ammo, always visible so the player knows the loadout
      if (el.weapon) {
        el.weapon.textContent = G.player.hasPistol
          ? 'Pistol - ' + G.player.ammo + ' peluru'
          : 'Senjata: tangan kosong';
      }
      // line-of-sight indicator: only while wanted
      if (el.sight) {
        if (G.wanted.stars > 0) {
          el.sight.style.display = 'block';
          if (G.wanted.seen) {
            el.sight.textContent = 'TERLIHAT';
            el.sight.style.background = '#e04848';
          } else if (G.wanted.escaping) {
            el.sight.textContent = 'SEMBUNYI - KABUR!';
            el.sight.style.background = '#58a05c';
          } else {
            el.sight.textContent = 'SEMBUNYI';
            el.sight.style.background = '#58a05c';
          }
        } else {
          el.sight.style.display = 'none';
        }
      }
      // helicopter banner: the spotter is often above the chase camera's
      // view, so the HUD says so instead of leaving the player guessing
      // why the tail will not drop
      if (el.heli) {
        el.heli.style.display = (G.heli && G.heli.active) ? 'block' : 'none';
      }
      // current district under the minimap
      if (el.minimapLabel) {
        el.minimapLabel.textContent = (districtAt(G.player.x, G.player.z) || 'SOLMARINA').toUpperCase();
      }
      el.flash.style.opacity = performance.now() < flashUntil ? '0.45' : '0';
      drawMinimap(G);
    },
  };
}
