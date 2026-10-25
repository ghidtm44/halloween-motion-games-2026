import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(done => setTimeout(done, ms));
async function fixture(t, savedSettings) {
  const directory = await mkdtemp(resolve(tmpdir(), 'halloween-server-'));
  const dist = resolve(directory, 'dist');
  const stateFile = resolve(directory, 'runtime-state.json');
  if (savedSettings) await writeFile(stateFile, JSON.stringify(savedSettings));
  await mkdir(resolve(dist, 'wasm'), { recursive: true });
  await mkdir(resolve(dist, 'models'), { recursive: true });
  await writeFile(resolve(dist, 'index.html'), '<!doctype html><title>Local playground</title>');
  for (const file of ['wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_nosimd_internal.wasm', 'wasm/vision_wasm_nosimd_internal.js', 'models/pose_landmarker_lite.task']) await writeFile(resolve(dist, file), 'test asset');
  let child;
  const sockets = new Set();
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', PLAYGROUND_DIST: dist, PLAYGROUND_STATE_FILE: stateFile }, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr.on('data', data => { errors += data.toString(); });
    return new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Server did not start: ${errors}`)), 5000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
      child.stdout.on('data', data => { const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(data.toString()); if (match) { clearTimeout(timeout); done(Number(match[1])); } });
    });
  }
  async function stop() {
    for (const socket of sockets) socket.terminate();
    sockets.clear();
    if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  }
  let port = await start();
  const connection = async (role, options = {}) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/sync`, options);
    sockets.add(socket);
    const messages = [], pending = [];
    socket.on('message', data => {
      const value = JSON.parse(data.toString());
      const index = pending.findIndex(item => item.predicate(value));
      if (index >= 0) { const waiter = pending.splice(index, 1)[0]; clearTimeout(waiter.timeout); waiter.done(value); } else messages.push(value);
    });
    socket.on('error', () => {});
    await once(socket, 'open');
    const peer = { socket, messages, send: value => socket.send(JSON.stringify(value)), next: (predicate = () => true) => {
      const index = messages.findIndex(predicate);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((done, reject) => {
        const waiter = { predicate, done, timeout: null };
        waiter.timeout = setTimeout(() => { const i = pending.indexOf(waiter); if (i >= 0) pending.splice(i, 1); reject(new Error('Expected server message was not received.')); }, 2500);
        pending.push(waiter);
      });
    }, close: async () => { if (socket.readyState === WebSocket.CLOSED) return; const closed = once(socket, 'close'); socket.close(); await closed; } };
    if (role) peer.send({ type: 'hello', role, clientId: `${role}-${Math.random()}` });
    return peer;
  };
  t.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  return { connection, dist, directory, stateFile, get port() { return port; }, get url() { return `http://127.0.0.1:${port}`; }, restart: async () => { await stop(); port = await start(); } };
}
const isState = message => message.type === 'state';
const rawGet = (port, path, headers = {}) => new Promise((done, reject) => {
  const req = request({ hostname: '127.0.0.1', port, path, headers }, res => { let body = ''; res.on('data', data => { body += data.toString(); }); res.on('end', () => done({ status: res.statusCode, headers: res.headers, body })); });
  req.on('error', reject); req.end();
});

test('authoritative settings reach both windows and reconnect snapshots', async t => {
  const f = await fixture(t), admin = await f.connection('admin');
  const initial = (await admin.next(isState)).state;
  assert.equal(initial.settings.cameraOn, false);
  assert.equal(initial.settings.demo, true);
  const player = await f.connection('player');
  assert.equal((await player.next(message => message.type === 'role')).active, true);
  await player.next(isState); await admin.next(isState);
  admin.send({ type: 'patch', patch: { scene: 'enchanted', sensitivity: 1.5, cameraOn: true, demo: false } });
  const playerState = (await player.next(isState)).state;
  assert.deepEqual(playerState, (await admin.next(isState)).state);
  assert.equal(playerState.settings.scene, 'enchanted');
  assert.equal(playerState.playerConnected, true);
  assert.ok(playerState.revision > initial.revision);
  const reconnect = await f.connection('admin');
  assert.deepEqual((await reconnect.next(isState)).state, playerState);
  assert.deepEqual((await (await fetch(`${f.url}/api/state`)).json()).settings, playerState.settings);
});

test('corn maze controls synchronize to every window and reconnect with a round snapshot', async t => {
  const f = await fixture(t), admin = await f.connection('admin');
  const initial = (await admin.next(isState)).state;
  assert.equal(initial.settings.gameRound, 0);
  assert.equal(initial.settings.gamePractice, false);
  const player = await f.connection('player'); await player.next(isState); await admin.next(isState);
  admin.send({ type: 'patch', patch: { scene: 'cornmaze', gamePractice: true, gameRound: 1 } });
  const started = (await player.next(isState)).state;
  assert.deepEqual((await admin.next(isState)).state, started);
  assert.equal(started.settings.scene, 'cornmaze');
  assert.equal(started.settings.gameRound, 1);
  assert.equal(started.settings.gamePractice, true);
  admin.send({ type: 'patch', patch: { gameRound: 2 } });
  const reset = (await player.next(isState)).state;
  assert.deepEqual((await admin.next(isState)).state, reset);
  assert.equal(reset.settings.gameRound, 2);
  assert.equal(reset.revision, started.revision + 1);
  // Re-sending the current reset token is idempotent, including across reconnects.
  admin.send({ type: 'patch', patch: { gameRound: 2 } });
  assert.deepEqual((await admin.next(isState)).state, reset);
  const reconnected = await f.connection('admin');
  assert.deepEqual((await reconnected.next(isState)).state, reset);
  assert.equal(reconnected.messages.filter(message => message.type === 'effect').length, 0);
  player.send({ type: 'patch', patch: { gameRound: 3 } });
  await player.next(message => message.type === 'error');
  player.send({ type: 'patch', patch: { gamePractice: false } });
  await player.next(message => message.type === 'error');
  const settings = (await (await fetch(`${f.url}/api/state`)).json()).settings;
  assert.equal(settings.gameRound, 2);
  assert.equal(settings.gamePractice, true);
  await player.close();
  const playerReconnected = await f.connection('player');
  const recovered = (await playerReconnected.next(isState)).state;
  assert.deepEqual(recovered.settings, settings);
  assert.equal(recovered.status, null);
  assert.equal(playerReconnected.messages.filter(message => message.type === 'effect').length, 0);
});

test('invalid corn maze controls are rejected atomically', async t => {
  const f = await fixture(t), admin = await f.connection('admin'); await admin.next(isState);
  for (const gameRound of [-1, 0.5, 1_000_000_000_001, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
    admin.send({ type: 'patch', patch: { scene: 'cornmaze', gameRound } });
    assert.match((await admin.next(message => message.type === 'error')).message, /Invalid settings/);
  }
  admin.send({ type: 'patch', patch: { scene: 'cornmaze', gamePractice: 'true' } });
  await admin.next(message => message.type === 'error');
  const settings = (await (await fetch(`${f.url}/api/state`)).json()).settings;
  assert.equal(settings.scene, 'pumpkin');
  assert.equal(settings.gameRound, 0);
  assert.equal(settings.gamePractice, false);
  admin.send({ type: 'patch', patch: { gameRound: 1_000_000_000_000 } });
  assert.equal((await admin.next(isState)).state.settings.gameRound, 1_000_000_000_000);
});

test('invalid or unauthorized settings are rejected without partial mutation', async t => {
  const f = await fixture(t), admin = await f.connection('admin');
  await admin.next(isState);
  admin.send({ type: 'patch', patch: { scene: 'midnight', sensitivity: 1000 } });
  assert.match((await admin.next(message => message.type === 'error')).message, /Invalid settings/);
  admin.send({ type: 'patch', patch: { modelUrl: 'https://example.com/model' } });
  await admin.next(message => message.type === 'error');
  admin.send({ type: 'patch', patch: JSON.parse('{"__proto__":{"cameraOn":true}}') });
  await admin.next(message => message.type === 'error');
  admin.socket.send('not json'); await admin.next(message => message.type === 'error');
  const player = await f.connection('player'); await player.next(isState);
  player.send({ type: 'patch', patch: { cameraOn: true, scene: 'midnight' } }); await player.next(message => message.type === 'error');
  player.send({ type: 'effect', kind: 'candy' }); await player.next(message => message.type === 'error');
  const state = await (await fetch(`${f.url}/api/state`)).json();
  assert.equal(state.settings.scene, 'pumpkin');
  assert.equal(state.settings.cameraOn, false);
  assert.equal(state.settings.sensitivity, 1);
});

test('active player can start its camera but standby player cannot change camera settings', async t => {
  const f = await fixture(t), player = await f.connection('player'); await player.next(isState);
  player.send({ type: 'patch', patch: { cameraOn: true, demo: false, paused: false } });
  const started = (await player.next(isState)).state;
  assert.equal(started.settings.cameraOn, true); assert.equal(started.settings.demo, false);
  const standby = await f.connection('player'); await standby.next(isState);
  standby.send({ type: 'patch', patch: { cameraOn: false } }); await standby.next(message => message.type === 'error');
  assert.equal((await (await fetch(`${f.url}/api/state`)).json()).settings.cameraOn, true);
});

test('active player camera gesture can leave practice but cannot otherwise control practice', async t => {
  const f = await fixture(t), admin = await f.connection('admin'); await admin.next(isState);
  const player = await f.connection('player'); await player.next(isState); await admin.next(isState);
  admin.send({ type: 'patch', patch: { scene: 'cornmaze', gamePractice: true } });
  await admin.next(isState); await player.next(isState);
  player.send({ type: 'patch', patch: { gamePractice: false } });
  await player.next(message => message.type === 'error');
  player.send({ type: 'patch', patch: { cameraOn: true, gamePractice: true } });
  await player.next(message => message.type === 'error');
  assert.equal((await (await fetch(`${f.url}/api/state`)).json()).settings.gamePractice, true);
  player.send({ type: 'patch', patch: { cameraOn: true, gamePractice: false, demo: false, paused: false } });
  const started = (await player.next(isState)).state;
  assert.deepEqual((await admin.next(isState)).state, started);
  assert.equal(started.settings.cameraOn, true); assert.equal(started.settings.gamePractice, false); assert.equal(started.settings.demo, false);
  const standby = await f.connection('player'); await standby.next(isState);
  standby.send({ type: 'patch', patch: { cameraOn: true, gamePractice: false } });
  await standby.next(message => message.type === 'error');
});

test('only one player can report status, with standby promotion on disconnect', async t => {
  const f = await fixture(t), admin = await f.connection('admin'); await admin.next(isState);
  const first = await f.connection('player');
  assert.equal((await first.next(message => message.type === 'role')).active, true); await first.next(isState);
  const standby = await f.connection('player');
  assert.equal((await standby.next(message => message.type === 'role')).active, false); await standby.next(isState);
  standby.send({ type: 'status', status: { people: 3 } }); await standby.next(message => message.type === 'error');
  first.send({ type: 'status', status: { people: 3, fps: 29.9, inferenceMs: 18, camera: 'Camera active', fullscreen: true, devices: [{ label: 'Webcam', deviceId: 'local-device' }], preview: 'https://untrusted/image.jpg' } });
  const status = (await admin.next(message => message.type === 'status')).status;
  assert.equal(status.people, 3); assert.equal(status.fullscreen, true); assert.equal(status.devices[0].deviceId, 'local-device'); assert.equal(status.preview, undefined);
  await first.close();
  assert.equal((await standby.next(message => message.type === 'role' && message.active)).active, true);
  const promoted = (await standby.next(isState)).state;
  assert.equal(promoted.playerConnected, true); assert.equal(promoted.status, null);
  standby.send({ type: 'status', status: { people: 1, fps: 30 } });
  assert.equal((await admin.next(message => message.type === 'status')).status.people, 1);
  await standby.close(); await admin.next(message => isState(message) && !message.state.playerConnected);
});

test('game status is bounded, validated, owner-only, and cleared on player replacement', async t => {
  const f = await fixture(t), admin = await f.connection('admin'); await admin.next(isState);
  const player = await f.connection('player'); await player.next(isState);
  const game = { room: 'Pumpkin patch', phase: 'choose', collected: 4, goal: 6, bonus: 1, practice: true, message: 'Reach for a path.' };
  player.send({ type: 'status', status: { camera: 'Camera active', game } });
  assert.deepEqual((await admin.next(message => message.type === 'status')).status.game, game);
  const reconnected = await f.connection('admin');
  assert.deepEqual((await reconnected.next(isState)).state.status.game, game);
  admin.send({ type: 'status', status: { game: { ...game, collected: 6 } } });
  await admin.next(message => message.type === 'error');
  const standby = await f.connection('player'); await standby.next(isState);
  standby.send({ type: 'status', status: { game: { ...game, collected: 6 } } });
  await standby.next(message => message.type === 'error');
  player.send({ type: 'status', status: { game: { ...game, room: 'r'.repeat(1000), message: 'm'.repeat(10000), maze: ['untrusted large state'], hands: [{ x: 0, y: 0 }] } } });
  const bounded = (await admin.next(message => message.type === 'status')).status.game;
  assert.equal(bounded.room.length, 80); assert.equal(bounded.message.length, 320);
  assert.deepEqual(Object.keys(bounded).sort(), Object.keys(game).sort());
  for (const invalid of [{ phase: 'teleport' }, { collected: 7 }, { collected: -1 }, { collected: 0.5 }, { goal: 10 }, { bonus: 3 }, { bonus: -1 }, { practice: 1 }, { room: [] }, { message: null }]) {
    player.send({ type: 'status', status: { camera: 'Camera active', game: { ...game, ...invalid } } });
    const status = (await admin.next(message => message.type === 'status')).status;
    assert.equal(status.game, undefined);
    assert.equal(status.camera, 'Camera active');
  }
  player.send({ type: 'status', status: { game: { ...game, phase: 'won', collected: 6, bonus: 2 } } });
  assert.equal((await admin.next(message => message.type === 'status')).status.game.phase, 'won');
  await player.close();
  const replacement = (await standby.next(message => isState(message) && message.state.status === null)).state;
  assert.equal(replacement.playerConnected, true);
  assert.equal(replacement.status, null);
});

test('effects have unique IDs, arrive once per client, and never replay on reconnect', async t => {
  const f = await fixture(t), admin = await f.connection('admin'); await admin.next(isState);
  const player = await f.connection('player'); await player.next(isState);
  admin.send({ type: 'effect', kind: 'magic' });
  const a = await admin.next(message => message.type === 'effect'), p = await player.next(message => message.type === 'effect');
  assert.deepEqual(a, p); assert.equal(a.event.kind, 'magic'); assert.match(a.event.id, /^[0-9a-f-]{36}$/); assert.ok(Math.abs(Date.now() - a.event.at) < 5000);
  admin.send({ type: 'effect', kind: 'bats' });
  const second = await admin.next(message => message.type === 'effect'); await player.next(message => message.type === 'effect');
  assert.notEqual(second.event.id, a.event.id);
  await player.close();
  const reconnected = await f.connection('player'); await reconnected.next(isState); await delay(100);
  assert.equal(reconnected.messages.filter(message => message.type === 'effect').length, 0);
  assert.equal(admin.messages.filter(message => message.type === 'effect').length, 0);
});

test('settings persist but restarting always restores camera-off demo mode', async t => {
  const f = await fixture(t), admin = await f.connection('admin'); await admin.next(isState);
  admin.send({ type: 'patch', patch: { scene: 'midnight', deviceId: 'camera-test', cameraOn: true, demo: false } }); await admin.next(isState);
  await f.restart();
  const state = await (await fetch(`${f.url}/api/state`)).json();
  assert.equal(state.settings.scene, 'midnight'); assert.equal(state.settings.deviceId, 'camera-test'); assert.equal(state.settings.cameraOn, false); assert.equal(state.settings.demo, true); assert.equal(state.playerConnected, false);
  assert.equal(JSON.parse(await readFile(f.stateFile, 'utf8')).cameraOn, false);
});

test('v1 saved settings merge the game defaults and game controls survive a server restart', async t => {
  const old = { scene: 'enchanted', deviceId: 'old-webcam', cameraOn: true, demo: false, mirror: false, motion: true, mode: 'cutout', quality: 'balanced', sensitivity: 1.25, paused: true };
  const f = await fixture(t, old), admin = await f.connection('admin');
  const initial = (await admin.next(isState)).state;
  assert.equal(initial.settings.scene, 'enchanted');
  assert.equal(initial.settings.deviceId, 'old-webcam');
  assert.equal(initial.settings.mirror, false);
  assert.equal(initial.settings.gameRound, 0);
  assert.equal(initial.settings.gamePractice, false);
  assert.equal(initial.settings.cameraOn, false);
  assert.equal(initial.settings.demo, true);
  assert.equal(initial.settings.paused, false);
  admin.send({ type: 'patch', patch: { scene: 'cornmaze', gameRound: 81, gamePractice: true } }); await admin.next(isState);
  await f.restart();
  const state = await (await fetch(`${f.url}/api/state`)).json();
  assert.equal(state.settings.scene, 'cornmaze');
  assert.equal(state.settings.gameRound, 81);
  assert.equal(state.settings.gamePractice, true);
  assert.equal(state.status, null);
  assert.equal(state.playerConnected, false);
  assert.equal(state.settings.cameraOn, false);
  assert.equal(state.settings.demo, true);
});

test('static serving blocks traversal, symlinks and remote origins and reports local assets', async t => {
  const f = await fixture(t);
  const health = await (await fetch(`${f.url}/api/health`)).json();
  assert.equal(health.offlineAssetsReady, true);
  assert.equal(health.version, '1.1.0');
  const wasm = await fetch(`${f.url}/wasm/vision_wasm_internal.wasm`);
  assert.equal(wasm.headers.get('content-type'), 'application/wasm'); assert.match(wasm.headers.get('content-security-policy'), /frame-ancestors 'none'/); assert.equal(wasm.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(`${f.url}/models/pose_landmarker_lite.task`)).headers.get('content-type'), 'application/octet-stream');
  assert.equal((await fetch(`${f.url}/player`)).status, 200); assert.equal((await fetch(`${f.url}/admin`)).status, 200);
  assert.equal((await rawGet(f.port, '/%2e%2e/runtime-state.json')).status, 400);
  assert.equal((await rawGet(f.port, '/%2e%2e%2fruntime-state.json')).status, 400);
  assert.equal((await rawGet(f.port, '/%E0%A4%A')).status, 400);
  assert.equal((await rawGet(f.port, '/', { Host: `evil.example:${f.port}` })).status, 403);
  assert.equal((await rawGet(f.port, '/', { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await fetch(`${f.url}/api/state`, { method: 'POST' })).status, 405);
  await writeFile(resolve(f.directory, 'outside.txt'), 'private'); await symlink(resolve(f.directory, 'outside.txt'), resolve(f.dist, 'escape.txt'));
  assert.equal((await fetch(`${f.url}/escape.txt`)).status, 403);
  await rm(resolve(f.dist, 'models/pose_landmarker_lite.task'));
  const missing = await (await fetch(`${f.url}/api/health`)).json(); assert.equal(missing.offlineAssetsReady, false); assert.deepEqual(missing.missingAssets, ['models/pose_landmarker_lite.task']);
});

test('websocket upgrade rejects a foreign origin and large messages are closed', async t => {
  const f = await fixture(t);
  const foreign = new WebSocket(`ws://127.0.0.1:${f.port}/sync`, { origin: 'https://evil.example' }); foreign.on('error', () => {});
  const response = await new Promise(done => foreign.on('unexpected-response', (_req, res) => { res.resume(); done(res); foreign.terminate(); })); assert.equal(response.statusCode, 403);
  const admin = await f.connection('admin'); await admin.next(isState);
  const closed = once(admin.socket, 'close'); admin.socket.send('x'.repeat(512001)); assert.equal((await closed)[0], 1009);
});
