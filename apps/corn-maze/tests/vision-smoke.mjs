/**
 * Real local-model browser smoke test (not run by the unit-test wildcard).
 * Fetch Google's reference image once into a scratch directory:
 * https://storage.googleapis.com/mediapipe-assets/pose.jpg
 * POSE_FIXTURE=/absolute/path/pose.jpg node tests/vision-smoke.mjs
 * Optional PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium (otherwise uses installed Google Chrome).
 * The test starts a temporary localhost Vite server and blocks all non-local requests.
 * Three subjects are duplicate crops of a static reference photo. This is not a field validation.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = process.env.POSE_FIXTURE;
if (!fixture) throw new Error('Set POSE_FIXTURE to a local copy of https://storage.googleapis.com/mediapipe-assets/pose.jpg');
const bytes = await readFile(resolve(fixture));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {channel:'chrome'}) });
  const page = await browser.newPage();
  const external = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto(`${origin}/models/manifest.json`);
  const results = await page.evaluate(async imageBase64 => {
    const { VisionEngine } = await import('/src/vision.ts');
    const photo = new Image(); photo.src = `data:image/jpeg;base64,${imageBase64}`; await photo.decode();
    async function run(count, compatibility = false) {
      const canvas = document.createElement('canvas');
      canvas.width = 960; canvas.height = count === 1 ? 640 : 420;
      const context = canvas.getContext('2d');
      context.fillStyle = '#9dddf3'; context.fillRect(0, 0, canvas.width, canvas.height);
      if (count === 1) context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      if (count === 3) for (let i = 0; i < 3; i++) context.drawImage(photo, 225, 195, 550, 472, i * 320, 60, 320, 275);
      const statuses = [], frames = [];
      const OriginalWorker = window.Worker;
      if (compatibility) window.Worker = class { constructor() { throw new Error('Worker deliberately disabled by smoke test'); } };
      let engine, interval, timeout;
      try {
        return await new Promise(async (resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(`Vision smoke timed out: ${JSON.stringify({ statuses, frames })}`)), 55000);
          engine = new VisionEngine(frame => {
            let foreground = 0; const foregroundThirds = [0, 0, 0];
            if (frame.mask) for (let i = 3; i < frame.mask.data.length; i += 4) if (frame.mask.data[i] > 127) { foreground++; foregroundThirds[Math.min(2, Math.floor(((i - 3) / 4 % frame.mask.width) / frame.mask.width * 3))]++; }
            frames.push({ people: frame.poses.length, ids: frame.poses.map(p => p.id), foreground, foregroundThirds, inferenceMs: frame.inferenceMs, width: frame.image?.width, height: frame.image?.height });
            frame.image?.close();
            if (frames.length >= 3) resolve({ subjects: count, compatibility, statuses, frames });
          }, (status, error) => statuses.push({ status, error }));
          try { await engine.start(); interval = setInterval(() => engine.submit(canvas, performance.now()), 70); }
          catch (error) { reject(error); }
        });
      } finally {
        clearTimeout(timeout); clearInterval(interval); engine?.stop(); window.Worker = OriginalWorker;
      }
    }
    return [await run(1), await run(3), await run(0), await run(1, true)];
  }, bytes.toString('base64'));
  console.log(JSON.stringify({ results, externalRequests: external, note: 'Static duplicate-photo fixture validates up-to-3 detections and union alpha only; individual masks, overlapping people, costumes, and live event performance remain unverified.' }, null, 2));
  for (const result of results) {
    const latest = result.frames.at(-1);
    assert.equal(latest.people, result.subjects, `Expected ${result.subjects} poses from the reference fixture`);
    assert.ok(result.subjects ? latest.foreground > 1000 : latest.foreground === 0, 'Foreground alpha should match presence of subjects');
    if (result.subjects === 3) assert.ok(latest.foregroundThirds.every(count => count > 1000), 'Union mask should retain foreground in all three subject regions');
    if (result.subjects) assert.deepEqual(result.frames.at(-1).ids, result.frames.at(-2).ids, 'IDs should be continuous in a static frame');
  }
  assert.equal(external.length, 0, 'Runtime attempted external requests');
} finally { await browser?.close(); await server.close(); }
