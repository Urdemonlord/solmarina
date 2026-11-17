# Solmarina — design brief (gta6-01)

Premis, kata-kata Arya apa adanya: "lanjut build buat jadi no 1 di make.fun".
Game kejahatan open-world 2D top-down ala GTA 1/2, kota pesisir original
"Solmarina". Protagonis Raka, kurir yang terseret ke dunia bawah kota.
Tidak ada apa pun dari Rockstar: tanpa nama, karakter, logo, peta, art, atau
musik GTA.

Core loop: jalan kaki / curi mobil / kabur dari polisi / kerjakan misi / dapat
duit / buka misi berikutnya. Menit pertama: title -> Raka di jalan dekat mobil
parkir, prompt "E untuk masuk mobil", misi 1 langsung tersedia di HUD.

Tampilan: canvas 2D top-down, kamera mengikuti halus + trauma shake, kota
grid jalan dengan blok bangunan, taman, pantai di selatan, marina di timur.
Palet Mediterania hangat: terakota, pasir, teal laut, atap merah bata.
Siang cerah, bayangan lembut ke arah tenggara. Semua art prosedural canvas
(tanpa aset luar). Suara prosedural WebAudio (mesin, sirene, pukulan,
pickup, jingle misi). M mute.

Sistem (urut bangun):
1. Kota: grid jalan, blok, bangunan bervariasi, trotoar, taman, pantai,
   properti (pohon, lampu, hydrant). Kamera follow.
2. Jalan kaki: WASD/arrows, Shift sprint, E masuk/keluar mobil, F pukul.
3. Mobil: sedan, taksi, sport, truk, polisi. Fisika arcade (aksel, rem,
   setir), tabrakan bangunan/ped/mobil, damage + asap. Curi mobil parkir,
   carjack mobil berisi orang (naik wanted).
4. Traffic: mobil AI ikut jaringan jalan; pejalan kaki di trotoar, lari
   saat takut.
5. Wanted 1-5 bintang: naik saat kejahatan, turun saat sembunyi. Polisi
   spawn dan kejar/tubruk; polisi jalan kaki di wanted rendah. Busted saat
   ketangkap, Wasted saat health 0.
6. Misi + cerita: intro + 5 misi (antar paket, kejar target, kabur dari
   polisi, curi mobil spesifik, antar bos) dengan waypoint, panah, timer,
   reward $, fail state, unlock berurutan.
7. Combat: pukul di jalan kaki; pistol pickup dengan aim mouse; polisi
   balas tembak di wanted tinggi.
8. HUD: minimap live, health, duit, bintang, kecepatan, objektif, jam.
9. Start screen, pause, Busted/Wasted, save localStorage (duit, misi,
   posisi) + tombol Continue.
10. Polish: partikel (debu, percikan, asap), shake saat tabrakan, bekas
    ban, damage state mobil.

Anti-pilar: jangan jadi clone GTA (nama/peta/art Rockstar), jangan 3D
(scope dipotong ke 2D top-down), jangan aset AI / aset luar, jangan
network request apa pun, jangan scope-creep (tidak ada multiplayer, tidak
ada interior, tidak ada radio musik berlisensi).

Handover jujur (diisi saat selesai): apa yang lolos unit + headless test,
apa yang masih lemah, apa yang ditebak. "Not yet played by a person."
sampai ada manusia yang benar-benar memainkannya.
