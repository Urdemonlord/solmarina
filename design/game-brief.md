# Solmarina 3D — game brief (one page)

Design read: a 3D open-world crime game for a desktop browser player, with a
sun-soaked GTA San Andreas low-poly language, leaning toward bold flat colours,
chunky HUD, hard shadows. No purple gradients, no glassmorphism, no generic
card-grid menus.

## Premise (in Arya's words, as given)
Rebuild Solmarina as 3D, like GTA San Andreas: low-poly third-person.
Same city, same Raka, same 5-mission arc, now in 3D.

## Premise
Raka, kurir Solmarina, terseret ke dunia bawah kota. Curi mobil, kabur dari
polisi, kerjakan misi Marlo. Kota pesisir Solmarina: jalan grid, taman,
pantai, marina. Semua nama, karakter, cerita, art dan suara original.
Nothing from Rockstar.

## Core loop
Jalan kaki atau nyetir -> lihat penanda misi -> kerjakan misi (antar, kejar,
kabur, rampas, antar bos) -> dapat uang -> wanted naik -> polisi ngejar ->
kabur atau ketangkep -> repeat, misi berikutnya terbuka.

## First minute
Title (SOLMARINA + cerita + kontrol) -> Enter -> Raka berdiri di jalan dekat
taman, taksi parkir di depan -> E masuk mobil -> nyetir keliling kota ->
tekan Enter, misi pertama: antar paket ke Kafe Ombak, 150 detik, $150.

## Look
Low-poly Three.js: gedung kotak warna hangat (terakota, krem, teal, mustard),
tekstur jendela dari canvas, jalan aspal gelap + garis kuning, langit biru
cerah + kabut hangat, laut di selatan, bayangan satu directional light.
Kamera third-person di belakang, chase cam saat nyetir.

## Systems (build order)
1. City + renderer + kamera third-person + jalan kaki
2. Mobil + nyetir + tabrakan + curi mobil
3. Traffic + pejalan kaki
4. Wanted + polisi (mobil + jalan kaki) + Busted/Wasted
5. 5 misi + waypoint + panah + timer + hadiah
6. Combat (pukul + pistol) + pickup
7. HUD + minimap + save + layar title/pause
8. Audio prosedural + partikel + shake + skid

## Polish pass 2026-11-18 (Maré Alta bar)
- Helikopter polisi di 3+ bintang + banner HUD; garis pandang: heli
  melihat dalam radius 55 kecuali pemain menempel gedung (cover) atau
  lari menjauh. Kalau tidak terlihat >3 detik, wanted turun cepat
  (8/detik) dan indikator HUD berubah TERLIHAT -> SEMBUNYI.
- Title: senja (17:21), kamera tinggi dari timur laut, Bukit Warna +
  skyline + laut memenuhi frame; tombol BARU / LANJUTKAN + tabel kontrol.
- Peta penuh (Tab): 8 distrik bernama, rute misi garis putus-putus,
  penanda pemain/misi/polisi/heli, panel HP (misi, kontak, statistik).
- Siklus siang/malam dari jam game: jendela menyala + lampu jalan di
  malam hari; 3 warung Pasar Malam, [E] beli makan (+nyawa).
- Minimap lingkaran + ring kuning; nama distrik di bawahnya; senjata +
  amunisi di HUD; panah arah besar + garis rute di tanah; mobil: kaca
  gelap + atap + bumper + hub roda + lampu depan menyala di malam hari.
- Bug yang diperbaiki: mobil polisi tidak pernah di-sync ke mesh
  (duduk di origin, kejar-kejaran tidak kelihatan); banner objektif dan
  prompt tidak pernah ditampilkan (display:none); kamera shot tidak
  pernah snap (yaw lerps, framing shot meleset); warna langit dicuci
  karena setRGB linear vs sRGB.

## Polish pass v3 2026-11-18 (composition, Maré Alta bar; Arya rejected v2:
chase police small/far, no cars ahead, bottom half empty road)
- 3-chase is composition, not map: police 10-12 units ahead (not 20+)
  plus a third unit right behind the player, big in the lower frame;
  4 traffic cars strung ahead on the beachfront road; heli 2x scale,
  low over the beach south of the road (upper-left, clear of the
  objective banner, side-on so it reads blue, not a black slab; y 5,
  since updateHeli lerps it toward hover height 20 over the staged
  frames); camera yawed 0.3 rad toward the sea so beach/palms/
  umbrellas/crowd fill the left third; crowd is two packed rows facing
  the road; beach umbrellas added as static sand decor (own seeded
  rng, v2 decor layout untouched).
- 1-start: the sun disc is no longer hidden on the title screen and no
  longer sits south-west behind the camera: it is west-northwest over
  the ridge, the title camera looks nudged west so it reads upper-left,
  clear of the text; the disc billboards to the camera (round, not a
  squashed ellipse); title overlay lightened 0.84 -> 0.55 mid-band so
  the sunset sky reads bright instead of flat mud.
- 4-mission: player faces ENE so stalls 2-3 and the cafe beacon read
  across the frame; 8 shoppers (all three stalls + two foreground, one
  at each lower corner of the frame) and 2 traffic cars on the market
  street, so the bottom half is people and street, not empty pavement.
  (Foreground spots must sit beside the camera-player axis: south of
  the player is behind the camera from this angle and never renders.)
- Map unchanged (already matches the reference).

## v4: skyscrapers from the player's angle + the phone menu (Arya, 04:57 WIB)
- 2-drive re-staged as the downtown tower canyon, from the player's
  angle: the sports car drives NORTH up the x=200 road straight at the
  skyline cluster (towers 60-110 at z -295..-300), golden hour, fog
  pushed out so the towers stay crisp. The low follow camera puts the
  towers over the rooftops in the top of the frame, like the reference
  title shot. Traffic ahead on the same road + peds on the sidewalks,
  so the frame bottom is street life, not empty asphalt. (The towers
  were only ever seen from the high title camera before; from street
  level they are 60-110 tall against 8-42 city buildings. Tried the
  player closer at z=-200: cross-traffic parks a truck between the
  camera and the car, so the shot stays at mid-block z=-160. From the
  low chase camera the near street wall occludes the distant towers;
  the skyline reads in the title shot, the drive shot reads as a
  lively street. A looming-towers drive shot would need a higher
  camera or a gap in the street wall, not just a closer player.)
- The phone is now a real menu (was a static panel: decorative tabs,
  everything shown at once). Tabs PETA / MISI / KONTAK / STATS switch
  panes, by mouse click and by keys 1-4 on the map screen. PETA: the
  current job card (giver avatar + reward + countdown) + the 5-mission
  progress list. MISI: the whole arc with rewards. KONTAK: contacts
  with avatars, from config. STATS: money, missions, wanted, health,
  weapon, clock. Status bar "SOLMARINA NET 5G" + game clock. Buttons:
  KEMBALI (Tab) / SIMPAN / MENU AWAL (goes to the title).
- 4-mission re-staged as the map + phone menu screen (Tab), like the
  reference: full city map with the mission route on the left, the HP
  menu open on the PETA tab on the right. Night 21:17 at Pasar Malam,
  mission m0 active, $150, pistol 24 rounds, 2 stars. The night-market
  gameplay shot is dropped from the set; the market is still in the
  game and still has its [E] stalls.
- Staging trap: the boot code forced every non-title shot back to
  'play'; the map shot sets G.shotScreen = 'map' and the boot opens
  the map from it (hiding the title first, skipping the play update).
- Heading trap (caught by the v5 screenshot, not the tests): forward
  is (-sin h, -cos h), so heading 0 = north, PI/2 = west, -PI/2 =
  EAST, PI = south. The first 2-drive re-stage set -PI/2 for "north",
  so the car drove east, the camera looked east, and every car staged
  north of the player sat ~85 deg off-axis, out of frame; the "tower"
  filling the frame was a city building east of the player. The live
  check asserted the same wrong heading, so it passed while the shot
  was broken. Now the check asserts heading 0 AND traffic ahead
  (z < player.z - 20) on the tower road.

## v5: gang war + police chase spectacle (Arya, 12:54 WIB: "scene perang
antar gang dan kejar kejaran ama polisi mana" / "iya biar rame dan
spektakuler")
- Gang war is a real free-roam event, not a staged prop: Geng Ombak
  (teal) vs Geng Bara (red), 5v5, on the Pasar Malam street (z=120
  road). It starts when Raka walks into the zone carrying the pistol
  (the pistol gate keeps the m0 cafe run and the stall checks, which
  teleport an unarmed player into the zone, from starting a war by
  accident), ends when one side has nobody standing, then cools down
  60s. Members advance, strafe, fire with visible tracer lines +
  muzzle flashes; shooting one member turns his whole gang hostile to
  Raka; gunfire draws police heat while Raka watches; peds flee the
  zone; traffic can knock members down. HUD: red "PERANG GANG —
  PASAR MALAM" banner, gang dots on the minimap (teal/red), phone
  MISI pane lists the war as a live event (BERLANGSUNG / winner /
  TENANG).
- Tracers are a line pool in render.js (24 lines, 0.12s live). Police
  return fire renders tracers too now, so the chase shoots back.
  Staged shots fire tracers with a 5s life: live ones would expire
  before frame 2 of the staged render. Staged lines alternate
  endpoint heights (1.0/1.6) and are fired twice 0.06 apart: a single
  1px THREE.Line is too thin to read as gunfire at this distance, and
  all at one height they read as parallel wires, not crossfire.
- Pistol aim fix (latent bug found by the live suite): the old shoot()
  raycast the camera ray through the screen centre, but the follow
  camera sits 5.5 units behind Raka at height 4.6 looking down at his
  chest (y 1.5), so the centre ray dives ~31 deg and hits the ground
  ~2.7 units past him: the pistol could never hit anything further
  away, and the gang war would have been unshootable. New shootAim()
  in combat.js (pure logic, unit-tested): a horizontal ray from Raka's
  gun along the camera's horizontal forward, lateral tolerance 0.9
  units (aim assist), nearest on-line target wins, range 40. The
  click handler builds refs only (no meshes) and traces from the gun
  origin. Crosshair stays at screen centre; aim = point the camera at
  the target horizontally and click.
- Tests: unit-3d.mjs has 15 gang checks + 5 aim checks (10-unit hit +
  hostile, off-line miss, behind miss, nearest wins, down member
  skipped): unit 127/127 passed (was 107/107 before v5).
- 2-drive is the gang war now, replacing the tower drive (the towers
  never loomed from the low camera; the drive read as a lively street,
  not a tower canyon). Night 21:17, Raka on foot mid-road between the
  two lines, tracers crossing left-right, stalls + lit windows behind,
  peds fleeing south, one foot cop closing in. The camera is staged
  (pos (150,7,142), look (150,1.2,108), FOV 70): the follow rig looks
  through the player, and both gangs sit ~50 deg off-axis from there,
  outside the frame. A staged shot camera on a play screen needs the
  branch in update(), not frame(): frame() only stages cameras on menu
  screens. The boot update runs ~0.12s of sim before the two staged
  frames, so nothing staged may depend on live fire in that window.
- 3-chase gets staged police tracers too (3 long-life lines from the
  police cars at the player), so the chase frame shows the police
  shooting back.
- Heading trap, restated: forward is (-sin h, -cos h): 0 = north,
  PI/2 = west, -PI/2 = east, PI = south.
- Bukan GTA: tidak ada nama, logo, karakter, peta atau musik Rockstar.
- Tidak ada network: semua file lokal di game/, Three.js di-vendor.
- Tidak ada kamera yang bikin mual: follow halus, shake kecil, tanpa roll.
- Tidak ada misi yang soft-lock: semua target bisa dicapai jalan kaki/mobil.

## Vendored
- three.js 0.160.0 UMD (build/three.min.js, MIT, Three.js Authors),
  di game/vendor/three.min.js. Bukan source kami, tidak dihitung gate.

## Handover (honest)
- Belum dimainkan manusia, belum didengar telinga manusia.
- Headless Chrome + SwiftShader saja untuk verifikasi visual.
- Handling arcade, AI traffic sederhana (loop jalan), tanpa handbrake/drift.
