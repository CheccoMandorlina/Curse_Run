# CURSE RUN Milestones (Shooter Rebuild)

## M1 - Core Shooter Runtime
Scope: netcode + simulation + lobby/room + party/single shooter.

Status: `Done`

Delivered:
- Shooter-authoritative engine with movement, hit detection, projectiles, pickups, buffs.
- Preserved lobby contracts (`room:create/join/start/update`) and clock sync.
- Modes `FFA` / `2v2`, bot filler up to 4 players.
- Spectator handoff for dead players.
- Client canvas rendering + snapshot interpolation (`seq` guard).

## M1.5 - Persistence + Social Loop
Scope: shooter persistence, daily leaderboard, summary flow.

Status: `Done`

Delivered:
- Shooter-only DB schema (`profiles`, `shooter_rounds`, `shooter_results`, `daily_attempts_shooter`).
- `/api/runs/summary` adapted to shooter manifest/log metadata.
- Daily attempts + daily leaderboard with shooter score.
- Input log retention policy (latest 20 per profile/mode + top 3 daily).

## M2 - Deterministic Replay Extension
Scope: shooter replay model and ghost playback.

Status: `Planned`

Planned deliverables:
- Event-log based replay pipeline for non-deterministic shooter interactions.
- Ghost playback UI integration in Game tab.
- Validation tooling for replay consistency checks.
