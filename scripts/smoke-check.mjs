import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const PORT = 3011;
const tmp = mkdtempSync(join(tmpdir(), 'curse-run-smoke-'));
const SQLITE_PATH = join(tmp, 'smoke.sqlite');

const child = spawn(process.execPath, ['server/dist/main.js'], {
  cwd: process.cwd(),
  stdio: 'pipe',
  env: {
    ...process.env,
    PORT: String(PORT),
    AUTO_OPEN_BROWSER: '0',
    SQLITE_PATH
  }
});

const logs = [];
child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

async function waitForHealth(url) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Server did not become healthy in time');
}

try {
  await waitForHealth(`http://127.0.0.1:${PORT}/healthz`);

  const health = await fetch(`http://127.0.0.1:${PORT}/healthz`).then((r) => r.json());
  if (!health.ok) throw new Error('healthz returned invalid payload');

  const manifest = await fetch(`http://127.0.0.1:${PORT}/manifest.webmanifest`).then((r) => r.json());
  if (!manifest?.name || manifest?.display !== 'standalone') throw new Error('manifest payload invalid');

  const sw = await fetch(`http://127.0.0.1:${PORT}/sw.js`).then((r) => r.text());
  if (!sw.includes('CACHE_NAME') || !sw.includes('fetch')) throw new Error('service worker not served correctly');

  const profile = await fetch(`http://127.0.0.1:${PORT}/api/profile/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'SmokeRunner', deviceId: 'smoke-device' })
  }).then((r) => r.json());

  if (!profile.profileToken) throw new Error('profile token missing');

  const daily = await fetch(`http://127.0.0.1:${PORT}/api/daily/current?profileToken=${encodeURIComponent(profile.profileToken)}`).then((r) => r.json());
  if (!daily.dayUtc || typeof daily.resetsInSec !== 'number') throw new Error('daily payload invalid');

  const replay = await fetch(`http://127.0.0.1:${PORT}/api/replay/capabilities`).then((r) => r.json());
  if (replay.deterministicOnly !== false) throw new Error('replay capability mismatch');

  const runRes = await fetch(`http://127.0.0.1:${PORT}/api/runs/summary`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profileToken: profile.profileToken,
      mode: 'shooter_daily',
      mapId: 'ARENA_ALPHA',
      score: 420,
      kills: 3,
      deaths: 1,
      assists: 2,
      damageDealt: 960,
      survivalMs: 70000,
      dayUtc: daily.dayUtc,
      inputLogBlob: Buffer.from('smoke-input-log').toString('base64'),
      manifest: {
        roundSeed: 'smoke-round',
        botSeed: 'smoke-bot',
        simVersion: 'shooter-v1',
        policyVersion: 'shooter-v1'
      }
    })
  }).then((r) => r.json());

  if (!runRes.ok) throw new Error('run summary failed');

  const leaderboard = await fetch(`http://127.0.0.1:${PORT}/api/leaderboard/daily?date=${daily.dayUtc}`).then((r) => r.json());
  if (!Array.isArray(leaderboard.items) || leaderboard.items.length === 0) throw new Error('leaderboard did not update');

  console.log('smoke-check: ok');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 200));
  rmSync(tmp, { recursive: true, force: true });

  if (logs.length > 0 && process.env.SMOKE_DEBUG === '1') {
    console.log(logs.join(''));
  }
}
