import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir, stat, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createHostSession } from './host-session.mjs';

const appRoot = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SETTINGS = Object.freeze({ scene: 'jungle', deviceId: '', cameraOn: false, demo: true, mirror: true, motion: true, mode: 'cutout', quality: 'balanced', sensitivity: 1, playDensity: 0.5, musicVolume: 0.3, musicMuted: false, paused: false, hostAdultMode: false, hostEffects: 0.4, hostEffectsBypass: false, hostVolume: 0.8, hostMuted: false, hostCaptions: true, hostControlMode: 'auto', hostTone: 0 });
const validators = {
  scene: value => ['jungle', 'depths', 'space', 'spooky'].includes(value),
  deviceId: value => typeof value === 'string' && value.length <= 512,
  cameraOn: value => typeof value === 'boolean',
  demo: value => typeof value === 'boolean',
  mirror: value => typeof value === 'boolean',
  motion: value => typeof value === 'boolean',
  mode: value => ['cutout', 'camera', 'silhouette'].includes(value),
  quality: value => ['balanced', 'performance'].includes(value),
  playDensity: value => Number.isFinite(value) && value >= 0 && value <= 1,
  musicVolume: value => Number.isFinite(value) && value >= 0 && value <= 1,
  musicMuted: value => typeof value === 'boolean',
  sensitivity: value => Number.isFinite(value) && value >= 0.25 && value <= 2.5,
  paused: value => typeof value === 'boolean',
  hostAdultMode: value => typeof value === 'boolean',
  hostTone: value => Number.isInteger(value) && value >= 0 && value <= 100,
  hostEffects: value => Number.isFinite(value) && value >= 0 && value <= 1,
  hostEffectsBypass: value => typeof value === 'boolean',
  hostVolume: value => Number.isFinite(value) && value >= 0 && value <= 1,
  hostMuted: value => typeof value === 'boolean',
  hostCaptions: value => typeof value === 'boolean',
  hostControlMode: value => ['operator', 'auto'].includes(value),
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validPatch = patch => object(patch) && Object.entries(patch).every(([key, value]) => Object.hasOwn(validators, key) && validators[key](value));
const shortString = (value, max = 500) => typeof value === 'string' ? value.slice(0, max) : '';
const finite = (value, max) => Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
function cleanStatus(value) {
  if (!object(value)) return null;
  const status = {
    camera: shortString(value.camera), model: shortString(value.model),
    people: Math.round(finite(value.people, 3)), fps: finite(value.fps, 240),
    inferenceMs: finite(value.inferenceMs, 60000), fullscreen: value.fullscreen === true,
    hostCaption: shortString(value.hostCaption), hostNotice: shortString(value.hostNotice), hostVoiceEnabled: value.hostVoiceEnabled === true,
    musicReady: value.musicReady === true,
    fallback: shortString(value.fallback), error: shortString(value.error, 1000),
    devices: Array.isArray(value.devices) ? value.devices.slice(0, 64).filter(object).map(device => ({ deviceId: shortString(device.deviceId, 512), label: shortString(device.label, 256) })) : [],
  };
  if (validators.scene(value.scene)) status.scene = value.scene;
  if (typeof value.preview === 'string' && value.preview.length <= 400000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value.preview)) status.preview = value.preview;
  return status;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.woff2': 'font/woff2' };

export async function createPlaygroundServer({ port = Number(process.env.PORT || 4318), dist = process.env.PLAYGROUND_DIST || resolve(appRoot, 'dist'), stateFile = process.env.PLAYGROUND_STATE_FILE || resolve(appRoot, 'data/runtime-state.json'), heartbeatMs = 15000, hostOptions = {}, motionOnly = process.env.PLAYGROUND_EDITION === 'motion' } = {}) {
  dist = resolve(dist);
  const state = { motionOnly, revision: 0, settings: { ...DEFAULT_SETTINGS }, playerConnected: false, status: null };
  try {
    const saved = JSON.parse(await readFile(stateFile, 'utf8'));
    if (object(saved) && ['pumpkin','enchanted','midnight'].includes(saved.scene)) saved.scene='jungle';
    if (validPatch(saved)) {
      Object.assign(state.settings, saved);
      // One-time upgrade to the new automatic performance. It still needs Start.
      if (!Object.hasOwn(saved, 'hostTone')) state.settings.hostControlMode = 'auto';
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Saved settings could not be read; using safe defaults.');
  }
  // Starting the server must never activate a webcam without a new local action.
  if(motionOnly && state.settings.scene==='spooky')state.settings.scene='jungle';
  state.settings.hostAdultMode = false;
  state.settings.cameraOn = false;
  state.settings.demo = true;
  state.settings.paused = false;
  let saveQueue = Promise.resolve();
  function persist() {
    const saved = JSON.stringify({ ...state.settings, hostAdultMode: false, cameraOn: false, demo: true }, null, 2) + '\n';
    saveQueue = saveQueue.then(async () => {
      await mkdir(dirname(stateFile), { recursive: true, mode: 0o700 });
      const temp = `${stateFile}.${process.pid}.tmp`;
      await writeFile(temp, saved, { mode: 0o600 });
      await rename(temp, stateFile);
    }).catch(() => console.warn('Settings could not be saved. The current session still works.'));
  }
  let activePlayer = null;
  let actualPort = port;
  const clients = new Map();
  const allowedHosts = () => new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
  function trusted(req) {
    const address = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || !allowedHosts().has(req.headers.host)) return false;
    if (req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        if (origin.protocol !== 'http:' || !allowedHosts().has(origin.host) || origin.username || origin.password || origin.pathname !== '/') return false;
      } catch { return false; }
    }
    return true;
  }
  function headers(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    res.setHeader('Cache-Control', 'no-store');
  }
  function json(res, code, value) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  }
  const server = createServer(async (req, res) => {
    headers(res);
    if (!trusted(req)) return json(res, 403, { error: 'Only same-origin local access is allowed.' });
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
    try {
      let pathname;
      try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); } catch { return json(res, 400, { error: 'Invalid URL.' }); }
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) return json(res, 400, { error: 'Invalid path.' });
      if (pathname === '/api/state') return json(res, 200, state);
      if (pathname === '/api/health') {
        const assets = ['models/pose_landmarker_lite.task', 'wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_nosimd_internal.wasm', 'wasm/vision_wasm_nosimd_internal.js'];
        const checks = await Promise.all(assets.map(async asset => { try { return (await stat(resolve(dist, asset))).size > 0; } catch { return false; } }));
        return json(res, 200, { ok: true, edition: 'simple-v1', version: '1.0.1', spookyHost: !motionOnly, motionGames: motionOnly, localOnly: true, offlineAssetsReady: checks.every(Boolean), missingAssets: assets.filter((_, i) => !checks[i]), playerConnected: state.playerConnected });
      }
      if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found.' });
      const route = ['/', '/admin', '/player'].includes(pathname) ? '/index.html' : pathname;
      const candidate = resolve(dist, '.' + route);
      if (candidate !== dist && !candidate.startsWith(dist + sep)) return json(res, 403, { error: 'Invalid path.' });
      let path;
      try {
        path = await realpath(candidate);
        const root = await realpath(dist);
        if (path !== root && !path.startsWith(root + sep)) return json(res, 403, { error: 'Invalid path.' });
      } catch { return json(res, 404, { error: 'Build the app first with npm run build.' }); }
      const data = await readFile(path);
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream', 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { json(res, 500, { error: 'Unable to serve that file.' }); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512000, perMessageDeflate: false });
  function send(ws, payload) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 2_000_000) { ws.terminate(); return; }
    ws.send(JSON.stringify(payload));
  }
  const broadcast = payload => { for (const [ws, client] of clients) if (client.role) send(ws, payload); };
  const broadcastState = () => broadcast({ type: 'state', state });
  const host = createHostSession({
    options: motionOnly ? { ...hostOptions, apiKey: '' } : hostOptions,
    onChange: () => { if(state.host)state.settings.hostAdultMode=state.host.adultMode===true;state.revision++; broadcastState(); },
    onResult: result => { if (activePlayer) send(activePlayer, result); },
    onRejected: result => { if (activePlayer) send(activePlayer, result); },
  });
  state.host = host.state;
  host.setControlMode(state.settings.hostControlMode);
  host.setTone(state.settings.hostTone);
  function choosePlayer() {
    const prior = activePlayer;
    if (!activePlayer || !clients.has(activePlayer)) activePlayer = [...clients].find(([, value]) => value.role === 'player')?.[0] || null;
    if (prior !== activePlayer) {
      state.status = null;
      if (host.state.active) host.stop('Player changed. Start a new host session explicitly.');
    }
    const connected = Boolean(activePlayer);
    if (connected !== state.playerConnected || prior !== activePlayer) state.revision++;
    state.playerConnected = connected;
    for (const [ws, client] of clients) if (client.role === 'player') send(ws, { type: 'role', active: ws === activePlayer });
  }
  server.on('upgrade', (req, socket, head) => {
    if (!trusted(req) || req.url !== '/sync') { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', ws => {
    const client = { role: null, clientId: null, alive: true };
    clients.set(ws, client);
    const helloTimeout = setTimeout(() => { if (!client.role) ws.close(1008, 'Identify the local client first.'); }, 5000);
    helloTimeout.unref();
    ws.on('pong', () => { client.alive = true; });
    ws.on('error', () => {});
    ws.on('message', (data, binary) => {
      let message;
      try { if (binary) throw new Error(); message = JSON.parse(data.toString()); } catch { send(ws, { type: 'error', message: 'Invalid message.' }); return; }
      if (!object(message)) return send(ws, { type: 'error', message: 'Invalid message.' });
      if (!client.role) {
        if (message.type !== 'hello' || !['admin', 'player'].includes(message.role) || typeof message.clientId !== 'string' || !message.clientId.length || message.clientId.length > 128) return ws.close(1008, 'Identify the local client first.');
        clearTimeout(helloTimeout);
        client.role = message.role;
        client.clientId = message.clientId;
        choosePlayer();
        broadcastState();
        return;
      }
      if(motionOnly && (String(message.type).startsWith('host-') || message.patch?.scene==='spooky'))return send(ws,{type:'error',message:'This is the offline Motion Games app. Open the separate Spooky Host app for the oracle.'});
      const playerCameraPatch = ws === activePlayer && object(message.patch) && Object.keys(message.patch).every(key => ['cameraOn', 'demo', 'paused'].includes(key));
      if (message.type === 'patch' && (client.role === 'admin' || playerCameraPatch)) {
        if (message.patch?.hostAdultMode === true && !host.state.active) return send(ws, { type: 'error', message: 'Start the host first, then explicitly confirm an adults-only audience.' });
        if (!validPatch(message.patch)) return send(ws, { type: 'error', message: 'Invalid settings. No changes were made.' });
        if (!Object.entries(message.patch).some(([key, value]) => state.settings[key] !== value)) return send(ws, { type: 'state', state });
        const cameraWasOn = state.settings.cameraOn, previousScene = state.settings.scene, previousDevice = state.settings.deviceId;
        Object.assign(state.settings, message.patch);
        const requestedAdultMode=state.settings.hostAdultMode;
        host.setControlMode(state.settings.hostControlMode);
        host.setTone(state.settings.hostTone);
        host.setAdultMode(requestedAdultMode);
        if (previousScene !== state.settings.scene && state.status) delete state.status.preview;
        if (host.state.active && (state.settings.scene !== 'spooky' || state.settings.paused || (cameraWasOn && !state.settings.cameraOn) || previousDevice !== state.settings.deviceId)) host.stop('Host stopped by scene, pause or camera change.');
        state.revision++;
        persist();
        broadcastState();
      } else if (message.type === 'host-start' && client.role === 'admin') {
        if (!activePlayer || state.settings.scene !== 'spooky' || state.settings.paused || state.settings.hostControlMode !== 'auto' || !['mock', 'openai'].includes(message.provider)) return send(ws, { type: 'error', message: 'Open the player, select Auto mode and resume before starting it.' });
        if (message.provider === 'openai' && !state.settings.cameraOn) return send(ws, { type: 'error', message: 'Start the camera before starting the AI host.' });
        host.start(message.provider, 'auto');
      } else if (message.type === 'host-stop' && (client.role === 'admin' || ws === activePlayer)) {
        host.stop();
      } else if (message.type === 'host-speak' && client.role === 'admin') {
        if (!activePlayer || state.settings.scene !== 'spooky' || state.settings.paused) return send(ws, { type: 'error', message: 'Open the player, select Spooky Host and resume before speaking.' });
        const cue = host.cue(message.provider, state.settings.hostControlMode, state.settings.cameraOn);
        if (cue.error) return send(ws, { type: 'error', message: cue.error });
        send(activePlayer, cue);
      } else if (message.type === 'host-action' && client.role === 'admin') {
        if (message.action !== 'quiet' && (!activePlayer || state.settings.scene !== 'spooky' || state.settings.paused)) return send(ws, { type: 'error', message: 'Open the player, select Spooky Host and resume first.' });
        const cue = host.action(message.action, message.provider, state.settings.hostControlMode, state.settings.cameraOn);
        if (cue.error) return send(ws, { type: 'error', message: cue.error });
        if (cue.type === 'host-cue') send(activePlayer, cue);
      } else if (message.type === 'host-challenge-ended' && ws === activePlayer) {
        host.endChallenge(message);
      } else if (message.type === 'host-scene-invalidated' && ws === activePlayer) {
        host.invalidate(message);
      } else if (message.type === 'host-idle' && ws === activePlayer) {
        host.idle(message);
      } else if (message.type === 'host-observe' && ws === activePlayer) {
        if (state.settings.scene !== 'spooky' || state.settings.paused) return send(ws, { type: 'host-rejected', sessionId: '', requestId: '', message: 'The host scene is not active.' });
        void host.observe(message, state.settings.cameraOn);
      } else if (message.type === 'effect' && client.role === 'admin') {
        if (!['candy', 'bats', 'magic'].includes(message.kind)) return send(ws, { type: 'error', message: 'Unknown effect.' });
        broadcast({ type: 'effect', event: { id: randomUUID(), kind: message.kind, at: Date.now() } });
      } else if (message.type === 'status' && ws === activePlayer) {
        const status = cleanStatus(message.status);
        if (status) {
          // A queued free-play thumbnail must never become a host camera preview.
          if ((status.scene && status.scene !== state.settings.scene) || (state.settings.scene === 'spooky' && status.scene !== 'spooky')) delete status.preview;
          state.status = status; broadcast({ type: 'status', status });
        }
      } else {
        send(ws, { type: 'error', message: 'This action is not available to this client.' });
      }
    });
    ws.on('close', () => {
      clearTimeout(helloTimeout);
      clients.delete(ws);
      if (host.state.active && client.role === 'admin' && ![...clients.values()].some(peer => peer.role === 'admin')) host.stop('Control room disconnected. Start a new host session explicitly.');
      choosePlayer();
      broadcastState();
    });
  });
  const heartbeat = setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.alive) { ws.terminate(); continue; }
      client.alive = false;
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); actualPort = server.address().port; resolvePromise(); });
  });
  async function close() {
    host.stop('Server stopped.');
    clearInterval(heartbeat);
    for (const ws of clients.keys()) ws.terminate();
    await new Promise(resolvePromise => wss.close(resolvePromise));
    await new Promise(resolvePromise => server.close(resolvePromise));
    await saveQueue;
  }
  return { server, wss, close, port: actualPort };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runtime = await createPlaygroundServer();
  console.log(`Halloween playground ready: http://127.0.0.1:${runtime.port}`);
  let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; await runtime.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
