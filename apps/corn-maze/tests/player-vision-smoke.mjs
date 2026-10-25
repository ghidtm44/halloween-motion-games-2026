/**
 * Production player + real local-model integration smoke test.
 * With npm start already serving the production build and no other active player:
 * POSE_FIXTURE=/absolute/path/pose.jpg node tests/player-vision-smoke.mjs
 *
 * The optional fixture is Google's reference image from
 * https://storage.googleapis.com/mediapipe-assets/pose.jpg, downloaded separately.
 * The fixture is served from memory on localhost; this test never fetches it.
 * Only getUserMedia/enumerateDevices are replaced with a canvas MediaStream.
 * Segmentation, pose inference, worker, compositor, UI, and sync are real.
 * This verifies a static photo, not real attendees, costumes, or physical HDMI.
 */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { WebSocket } from 'ws';

const base = process.env.PLAYGROUND_URL || 'http://127.0.0.1:4317';
if (!process.env.POSE_FIXTURE) throw new Error('Set POSE_FIXTURE to an existing local reference photo. This test never downloads assets.');
const photo = await readFile(resolve(process.env.POSE_FIXTURE));
const prior = await (await fetch(`${base}/api/state`)).json();
if (prior.playerConnected) throw new Error('Another player is already active. Close that player before running this integration test.');
const control = new WebSocket(base.replace(/^http/, 'ws') + '/sync');
await new Promise((done, reject) => { control.once('open', done); control.once('error', reject); });
function waitState(predicate) {
  return new Promise((done, reject) => {
    const timeout = setTimeout(() => { control.off('message', listener); reject(new Error('Timed out waiting for authoritative settings.')); }, 5000);
    const listener = data => { const value = JSON.parse(data); if (value.type === 'state' && predicate(value.state)) { clearTimeout(timeout); control.off('message', listener); done(value.state); } };
    control.on('message', listener);
  });
}
const hello = waitState(() => true);
control.send(JSON.stringify({ type: 'hello', role: 'admin', clientId: 'production-player-vision-test' }));
await hello;
async function patch(settings) {
  const applied = waitState(state => Object.entries(settings).every(([key, value]) => state.settings[key] === value));
  control.send(JSON.stringify({ type: 'patch', patch: settings }));
  return applied;
}
await patch({ deviceId: '', cameraOn: false, demo: true, paused: false, mode: 'cutout', mirror: true, scene: 'pumpkin', motion: false });
let browser, context;
const exceptions = [], external = [], checks = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'chrome' }) });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base && !['blob:', 'data:'].includes(url.protocol)) { external.push(url.href); return route.abort(); }
    if (url.pathname === '/__fixture.jpg') return route.fulfill({ status: 200, contentType: 'image/jpeg', body: photo });
    return route.continue();
  });
  context.on('page', page => page.on('pageerror', error => exceptions.push(error.message)));
  await context.addInitScript(() => {
    if (!navigator.mediaDevices) return; // Initial about:blank has no secure-context camera API.
    window.__maskProof = { cutouts: [], silhouettes: [], transforms: [], cameraStarts: 0 };
    const nativeDraw = CanvasRenderingContext2D.prototype.drawImage;
    const nativeFill = CanvasRenderingContext2D.prototype.fillRect;
    function sample(context) {
      const { width, height } = context.canvas;
      const data = context.getImageData(0, 0, width, height).data;
      let transparent = 0, opaque = 0, partial = 0;
      for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) transparent++; else if (data[i] > 127) opaque++; else partial++; }
      return { width, height, transparent, opaque, partial };
    }
    // Observe real alpha compositing without replacing model or renderer output.
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      const operation = this.globalCompositeOperation;
      const result = nativeDraw.apply(this, args);
      if (operation === 'destination-in' && window.__maskProof.cutouts.length < 6) window.__maskProof.cutouts.push(sample(this));
      if (this.canvas.width === 1280 && this.canvas.height === 720 && args[0] instanceof HTMLCanvasElement && args[0].width === 960 && args[0].height === 640 && window.__maskProof.transforms.length < 60) window.__maskProof.transforms.push(this.getTransform().a);
      return result;
    };
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      const operation = this.globalCompositeOperation;
      const result = nativeFill.apply(this, args);
      if (operation === 'source-in' && window.__maskProof.silhouettes.length < 6) window.__maskProof.silhouettes.push(sample(this));
      return result;
    };
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { configurable: true, value: async () => [{ kind: 'videoinput', deviceId: 'fixture-camera', groupId: 'fixture', label: 'Local reference-photo test camera', toJSON() { return this; } }] });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      window.__maskProof.cameraStarts++;
      const image = new Image(); image.src = '/__fixture.jpg'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 640;
      const context = canvas.getContext('2d');
      const draw = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      draw();
      const stream = canvas.captureStream(30);
      const timer = setInterval(draw, 33);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
      }
      return stream;
    } });
  });
  const admin = await context.newPage(); await admin.goto(base); await expect(admin.locator('#connection')).toContainText('ready');
  const player = await context.newPage(); await player.goto(`${base}/?view=player`); await expect(player.locator('#duplicate')).toBeHidden();
  await player.locator('#start-here').click();
  const state = async () => (await (await fetch(`${base}/api/state`)).json());
  await expect.poll(async () => { const { status } = await state(); return Boolean(status && status.people > 0 && /ready/i.test(status.model) && status.fallback === '' && status.error === ''); }, { timeout: 90000, message: 'Real local model should detect a person and produce a usable cutout in the production player.' }).toBe(true);
  const cutoutState = await state();
  checks.push('Production player starts via player gesture; real local pose model reports a person with no cutout fallback');
  const video = await player.locator('#camera-video').evaluate(video => ({ width: video.videoWidth, height: video.videoHeight, readyState: video.readyState, liveTracks: video.srcObject.getVideoTracks().filter(track => track.readyState === 'live').length }));
  assert.deepEqual(video, { width: 960, height: 640, readyState: 4, liveTracks: 1 });
  await expect.poll(() => player.evaluate(() => window.__maskProof.cutouts.some(sample => sample.transparent > 1000 && sample.opaque > 1000))).toBe(true);
  const cutouts = await player.evaluate(() => window.__maskProof.cutouts);
  assert.ok(cutouts.every(sample => sample.width === 960 && sample.height === 640));
  checks.push('Real segmentation alpha is applied to the synchronized 960×640 camera frame, with transparent background and opaque foreground');
  await expect(admin.locator('#live-preview')).toBeVisible({ timeout: 15000 });
  await expect.poll(() => admin.locator('#live-preview').evaluate(image => image.complete && image.naturalWidth === 480 && image.naturalHeight === 270)).toBe(true);
  checks.push('Admin receives and decodes the composited player preview');
  await mkdir('work', { recursive: true });
  await player.screenshot({ path: 'work/player-real-cutout.png' });
  await player.evaluate(() => { window.__maskProof.transforms = []; });
  await expect.poll(() => player.evaluate(() => window.__maskProof.transforms.includes(-1))).toBe(true);
  await admin.locator('#mirror').uncheck();
  await expect.poll(async () => (await state()).settings.mirror).toBe(false);
  await player.evaluate(() => { window.__maskProof.transforms = []; });
  await expect.poll(() => player.evaluate(() => window.__maskProof.transforms.includes(1))).toBe(true);
  checks.push('Mirror control changes the actual camera-layer transform');
  await admin.locator('#mode').selectOption('silhouette');
  await expect.poll(() => player.evaluate(() => window.__maskProof.silhouettes.some(sample => sample.transparent > 1000 && sample.opaque > 1000)), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => { const snapshot = await state(); return snapshot.settings.mode === 'silhouette' && snapshot.status.people > 0 && snapshot.status.fallback === ''; }).toBe(true);
  const silhouetteState = await state();
  const silhouettes = await player.evaluate(() => window.__maskProof.silhouettes);
  await player.screenshot({ path: 'work/player-real-silhouette.png' });
  checks.push('Silhouette recoloring preserves real foreground alpha without fallback');
  await patch({ cameraOn: false, demo: true });
  await expect.poll(() => player.locator('#camera-video').evaluate(video => video.srcObject === null)).toBe(true);
  checks.push('Stopping camera releases the fixture MediaStream');
  assert.equal(exceptions.length, 0, `Browser exceptions: ${exceptions.join('; ')}`);
  assert.equal(external.length, 0, `Non-local requests: ${external.join(', ')}`);
  const stripPreview = snapshot => { const { preview, ...status } = snapshot.status; return status; };
  const report = { passed: true, checks, video, cutout: stripPreview(cutoutState), silhouette: stripPreview(silhouetteState), cutoutAlphaSamples: cutouts, silhouetteAlphaSamples: silhouettes, browserExceptions: exceptions, externalRequests: external, limitations: 'Static reference photo through a synthetic camera verifies model-to-player composition. Live multiple people, individual masks, costumes, overlap, camera hardware, and physical HDMI remain separate field tests.' };
  await writeFile('work/player-vision-smoke.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context?.close(); await browser?.close();
  try { await patch({ ...prior.settings, cameraOn: false, demo: true }); } finally { control.close(); }
}
