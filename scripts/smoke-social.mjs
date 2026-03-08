import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = Number(process.env.SOCIAL_SMOKE_PORT ?? 3023);
const tmp = mkdtempSync(join(tmpdir(), 'curse-run-social-smoke-'));
const SQLITE_PATH = join(tmp, 'social-smoke.sqlite');

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
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 140));
  }
  throw new Error('Server health timeout');
}

async function post(path, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

async function get(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, (resp) => resolve(resp)));
}

function waitEvent(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      socket.off(event, onEvt);
      reject(new Error(`event timeout: ${event}`));
    }, timeoutMs);
    const onEvt = (payload) => {
      clearTimeout(to);
      resolve(payload);
    };
    socket.once(event, onEvt);
  });
}

try {
  await waitForHealth(`http://127.0.0.1:${PORT}/healthz`);

  const regA = await post('/api/auth/register', { email: 'alpha@cr.test', password: 'secret123', nickname: 'Alpha' });
  const regB = await post('/api/auth/register', { email: 'bravo@cr.test', password: 'secret123', nickname: 'Bravo' });
  assert(regA.ok && regB.ok, 'register failed');
  const sessionA = regA.body.sessionToken;
  const sessionB = regB.body.sessionToken;
  const userA = regA.body.user?.id;
  const userB = regB.body.user?.id;
  assert(sessionA && sessionB && userA && userB, 'register payload invalid');

  const addFriend = await post('/api/social/friends', { sessionToken: sessionA, friendId: userB, action: 'add' });
  assert(addFriend.ok, 'friend add failed');
  const friendsA = await get(`/api/social/friends?sessionToken=${encodeURIComponent(sessionA)}`);
  assert(friendsA.ok && Array.isArray(friendsA.body.items), 'friends list failed');
  assert(friendsA.body.items.some((f) => f.id === userB), 'friend missing after add');

  const block = await post('/api/social/friends', { sessionToken: sessionA, friendId: userB, action: 'block' });
  assert(block.ok, 'block failed');
  const unblock = await post('/api/social/friends', { sessionToken: sessionA, friendId: userB, action: 'unblock' });
  assert(unblock.ok, 'unblock failed');
  const reAddFriend = await post('/api/social/friends', { sessionToken: sessionA, friendId: userB, action: 'add' });
  assert(reAddFriend.ok, 'friend re-add failed');
  const mute = await post('/api/social/friends', { sessionToken: sessionA, friendId: userB, action: 'mute' });
  assert(mute.ok, 'mute failed');
  const unmute = await post('/api/social/friends', { sessionToken: sessionA, friendId: userB, action: 'unmute' });
  assert(unmute.ok, 'unmute failed');

  const report = await post('/api/social/report', {
    sessionToken: sessionA,
    targetUserId: userB,
    reason: 'abuse_test',
    messageSample: 'sample'
  });
  assert(report.ok, 'chat report failed');

  const clanCreate = await post('/api/clans/create', { sessionToken: sessionA, name: 'SmokeClan' });
  assert(clanCreate.ok && clanCreate.body.clanId, 'clan create failed');
  const clanId = clanCreate.body.clanId;
  const clanJoin = await post('/api/clans/join', { sessionToken: sessionB, clanId });
  assert(clanJoin.ok, 'clan join failed');
  const roster = await get(`/api/clans/roster?sessionToken=${encodeURIComponent(sessionA)}&clanId=${encodeURIComponent(clanId)}`);
  assert(roster.ok && roster.body?.roster?.members?.length === 2, 'clan roster invalid');
  const clanLeaveB = await post('/api/clans/leave', { sessionToken: sessionB });
  assert(clanLeaveB.ok, 'clan leave member failed');
  const clanLeaveA = await post('/api/clans/leave', { sessionToken: sessionA });
  assert(clanLeaveA.ok, 'clan leave owner failed');

  const rankedProfile = await get(`/api/ranked/profile?sessionToken=${encodeURIComponent(sessionA)}`);
  assert(rankedProfile.ok && rankedProfile.body?.profile?.rankTier, 'ranked profile failed');
  const rankedBoard = await get('/api/ranked/leaderboard?limit=10');
  assert(rankedBoard.ok && Array.isArray(rankedBoard.body.items), 'ranked leaderboard failed');

  const tourList = await get('/api/tournaments?limit=10');
  assert(tourList.ok && Array.isArray(tourList.body.items), 'tournaments list failed');
  const customTour = await post('/api/tournaments/create', { sessionToken: sessionA, name: 'Smoke Cup', maxEntrants: 8 });
  assert(customTour.ok && customTour.body.tournamentId, 'custom tournament create failed');
  const tourJoin = await post('/api/tournaments/join', { sessionToken: sessionB, tournamentId: customTour.body.tournamentId });
  assert(tourJoin.ok, 'custom tournament join failed');
  const tourRoster = await get(`/api/tournaments/roster?tournamentId=${encodeURIComponent(customTour.body.tournamentId)}`);
  assert(tourRoster.ok && tourRoster.body.items.length >= 2, 'tournament roster invalid');

  const socketA = io(`http://127.0.0.1:${PORT}`, { transports: ['websocket'] });
  const socketB = io(`http://127.0.0.1:${PORT}`, { transports: ['websocket'] });
  await Promise.all([new Promise((r) => socketA.on('connect', r)), new Promise((r) => socketB.on('connect', r))]);

  await emitAck(socketA, 'social:session:bind', { sessionToken: sessionA });
  await emitAck(socketB, 'social:session:bind', { sessionToken: sessionB });

  const createRoom = await emitAck(socketA, 'room:create', {
    profileToken: '',
    nickname: 'Alpha',
    deviceId: 'social-smoke-a',
    sessionToken: sessionA,
    config: { mode: 'lms_ffa', mapId: 'ARENA_ALPHA', botFill: false, maxPlayers: 4, roundDurationSec: 90 }
  });
  assert(createRoom?.ok && createRoom.roomCode, 'socket room create failed');
  const joinRoom = await emitAck(socketB, 'room:join', {
    code: createRoom.roomCode,
    profileToken: '',
    nickname: 'Bravo',
    deviceId: 'social-smoke-b',
    sessionToken: sessionB
  });
  assert(joinRoom?.ok, 'socket room join failed');

  const inviteWait = waitEvent(socketB, 'social:friend:invite', 5000);
  const inviteAck = await emitAck(socketA, 'social:friend:invite', { sessionToken: sessionA, friendId: userB, roomCode: createRoom.roomCode });
  assert(inviteAck?.ok, 'friend invite failed');
  const inviteEvt = await inviteWait;
  assert(inviteEvt?.roomCode === createRoom.roomCode, 'friend invite payload invalid');

  const chatWait = waitEvent(socketB, 'social:chat:receive', 5000);
  const chatAck = await emitAck(socketA, 'social:chat:send', {
    sessionToken: sessionA,
    channel: 'lobby',
    message: 'hate spamlink test'
  });
  assert(chatAck?.ok, 'chat send failed');
  const chatEvt = await chatWait;
  assert(typeof chatEvt?.message === 'string' && chatEvt.message.includes('***'), 'chat keyword filter not applied');

  let rateLimited = false;
  for (let i = 0; i < 10; i++) {
    const ack = await emitAck(socketA, 'social:chat:send', {
      sessionToken: sessionA,
      channel: 'lobby',
      message: `spam-${i}`
    });
    if (ack?.reason === 'rate_limited') {
      rateLimited = true;
      break;
    }
  }
  assert(rateLimited, 'chat rate limit not triggered');

  socketA.disconnect();
  socketB.disconnect();
  console.log('smoke-social: ok');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 250));
  rmSync(tmp, { recursive: true, force: true });
  if (process.env.SMOKE_DEBUG === '1' && logs.length > 0) {
    console.log(logs.join(''));
  }
}
