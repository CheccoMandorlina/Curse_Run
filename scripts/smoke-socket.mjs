import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3013;
const tmp = mkdtempSync(join(tmpdir(), 'curse-run-socket-smoke-'));
const SQLITE_PATH = join(tmp, 'socket-smoke.sqlite');

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
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('Server health timeout');
}

function waitEvent(socket, event, timeoutMs = 4000, label = '') {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Event timeout: ${event}${label ? ` (${label})` : ''}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      clearTimeout(to);
      resolve(payload);
    };

    socket.once(event, onEvent);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response) => resolve(response));
  });
}

try {
  await waitForHealth(`http://127.0.0.1:${PORT}/healthz`);

  const base = `http://127.0.0.1:${PORT}`;
  const host = io(base, { transports: ['websocket'] });
  const guest = io(base, { transports: ['websocket'] });

  await Promise.all([
    new Promise((resolve) => host.on('connect', resolve)),
    new Promise((resolve) => guest.on('connect', resolve))
  ]);

  const hostCreate = await emitAck(host, 'room:create', {
    profileToken: '',
    nickname: 'SocketHost',
    deviceId: 'socket-smoke-host',
    config: { mode: 'ffa', mapId: 'ARENA_ALPHA', botFill: false, maxPlayers: 4, roundDurationSec: 90 }
  });

  if (!hostCreate?.ok || !hostCreate.roomCode) {
    throw new Error(`room:create failed: ${JSON.stringify(hostCreate)}`);
  }

  const roomCode = hostCreate.roomCode;

  const waitJoinUpdate = waitEvent(host, 'room:update', 6000, 'host room:update after guest join');
  const guestJoin = await emitAck(guest, 'room:join', {
    code: roomCode,
    profileToken: '',
    nickname: 'SocketGuest',
    deviceId: 'socket-smoke-guest'
  });
  if (!guestJoin?.ok) {
    throw new Error(`room:join failed: ${JSON.stringify(guestJoin)}`);
  }

  const roomUpdateAfterJoin = await waitJoinUpdate;
  if (!Array.isArray(roomUpdateAfterJoin.players) || roomUpdateAfterJoin.players.length < 2) {
    throw new Error('room:update missing players');
  }

  const hostUpdate = await emitAck(host, 'room:update', { config: { mode: '2v2', mapId: 'ARENA_BETA', botFill: false } });
  if (!hostUpdate?.ok) throw new Error(`room:update ack failed: ${JSON.stringify(hostUpdate)}`);

  const waitReadyUpdate = waitEvent(host, 'room:update', 6000, 'host room:update after ready');
  const hostReady = await emitAck(host, 'room:ready', { ready: true });
  const guestReady = await emitAck(guest, 'room:ready', { ready: true });
  if (!hostReady?.ok || !guestReady?.ok) {
    throw new Error(`room:ready failed: host=${JSON.stringify(hostReady)} guest=${JSON.stringify(guestReady)}`);
  }

  const afterReady = await waitReadyUpdate;
  if (!afterReady.players.some((p) => p.ready === true)) {
    throw new Error('ready status not propagated in room:update');
  }

  const waitCountdown = waitEvent(host, 'shooter:countdown', 6000, 'duo round start');
  const waitFirstState = waitEvent(host, 'shooter:state', 7000, 'duo first state');
  const startAck = await emitAck(host, 'room:start', {});
  if (!startAck?.ok) throw new Error(`room:start failed: ${JSON.stringify(startAck)}`);

  const countdown = await waitCountdown;
  if (!countdown?.roundId) throw new Error('missing countdown roundId');

  const firstState = await waitFirstState;
  if (!firstState?.roundId || !Array.isArray(firstState.players)) {
    throw new Error('invalid shooter:state payload');
  }

  for (let i = 1; i <= 4; i++) {
    host.emit('shooter:input', {
      localSeq: i,
      clientMs: Date.now() + i,
      moveX: i % 2 === 0 ? 1 : 0,
      moveY: 0,
      aimX: 400,
      aimY: 320,
      firing: i % 2 === 1,
      dashPressed: false,
      grenadePressed: false,
      meleePressed: false
    });
  }

  const nextState = await waitEvent(host, 'shooter:state', 6000, 'duo next state');
  if (!(typeof nextState.seq === 'number' && nextState.seq >= firstState.seq)) {
    throw new Error('snapshot seq not monotonic');
  }

  let rateLimitedCount = 0;
  for (let i = 0; i < 10; i++) {
    const ack = await emitAck(host, 'social:chat:send', {
      channel: 'lobby',
      message: `spam-${i}`
    });
    if (ack?.reason === 'rate_limited') rateLimitedCount += 1;
  }
  if (rateLimitedCount < 1) {
    throw new Error('chat anti-spam rate limit did not trigger');
  }

  host.disconnect();
  guest.disconnect();

  const solo = io(base, { transports: ['websocket'] });
  await new Promise((resolve) => solo.on('connect', resolve));
  let latestPlayAgainStatus = null;
  solo.on('match:playAgainStatus', (payload) => {
    latestPlayAgainStatus = payload;
  });

  const soloCreate = await emitAck(solo, 'room:create', {
    profileToken: '',
    nickname: 'SoloHost',
    deviceId: 'socket-smoke-solo',
    config: { mode: 'ffa', mapId: 'ARENA_ALPHA', botFill: false, maxPlayers: 4, roundDurationSec: 90 }
  });

  if (!soloCreate?.ok) {
    throw new Error(`solo room:create failed: ${JSON.stringify(soloCreate)}`);
  }

  const waitSoloCountdown = waitEvent(solo, 'shooter:countdown', 6000, 'solo round start');
  const soloStartAck = await emitAck(solo, 'room:start', {});
  if (!soloStartAck?.ok) {
    throw new Error(`solo room:start failed: ${JSON.stringify(soloStartAck)}`);
  }

  await waitSoloCountdown;
  const soloRoundEnd = await waitEvent(solo, 'shooter:roundEnd', 9000, 'solo round end');
  if (!soloRoundEnd?.roundId) {
    throw new Error('solo shooter:roundEnd missing roundId');
  }

  const playAgainStatus =
    latestPlayAgainStatus?.roundId === soloRoundEnd.roundId && latestPlayAgainStatus?.phase === 'post_match'
      ? latestPlayAgainStatus
      : await waitEvent(solo, 'match:playAgainStatus', 5000, 'solo post-match status');
  if (!(playAgainStatus?.humansRequired === 1 && playAgainStatus?.phase === 'post_match')) {
    throw new Error('invalid playAgainStatus in solo flow');
  }

  const waitRestartCountdown = waitEvent(solo, 'shooter:countdown', 7000, 'solo restart countdown');
  const playAgainAck = await emitAck(solo, 'match:playAgainVote', { vote: true });
  if (!playAgainAck?.ok) {
    throw new Error(`match:playAgainVote failed: ${JSON.stringify(playAgainAck)}`);
  }

  const restartCountdown = await waitRestartCountdown;
  if (!restartCountdown?.roundId || restartCountdown.roundId === soloRoundEnd.roundId) {
    throw new Error('restart countdown missing or reused roundId');
  }

  const soloRoundEnd2 = await waitEvent(solo, 'shooter:roundEnd', 9000, 'solo round end after playAgainVote');
  if (!soloRoundEnd2?.roundId || soloRoundEnd2.roundId === soloRoundEnd.roundId) {
    throw new Error('second solo round did not complete with a distinct roundId');
  }

  const waitAliasRestart = waitEvent(solo, 'shooter:countdown', 7000, 'solo restart via rematch alias');
  solo.emit('match:rematchVote');
  const aliasRestartCountdown = await waitAliasRestart;
  if (!aliasRestartCountdown?.roundId || aliasRestartCountdown.roundId === soloRoundEnd2.roundId) {
    throw new Error('rematch alias did not trigger a new countdown');
  }

  const leaveAck = await emitAck(solo, 'room:leave', {});
  if (!leaveAck?.ok) {
    throw new Error(`room:leave failed: ${JSON.stringify(leaveAck)}`);
  }

  const startAfterLeave = await emitAck(solo, 'room:start', {});
  if (startAfterLeave?.ok || startAfterLeave?.reason !== 'room_not_found') {
    throw new Error(`room:start after leave should fail with room_not_found: ${JSON.stringify(startAfterLeave)}`);
  }

  solo.disconnect();

  console.log('socket-smoke: ok');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 200));
  rmSync(tmp, { recursive: true, force: true });

  if (process.env.SMOKE_DEBUG === '1' && logs.length > 0) {
    console.log(logs.join(''));
  }
}
