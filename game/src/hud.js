// Solmarina 3D: DOM HUD + 2D minimap + menu screens (browser only).
// The DOM lives in index.html; this wires it and draws the minimap and
// the full map screen (Tab) with its phone/job panel.
import { WORLD, CONTACTS, DISTRICTS, STALLS, PHONE_TABS } from './config.js';
import { MISSIONS } from './config.js';
import { missionStatus } from './missions.js';
import { roadLines, districtAt, routePoints, PARK_BLOCK } from './city.js';

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
    phoneClock: $('phone-clock'), phoneProgress: $('phone-progress'),
    phoneMissions: $('phone-missions'), phoneContacts: $('phone-contacts'),
    phoneTabs: Array.from(document.querySelectorAll('#phone-panel .tab')),
    phonePanes: {
      peta: $('pane-peta'), misi: $('pane-misi'),
      kontak: $('pane-kontak'), stats: $('pane-stats'),
    },
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

  // Shared street-map base, drawn by both the minimap and the full map
  // screen: a real map, not a grid of squares. Land is pale, roads are
  // cased lines that carve the blocks into shapes, the park is green,
  // Bukit Warna is a contoured hill, and the south edge is sand + sea.
  // g: 2d context, W/H: canvas size, X/Z: world -> px mapping fns.
  function paintBaseMap(g, W, H, X, Z) {
    g.fillStyle = '#e9e2c6'; // land
    g.fillRect(0, 0, W, H);
    // park block
    const px0 = lines[PARK_BLOCK.bx], px1 = lines[PARK_BLOCK.bx + 1];
    const pz0 = lines[PARK_BLOCK.bz], pz1 = lines[PARK_BLOCK.bz + 1];
    g.fillStyle = '#7fb069';
    g.fillRect(X(px0), Z(pz0), X(px1) - X(px0), Z(pz1) - Z(pz0));
    // Bukit Warna hill: brown disc + contour rings, like a hill on a map
    const hx = X(-235), hy = Z(-235), hr = (95 / 660) * W;
    g.fillStyle = '#c08d55';
    g.beginPath(); g.arc(hx, hy, hr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#a87a48';
    g.lineWidth = 2;
    g.beginPath(); g.arc(hx, hy, hr * 0.62, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(hx, hy, hr * 0.3, 0, Math.PI * 2); g.stroke();
    // beach + sea (south)
    g.fillStyle = '#e8d5a0';
    g.fillRect(0, Z(WORLD.beachZ), W, H - Z(WORLD.beachZ));
    g.fillStyle = '#2f7fb8';
    g.fillRect(0, Z(WORLD.waterZ), W, H - Z(WORLD.waterZ));
    // roads: grey casing, then a pale inner line, so each road reads as
    // a street and the blocks between them read as shapes
    const roadW = (WORLD.road / 660) * W;
    for (const l of lines) {
      // vertical
      g.fillStyle = '#b3a888';
      g.fillRect(X(l) - roadW / 2 - 1.5, 0, roadW + 3, H);
      g.fillStyle = '#f8f4e4';
      g.fillRect(X(l) - roadW / 2, 0, roadW, H);
      // horizontal
      g.fillStyle = '#b3a888';
      g.fillRect(0, Z(l) - roadW / 2 - 1.5, W, roadW + 3);
      g.fillStyle = '#f8f4e4';
      g.fillRect(0, Z(l) - roadW / 2, W, roadW);
    }
  }

  function drawMinimap(G) {
    paintBaseMap(ctx, MW, MH, mapX, mapZ);
    // mission route along the road grid (the reference minimap draws it)
    const step = G.missions.currentStep();
    if (step && step.target) {
      const pts = routePoints({ x: G.player.x, z: G.player.z }, step.target);
      ctx.strokeStyle = '#e04848';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(mapX(p.x), mapZ(p.z)); else ctx.lineTo(mapX(p.x), mapZ(p.z)); });
      ctx.stroke();
      ctx.setLineDash([]);
      // mission blip
      const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(mapX(step.target.x), mapZ(step.target.z), pulse + 2, 0, Math.PI * 2); ctx.fill();
    }
    // traffic
    ctx.fillStyle = '#5d636e';
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
    ctx.strokeStyle = '#22242a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Full map screen (Tab): the whole city, named districts, the mission
  // route, player/mission/police/heli markers, plus the phone panel.
  function drawMap(G) {
    if (!mapCtx) return;
    const mx = (x) => ((x + 320) / 660) * MAPW;
    const mz = (z) => ((z + 320) / 720) * MAPH;
    paintBaseMap(mapCtx, MAPW, MAPH, mx, mz);
    // wave arcs in the sea, so the coast reads as a coast, not a ruler edge
    mapCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    mapCtx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      mapCtx.beginPath();
      mapCtx.arc(MAPW * (0.25 + i * 0.25), mz(WORLD.waterZ + 18 + i * 14), 14, Math.PI * 1.15, Math.PI * 1.85);
      mapCtx.stroke();
    }
    // districts (tinted + labelled, white halo so the text reads on any tint)
    const tints = ['rgba(224,120,86,0.25)', 'rgba(95,158,143,0.25)', 'rgba(224,168,60,0.25)', 'rgba(138,155,176,0.25)', 'rgba(88,160,92,0.25)', 'rgba(201,123,132,0.25)', 'rgba(93,125,217,0.25)', 'rgba(47,127,184,0.25)'];
    mapCtx.font = 'bold 15px Arial, sans-serif';
    mapCtx.textAlign = 'center';
    DISTRICTS.forEach((d, i) => {
      mapCtx.fillStyle = tints[i % tints.length];
      mapCtx.fillRect(mx(d.x - d.w / 2), mz(d.z - d.h / 2), (d.w / 660) * MAPW, (d.h / 720) * MAPH);
      mapCtx.strokeStyle = 'rgba(255,255,255,0.85)';
      mapCtx.lineWidth = 3;
      mapCtx.strokeText(d.name.toUpperCase(), mx(d.x), mz(d.z) + 5);
      mapCtx.fillStyle = '#22242a';
      mapCtx.fillText(d.name.toUpperCase(), mx(d.x), mz(d.z) + 5);
    });
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

  // The phone is a real menu (like the reference): tabs switch panes.
  // PETA: current job card (giver avatar + reward + countdown) + the
  // 5-mission progress list. MISI: the whole arc with rewards. KONTAK:
  // contacts with avatars. STATS: the numbers. All four panes are
  // filled from live game state every time the map opens.
  function showPhoneTab(tab) {
    if (!PHONE_TABS.includes(tab)) tab = 'peta';
    for (const b of el.phoneTabs) b.classList.toggle('active', b.dataset.tab === tab);
    for (const [name, pane] of Object.entries(el.phonePanes)) {
      if (pane) pane.classList.toggle('active', name === tab);
    }
  }
  function fmtClock(minutes) {
    const h = (Math.floor(minutes / 60) + 8) % 24;
    const m = Math.floor(minutes % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function fillPhone(G) {
    if (!el.phoneJob) return;
    if (el.phoneClock) el.phoneClock.textContent = fmtClock(Math.max(0, G.clock));
    const done = G.missions.done || [];
    const active = G.missions.active;
    const activeId = active ? active.def.id : null;
    const step = G.missions.currentStep();
    // PETA pane: current job card
    let jobHtml;
    if (active) {
      const t = Math.max(0, Math.ceil(active.timeLeft));
      jobHtml = '<div class="phone-job-card"><span class="avatar" style="background:'
        + CONTACTS[0].color + '">M</span><span><span class="phone-job-eyebrow">MISI AKTIF &middot; MARLO</span>'
        + '<div class="phone-job-title">' + active.def.title + ' &mdash; $' + active.def.reward + '</div>'
        + '<div class="phone-job-desc">' + (step ? step.label : '') + '</div>'
        + '<div class="phone-job-time">Sisa waktu ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + '</div>'
        + '</span></div>';
    } else if (done.length < MISSIONS.length) {
      jobHtml = '<div class="phone-job-title">Belum ada misi aktif</div>'
        + '<div class="phone-job-desc">Tekan Enter untuk mulai misi berikutnya.</div>';
    } else {
      jobHtml = '<div class="phone-job-title">Semua misi selesai!</div>'
        + '<div class="phone-job-desc">Kota ini milikmu, Raka. Jelajahi sesukamu.</div>';
    }
    el.phoneJob.innerHTML = jobHtml;
    // PETA pane: mission progress (5 rows, status per mission)
    const statusLabel = { done: '✓ SELESAI', active: '▶ AKTIF', next: 'BERIKUTNYA', locked: 'TERKUNCI' };
    if (el.phoneProgress) {
      el.phoneProgress.innerHTML = MISSIONS.map((m, i) => {
        const st = missionStatus(done, activeId, m.id);
        return '<div class="prog"><span><b>' + (i + 1) + '.</b> ' + m.title + '</span>'
          + '<span class="st-' + st + '">' + statusLabel[st] + '</span></div>';
      }).join('');
    }
    // MISI pane: the whole arc with reward + first step
    if (el.phoneMissions) {
      el.phoneMissions.innerHTML = MISSIONS.map((m, i) => {
        const st = missionStatus(done, activeId, m.id);
        return '<div class="mrow"><span><b>' + (i + 1) + '.</b> ' + m.title
          + '<br><span class="mdesc">' + m.steps[0].label + '</span></span>'
          + '<span>$' + m.reward + '<br><span class="st-' + st + '">' + statusLabel[st] + '</span></span></div>';
      }).join('');
    }
    // KONTAK pane: contacts with avatars, from config
    if (el.phoneContacts) {
      el.phoneContacts.innerHTML = CONTACTS.map((c) => {
        return '<div class="contact"><span class="avatar" style="background:' + c.color + '">'
          + c.name[0] + '</span><span><b>' + c.name + '</b> &mdash; ' + c.role
          + '<br>' + c.detail + '</span></div>';
      }).join('');
    }
    // STATS pane
    const stars = '★'.repeat(G.wanted.stars) + '☆'.repeat(5 - G.wanted.stars);
    el.phoneStats.innerHTML = '<div>Uang: <b>$' + G.player.money + '</b></div>'
      + '<div>Misi selesai: <b>' + done.length + ' / ' + MISSIONS.length + '</b></div>'
      + '<div>Wanted: <b>' + stars + '</b></div>'
      + '<div>Nyawa: <b>' + Math.max(0, Math.round(G.player.health)) + '</b></div>'
      + '<div>Senjata: <b>' + (G.player.hasPistol ? 'Pistol (' + G.player.ammo + ' peluru)' : 'Tangan kosong') + '</b></div>'
      + '<div>Waktu: <b>' + fmtClock(Math.max(0, G.clock)) + '</b></div>';
  }

  // Tab clicks: the phone menu is navigable by mouse as well as keys.
  for (const b of Array.from(document.querySelectorAll('#phone-panel .tab'))) {
    b.addEventListener('click', () => showPhoneTab(b.dataset.tab));
  }

  return {
    showPhoneTab,
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
      document.body.classList.add('hide-hud'); // the map has its own panel
      drawMap(G);
      fillPhone(G);
      showPhoneTab('peta'); // the phone always opens on the job card
    },
    hideMap() { if (el.mapScreen) el.mapScreen.style.display = 'none'; document.body.classList.remove('hide-hud'); },
    showScreen(name, saveInfo) {
      for (const [key, node] of Object.entries(el.screens)) {
        node.style.display = key === name ? 'flex' : 'none';
      }
      // the gameplay HUD (money, clock, minimap, prompts) belongs to play
      // only: the title screen is a clean cover, like the reference, and
      // the pause/busted/wasted/map screens have their own panels
      document.body.classList.toggle('hide-hud', name !== 'play');
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
