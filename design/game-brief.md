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

## Anti-pillars
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
