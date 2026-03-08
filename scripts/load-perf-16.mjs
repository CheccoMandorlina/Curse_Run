import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = Number(process.env.LOAD_PORT ?? 3017);
const CLIENTS = Number(process.env.LOAD_CLIENTS ?? 16);
const DURATION_MS = Number(process.env.LOAD_DURATION_MS ?? 12_000);
const tmp = mkdtempSync(join(tmpdir(), 'curse-run-load-'));
const SQLITE_PATH = join(tmp, 'load.sqlite');

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
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Server health timeout for load test');
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, (resp) => resolve(resp)));
}

async function connectClient(base) {
  const sock = io(base, { transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('connect timeout')), 5000);
    sock.on('connect', () => {
      clearTimeout(to);
      resolve(null);
    });
  });
  return sock;
}

try {
  await waitForHealth(`http://127.0.0.1:${PORT}/healthz`);
  const base = `http://127.0.0.1:${PORT}`;

  const sockets = [];
  for (let i = 0; i < CLIENTS; i += 1) {
    sockets.push(await connectClient(base));
  }

  const host = sockets[0];
  const create = await emitAck(host, 'room:create', {
    profileToken: '',
    nickname: 'LoadHost',
    deviceId: 'load-host',
    config: {
      mode: 'extraction_ffa',
      mapId: 'ARENA_ALPHA',
      botFill: false,
      maxPlayers: CLIENTS,
      roundDurationSec: 180
    }
  });
  if (!create?.ok || !create.roomCode) {
    throw new Error(`room:create failed: ${JSON.stringify(create)}`);
  }

  for (let i = 1; i < CLIENTS; i += 1) {
    const join = await emitAck(sockets[i], 'room:join', {
      code: create.roomCode,
      profileToken: '',
      nickname: `Load${i}`,
      deviceId: `load-${i}`
    });
    if (!join?.ok) throw new Error(`room:join failed for client ${i}: ${JSON.stringify(join)}`);
  }

  const start = await emitAck(host, 'room:start', {});
  if (!start?.ok) throw new Error(`room:start failed: ${JSON.stringify(start)}`);

  let snapshots = 0;
  let maxSeq = 0;
  let maxPlayersInSnapshot = 0;
  let disconnected = false;

  for (const sock of sockets) {
    sock.on('disconnect', () => {
      disconnected = true;
    });
  }
  host.on('shooter:state', (state) => {
    if (typeof state?.seq === 'number') {
      if (state.seq < maxSeq) throw new Error('non monotonic snapshot seq under load');
      maxSeq = state.seq;
    }
    if (Array.isArray(state?.players)) {
      maxPlayersInSnapshot = Math.max(maxPlayersInSnapshot, state.players.length);
    }
    snapshots += 1;
  });

  const loops = [];
  for (const sock of sockets) {
    let seq = 0;
    const int = setInterval(() => {
      seq += 1;
      const t = Date.now();
      sock.emit('shooter:input', {
        localSeq: seq,
        clientMs: t,
        moveX: seq % 2 === 0 ? 1 : 0,
        moveY: seq % 3 === 0 ? -1 : 0,
        aimX: 600 + (seq % 40),
        aimY: 400 + (seq % 35),
        firing: seq % 2 === 1,
        dashPressed: false,
        grenadePressed: false,
        meleePressed: false,
        pickupPressed: false
      });
    }, 50);
    loops.push(int);
  }

  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));
  loops.forEach((id) => clearInterval(id));

  if (disconnected) throw new Error('one or more clients disconnected during load test');
  if (snapshots < 25) throw new Error(`insufficient snapshots under load: ${snapshots}`);
  if (maxPlayersInSnapshot < CLIENTS) throw new Error(`snapshot players below expected: ${maxPlayersInSnapshot}/${CLIENTS}`);

  for (const sock of sockets) sock.disconnect();
  console.log(`load-perf-16: ok (clients=${CLIENTS}, snapshots=${snapshots}, maxSeq=${maxSeq})`);
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 250));
  rmSync(tmp, { recursive: true, force: true });
  if (process.env.SMOKE_DEBUG === '1' && logs.length > 0) {
    console.log(logs.join(''));
  }
}
