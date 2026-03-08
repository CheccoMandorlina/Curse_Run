# CURSE RUN V2 - Test Scenarios Mapping

This maps Spec section 10 to current automated coverage and manual checks.

## 10.1 UX/navigation
- Manual:
  - Launcher starts fullscreen kiosk mode.
  - Web fullscreen toggle + PWA install flow.
  - No external panels during live match.
- Automated:
  - `npm run test:smoke:exe` validates launcher/server boot path.
  - `npm run test:smoke` validates web shell assets (`manifest.webmanifest`, `sw.js`).

## 10.2 Multiplayer flow
- Automated:
  - Online/private room flow + host start: `npm run test:smoke:socket`.
  - Match list API/filter contract: `npm run test:smoke`.
  - Local/offline bot stability path: `npm run test:smoke:socket` + `npm run test:load:16`.

## 10.3 Extraction gameplay
- Automated:
  - Segment/hub/final progression + objectives + archetypes:
    - `server/test/extraction-mode.test.ts`
  - Safe hub shop operational:
    - `server/test/combat-ux-rules.test.ts`
  - Permadeath/spectate/winner logic:
    - `server/test/extraction-mode.test.ts`

## 10.4 Combat systems
- Automated:
  - Minimap LOS visibility + fog explored cells:
    - `server/test/combat-ux-rules.test.ts`
  - Inventory quickbar/wheel/pickup/swap/drop:
    - `server/test/combat-ux-rules.test.ts`
  - Shop match-only XP:
    - `server/test/combat-ux-rules.test.ts`

## 10.5 Social
- Automated:
  - Friends lifecycle add/remove/block/mute/unmute:
    - `npm run test:smoke:social`
  - Clan create/join/leave/roster:
    - `npm run test:smoke:social`
  - Chat moderation keyword filter + rate limit:
    - `npm run test:smoke:socket`
    - `npm run test:smoke:social`
  - Ranked profile/leaderboard:
    - `npm run test:smoke:social`
  - Tournaments auto/custom + roster integrity:
    - `npm run test:smoke:social`

## 10.6 Packaging & smoke
- Automated:
  - Server exe health smoke:
    - `npm run test:smoke:exe`
  - Launcher exe boot smoke:
    - `npm run test:smoke:exe`
  - Web parity smoke:
    - `npm run test:smoke`

## Full suite
- `npm run test:hardening`
- `npm run exe:win && npm run test:smoke:exe`
