# CURSE RUN (Shooter V2 Foundation)

Browser + launcher 2D top-down tactical shooter/extraction with server-authoritative netcode, fullscreen UX, lobby/match browser, inventory/minimap/shop, auth, and social scaffolding.

## Stack
- `app/`: React + Vite + TypeScript + Canvas 2D
- `server/`: Fastify + Socket.IO + TypeScript
- `shared/`: shared contracts/types
- `server/data/`: SQLite runtime DB

## Gameplay
- LMS modes: `lms_ffa`, `lms_2v2` (~90s, no respawn)
- Extraction modes: `extraction_ffa`, `extraction_squad` (~20-25m flow with segment/hub/final phases)
- Weapons: `PISTOL`, `RIFLE`, `SHOTGUN`, `SNIPER`
- Abilities: `Dash` (5s cooldown), `Grenade` (10s cooldown), `Melee`
- Pickups: weapon, ammo, buffs (`RAPID_FIRE`, `SHIELD`)
- Inventory: quickbar 8 + weight, wheel slot select, pickup/swap/drop
- Minimap: fog-of-war + LOS visible players only
- Safe hub shop (extraction): medkit/ammo/weapon purchases with match XP
- Bot filler (LMS up to 4, extraction up to 16 slots by config)
- Maps: `ARENA_ALPHA`, `ARENA_BETA`

## Onboarding Loop
1. Launch app (web/PWA/launcher) -> Main Menu.
2. Right column: settings (audio/video/account), center: Solo/Multiplayer flows.
3. Multiplayer: online list filters, join public/private code, or local.
4. Lobby: host selects mode/map/config, ready/team gates.
5. Match: fullscreen-focused render + HUD/overlay only.
6. Post match: `Play Again` vote, `Back to Lobby`, `Home`.

## Controls (Desktop)
- `WASD`: move
- `Mouse`: aim
- `LMB (hold)`: fire
- `RMB`: grenade
- `Shift`: dash
- `F`: melee
- `1..4`: weapon select
- `Q/E`: spectator target cycle
- `E`: pickup
- `Mouse Wheel`: quickbar slot select

## Implemented core decisions
- Lobby/server flow preserved: `room:create`, `room:join`, `room:start`, `room:update`
- Clock sync kept: `clock:ping`/`clock:pong` + offset handling
- Shooter-authoritative sim at `20Hz`, snapshot publish at `10Hz`
- Client snapshot interpolation + out-of-order protection (`seq`)
- Friendly fire rule in `2v2`: bullets/pellets OFF, grenade splash ON
- DB reset to shooter schema + retention policy

## Run locally
```bash
npm install
npm run dev
```
- App: `http://localhost:5177`
- Server/API/Socket: `http://localhost:3007`

## Build and test
```bash
npm run build
npm run test
npm run test:smoke
npm run test:load:16
npm run test:hardening
```

## Windows EXE (Dual)
```bat
build-and-package-win.bat
```
Output:
- `dist/curse-run-server.exe`
- `dist/curse-run-launcher.exe`

Notes:
- `curse-run-server.exe`: dedicated backend for deployment.
- `curse-run-launcher.exe`: client launcher (kiosk/fullscreen browser mode).
- Launcher starts local `curse-run-server.exe` (if present), waits `/healthz`, then opens fullscreen kiosk.
- Server runs headless by default unless `AUTO_OPEN_BROWSER=1`.
- EXE smoke (after packaging): `npm run test:smoke:exe`
- Social lifecycle smoke: `npm run test:smoke:social`
- Full scenario mapping doc: `docs/test-scenarios-v2.md`

## Runtime env (server)
- `PORT` (default `3007`)
- `HOST` (default `0.0.0.0`)
- `HEADLESS` (`1` disables browser auto-open)
- `AUTO_OPEN_BROWSER` (`1` enables browser auto-open)
- `SQLITE_PATH` (default `./data/curse-run.db`)
- `DAILY_SEED_SECRET`

## Runtime env (launcher)
- `CURSE_RUN_URL` (default `http://127.0.0.1:3007`)
- `CURSE_RUN_PORT` (used for local server boot)
- `START_LOCAL_SERVER` (`0` disables local server spawn)
- `SERVER_BOOT_TIMEOUT_MS` (default `12000`)

## Web/PWA offline
- `manifest.webmanifest` + service worker enabled.
- Install prompt exposed in settings (`Install App (PWA)` when available).
- Local simulation snapshot persisted in IndexedDB and resumable from `Multiplayer -> Local -> Resume Offline Snapshot`.

## Main HTTP APIs
- `GET /api/time`
- `GET /api/daily/current?profileToken=...`
- `GET /api/replay/capabilities`
- `GET /api/leaderboard/daily?date=YYYY-MM-DD`
- `POST /api/profile/guest`
- `POST /api/runs/summary`

## Main Socket Events
All gameplay events use the shooter namespace prefix (`shooter:*`).

Client -> Server:
- `clock:ping`, `clock:offset`
- `room:create`, `room:join`, `room:leave`, `room:update`, `room:ready`, `room:setTeam`, `room:start`
- `match:list:query`, `match:join:public`, `match:join:private`
- `match:playAgainVote` (`match:rematchVote` kept as compatibility alias)
- `shooter:input`, `shooter:selectWeapon`
- `inventory:selectSlot`, `inventory:pickup`, `inventory:drop`
- `extraction:objectiveInteract`, `extraction:shop:buy`
- `social:chat:send`, `social:friend:*`, `social:clan:*`
- `ranked:queue:*`, `tournament:*`

Server -> Client:
- `clock:pong`
- `room:update`
- `shooter:countdown`, `shooter:state`, `shooter:feed`, `shooter:roundEnd`
- `match:list:update`
- `match:playAgainStatus`
- `extraction:state`, `extraction:event`
- `social:chat:receive`
