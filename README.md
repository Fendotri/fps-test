# forbox.io

Tarayicida calisan, Three.js tabanli, FFA odakli bir FPS prototipi.
Bu dokuman hem teknik README hem de GDD (Game Design Document) olarak yazildi.

## 1) Proje Ozet (GDD)

### 1.1 Oyun Vizyonu
- Hizli, rekabetci, Counter-Strike hissiyatina yakin bir first-person shooter deneyimi.
- Tek oyunculu test ve gelistirme dongusu icin bot destekli FFA.
- Uzun vadede kalici hesap, ekonomi, progression, premier rating ve multiplayer altyapisina hazir bir cekirdek.

### 1.2 Temel Oynanis Pillarlari
- Deterministik combat cekirdegi:
  - Silah bazli recoil/spray/inaccuracy.
  - Hitgroup bazli damage (head/chest/stomach/arm/leg), armor etkisi.
- CS benzeri hareket:
  - Walk (`Shift`), crouch (`C`), jump/air kontrol.
  - Hareket durumunun direkt isabete etki etmesi.
- 5 dakikalik FFA round akisi:
  - Tab scoreboard, kill feed, damage popup, kill card.
  - Round sonu 15 saniye intermission.
- Progression:
  - Coin ekonomisi, case opening, inventory/loadout.
  - Daily/weekly questler, weekly login rewards.
  - Achievement -> title/name color/avatar frame odulleri.
  - Premier rating + leaderboard.

### 1.3 Match Loop
1. Ana menuden `PLAY` ile FFA baslar.
2. Oyuncu loadout snapshot ile maca girer (match icinde kilitli).
3. Botlar ve oyuncu 5 dakika boyunca skor, kill, assist, damage uzerinden yarisir.
4. Round bitiminde:
   - Placement hesaplanir.
   - Backend'e match report gider.
   - Coin, quest ve premier update uygulanir.
5. 15 saniye intermission:
   - `CONTINUE` veya `MAIN MENU`.

## 2) Mevcut Feature Seti

### 2.1 Modlar
- Aktif odak mod: `FFA`.
- Mode rule sistemi var (`src/gameplay/modes/modeRules.ts`):
  - FFA'da match icinde `B` buy menu kapali.
  - Diger modlar (dm/tdm/competitive) altyapi seviyesinde acik-kapali kurallari ile duruyor.

### 2.2 Silahlar ve Combat
- Aktif katalog (13 + knife):
  - Glock-18, USP-S, Desert Eagle
  - MAC-10, MP9, P90
  - AK-47, M4A1-S, SG553, AUG
  - AWP, XM1014, Negev
  - M9 Knife
- Combat modeli (`src/gameplay/combat/CombatTuning.ts`):
  - `rpm`, `damage`, `rangeModifier`, `armorRatio`, hitgroup multipliers.
  - Recoil pattern + spread + recovery.
  - Scoped state override (AWP/AUG/SG553).
  - Runtime AK micro-tune parametreleri (camera kick, spread, pattern scale, recovery).

### 2.3 Scope Sistemi
- Sag tik (`Mouse Right`) scope toggle/cycle:
  - AWP: zoom1 -> zoom2 -> off
  - AUG/SG553: on/off
- FOV, sensitivity, inaccuracy multipliers scope state'e gore ayarlanir.
- HUD scope overlay event ile senkron.

### 2.4 Hareket
- Input:
  - `WASD` hareket
  - `Space` jump
  - `Shift` walk
  - `C` crouch
- Movement state, shot inaccuracy hesabina beslenir.

### 2.5 Bot Sistemi (Harita Ozel)
- `EnemyBotSystem`:
  - Nav-grid + pathing + LOS kontrolleri.
  - Dust2 map profili icin ayri nav tuning.
  - Spawn fairness skoru, spawn protection, out-of-bounds respawn.
  - Difficulty: Easy/Normal/Hard (reaksiyon, tracking, spread farki).
- Death cam + respawn:
  - Oyuncu oldugunde killer odakli kamera.
  - Respawn suresi sonra tekrar spawn.
  - Spawn protection suresince koruma.

### 2.6 HUD ve Scoreboard
- HUD:
  - HP/AR/money/ammo, kill feed, damage popup, hit effect.
  - Oldurme kartlari (stack), death overlay, round end overlay.
- Tab scoreboard kolonlari:
  - `# / PLAYER / RANK / K / D / A / K/A / SCORE / DMG / PING`
- Premier rank badge + ELO degeri satirlarda gorunur.
- Name color ve avatar frame scoreboard'da uygulanir.

### 2.7 Forbox Menu / GUI
- Sol dikey menu:
  - `PLAY`, `AGENTS`, `INVENTORY`, `SHOP`, `LEADERBOARD`, `REWARDS`, `MISSIONS`
- Aktif tablar:
  - PLAY, INVENTORY, SHOP, LEADERBOARD, REWARDS, MISSIONS
- Account modal:
  - Username/team tag duzenleme
  - Kullanici istatistik ozeti
- Currency label UI:
  - Backend para birimi `coin`
  - UI gorunumu `FORBOX POINTS (FP)`

### 2.8 Ekonomi / Case / Inventory
- Starter wallet: `1200`
- FFA reward breakdown:
  - kill bonus: `6`
  - placement rewards: `1->220`, `2->140`, `3->90`, `other->0`
  - win bonus (1. sira): `120`
- Shop:
  - Case odakli akis.
  - Case inspect -> buy & open -> reel animasyon -> sonucla inventory update.
- Loadout:
  - Slots: `primary`, `secondary`, `knife`
  - Match canliyken loadout degisimi kilitli.

### 2.9 Progression (Quest / Achievement / Weekly Login)
- Daily + weekly questler backend authoritative ilerler.
- Weekly login:
  - Pazartesi baslar, pazar biter.
  - O gun claim edilmezse gunluk hak kacmis olur.
- Achievement:
  - Kill/headshot/streak/score/win gibi metrikler.
  - Oduller:
    - Title
    - Name color
    - Avatar frame
    - Coin

### 2.10 Premier ve Leaderboard
- Premier:
  - Ilk 5 match kalibrasyon.
  - Kalibrasyondan sonra ELO gorunur.
- Tier bandlari:
  - `<5000`: gray
  - `5000-9999`: light blue
  - `10000-14999`: blue
  - `15000-19999`: purple
  - `20000-24999`: pink
  - `25000-29999`: red
  - `30000+`: gold
- Leaderboard:
  - Period: daily / weekly / all
  - Metric: kills / wins
  - Premier rating listesi yuksekten dusuge ayrica gosterilir.
  - ELO esitliklerinde rating uzerinden tie-break.

### 2.11 Lobby Chat
- Ana menu sag panelde aktif lobby chat.
- Enter ile gonderme + emoji butonlari.
- Son mesaj en altta gorunur, otomatik scroll asagi.
- Frontend:
  - Max 50 mesaj render.
  - Poll interval 1.5s.
- Backend:
  - History limiti default 400 (env ile degisebilir).
  - Mesaj limiti 220 karakter.
  - Spam korumasi:
    - 10 sn'de max 6 mesaj
    - Min 650 ms aralik
    - 12 sn duplicate engeli
    - Ihlalde cooldown
- Kufur filtresi:
  - `profanity_filter_list.txt` dosyasindan yuklenir.
  - Kelime/satir parcasi degil, kelime siniri bazli filtreleme.
  - Ornek: "pain in the ass" blok, "assassin" bloklanmaz.

## 3) Teknoloji ve Mimari

### 3.1 Frontend
- Vite + TypeScript + Three.js
- Giris:
  - `multi_pages/index.html`
  - `src/main.ts`
- Cekirdek:
  - `src/core/*`
- Gameplay:
  - `src/gameplay/*`
- UI:
  - `src/viewlayers/*`
- API client:
  - `src/services/BackendApi.ts`

### 3.2 Backend
- Node.js (ESM) + JSON database
- Giris:
  - `backend/server.mjs`
- Core moduller:
  - `backend/src/liveops.mjs`
  - `backend/src/progression.mjs`
  - `backend/src/premier.mjs`
  - `backend/src/leaderboard.mjs`
  - `backend/src/chat.mjs`
  - `backend/src/realtime.mjs`
- Veri dosyasi:
  - `backend/data/db.json`

### 3.3 Realtime (Multiplayer Foundation)
- `GET /api/multiplayer/bootstrap` ile websocket endpoint verilir.
- `WS /ws`:
  - Auth, room join, state broadcast scaffold.
- Not:
  - Bu katman production-grade server authoritative multiplayer'in temelidir, tam matchmaking/sync anti-cheat pipeline henuz roadmap asamasindadir.

## 4) Kurulum ve Calistirma

## 4.1 Gereksinimler
- Node.js 18+
- npm 8+

## 4.2 Paket Kurulumu
```powershell
npm.cmd install
```

## 4.3 Backend Baslat
```powershell
npm.cmd run backend:start
```

## 4.4 Frontend Baslat
```powershell
npm.cmd run dev
```

## 4.5 Tek Satir Baslatma (PowerShell)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\endle\Downloads\cube-gunman-master\cube-gunman-master'; npm.cmd install; Start-Process powershell -ArgumentList '-NoExit','-Command','Set-Location ''C:\Users\endle\Downloads\cube-gunman-master\cube-gunman-master''; npm.cmd run backend:start'; npm.cmd run dev"
```

## 4.6 npm.ps1 Execution Policy Hatasi
Eger `npm.ps1 cannot be loaded` hatasi aliyorsan:
- Her zaman `npm` yerine `npm.cmd` kullan.
- Gecici cozum:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## 5) Build Profilleri ve Optimizasyon

## 5.1 Scriptler
```powershell
npm.cmd run tscheck
npm.cmd run build
npm.cmd run build:lite
npm.cmd run size:check
```

## 5.2 Lite Build
- `vite.config.ts` lite modda:
  - `target: es2018`
  - `sourcemap: false`
  - `minify: esbuild`
  - dusuk `assetsInlineLimit`
- Boyut kapisi:
  - `scripts/build-size-check.mjs`
  - hedef: `<= 8 MB` (portal odakli)

## 5.3 Runtime Auto Quality
- `src/core/RuntimeQuality.ts`
- Tier: `low | medium | high`
- Cihaz algisina gore:
  - pixel ratio cap
  - antialias
  - fx budget
- FPS duserse otomatik tier dusurme aktif (`VITE_QUALITY_AUTO=true`).

## 6) Kontroller

- Mouse Left: ates
- Mouse Right: scope/zoom (AWP/AUG/SG553)
- `W / A / S / D`: hareket
- `Shift`: walk
- `C`: crouch
- `Space`: jump
- `R`: reload
- `1 / 2 / 3`: primary / secondary / knife
- `Q`: last weapon
- `Tab` (basili): scoreboard
- `Esc`: pause menu (resume / main menu)
- `B`: FFA'da kapali (diger modlar icin mode-gated)

## 7) API Ozet

### 7.1 Health / Auth
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### 7.2 Profile / Progression
- `GET /api/profile`
- `GET /api/progression`
- `POST /api/progression/equip`
- `POST /api/rewards/weekly-login/claim`

### 7.3 Shop / Case / Inventory / Loadout
- `GET /api/shop/offers`
- `POST /api/shop/purchase`
- `GET /api/inventory`
- `GET /api/cases/catalog`
- `POST /api/cases/open`
- `POST /api/inventory/open-case` (legacy uyumluluk)
- `POST /api/inventory/equip`
- `GET /api/loadout/catalog`
- `POST /api/loadout/equip`

### 7.4 Match / Leaderboard
- `POST /api/matches/ffa/report`
- `GET /api/leaderboard?period=daily|weekly|all&metric=kills|wins&limit=20`

Leaderboard response:
- `serverTime`
- `nextResetAt`
- `resetInSeconds`

### 7.5 LiveOps Admin
- `PUT /api/liveops/config`
- Header: `x-admin-key: <ADMIN_API_KEY>`

### 7.6 Multiplayer Bootstrap
- `GET /api/multiplayer/bootstrap`
- `WS /ws`

## 8) Veri ve Konfig Kaynaklari

- Frontend env:
  - `envs/.env`
  - `envs/.env.lite`
- Root env ornegi:
  - `.env.example`
- Backend env ornegi:
  - `backend/.env.example`
- Liveops/ekonomi/case/progression defaultlari:
  - `backend/src/liveops.mjs`
  - `backend/src/progression.mjs`

## 9) Icerik Pipeline Rehberi

### 9.1 Harita Ekleme
1. GLB dosyasini `public/levels/` altina koy.
2. Gerekirse env ile map sec:
   - `VITE_LEVEL_MAP=/levels/de_dust_2_with_real_light.glb`
   - `VITE_LEVEL_MAP_SCALE=1.0`
3. `src/core/GameResources.ts` map load path'i bu env'i kullanir.
4. `LevelMirage`:
   - Dust2 algilanirsa guvenlik zemini ekler.
   - Octree collision olusturur.
   - Meshleri walk/LOS/nav icin etiketler.

### 9.2 Skin ve Case Ekleme
- Dosya:
  - `backend/src/liveops.mjs`
- Degistirilecek alanlar:
  - `cases`
  - `storefront.offers`
  - drop `weight/rarity/slot/weaponId`
- Sonra:
  - server restart
  - shop/catalog endpoint kontrol

### 9.3 Silah Modeli / Animasyon Ekleme
- Hand/weapon pipeline:
  - `public/role/base/hand_base.glb`
- Gerekenler:
  - mesh + anim klip isimlerinin mevcut runtime naming ile eslesmesi
  - texture optimizasyonu (portal hedefi icin)
- Kod esleme noktasi:
  - `src/gameplay/loadout/weaponCatalog.ts`
  - `src/gameplay/loadout/weaponFactory.ts`
  - `src/gameplay/combat/CombatTuning.ts`

### 9.4 Inventory ve Loadout
- Loadout slotlari:
  - `primary`, `secondary`, `knife`
- Match icinde loadout kilit.
- Inventory filtre menusu:
  - silah bazli + metin arama.

## 10) Chat Profanity Listesi

- Kufur listesi dosyasi:
  - root: `profanity_filter_list.txt`
  - fallback: `backend/data/profanity_filter_list.txt`
- Backend env ile override:
  - `PROFANITY_FILTER_FILE=...`
- Kelime siniri mantigi ile optimize edilir, substring false positive azaltilir.

## 11) Test ve Dogrulama

### 11.1 Teknik
```powershell
npm.cmd run tscheck
npm.cmd run build
npm.cmd run build:lite
npm.cmd run combat:smoke
```

### 11.2 Backend smoke
- `npm.cmd run backend:start` ile ayaga kaldir.
- `GET /api/health` ile servis + chat metadata dogrula.
- register/login -> profile/progression -> case open -> match report akisini test et.

### 11.3 Dummy leaderboard seed
```powershell
npm.cmd run backend:seed:leaderboard
```

## 12) Bilinen Notlar

- Lite size gate (`<=8MB`) buyuk map/texture assetlerinde fail verebilir.
- Bu durumda en buyuk dosyalari `size:check` raporundan gorup texture/model optimizasyonu yap.
- Production yayini icin:
  - map ve skin texture'lari yeniden sikistirilmali
  - gereksiz buyuk test assetleri build disina alinmali

## 13) Temizlik ve Arsiv Notu

- Kaldirilan kodlar `DELETE/` klasorunde tutulur.
- Spray Lab sistemi aktif oyun akisindan cikarildi ve arsivlendi.
- Manifest:
  - `DELETE/README.txt`

## 14) Roadmap (Kisa)

- Tam server-authoritative multiplayer ve room/matchmaking.
- Chat icin websocket pub/sub ve presence.
- LiveOps admin panel.
- Daha agresif web optimizasyonu (asset pipeline + progressive loading).

## 15) Lisans

Lisans bilgisi icin `LICENSE` dosyasina bak.
