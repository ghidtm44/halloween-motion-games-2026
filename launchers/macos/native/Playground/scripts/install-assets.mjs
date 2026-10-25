import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(root, 'node_modules/@mediapipe/tasks-vision');
const expectedVersion = '0.10.32';
const model = {
  path: 'models/pose_landmarker_lite.task', bytes: 5777746,
  sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
  source: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  license: 'Apache-2.0', version: 'float16/1',
};
const documents = [
  { path: 'models/MEDIAPIPE-LICENSE.txt', bytes: 12331, sha256: '8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8', source: 'https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE' },
  { path: 'models/pose-model-card.pdf', bytes: 1398977, sha256: 'e982460cedece5ad9a46aa8f13523328e9ab95d7d5b2b8c99b33f13f6a79ca86', source: 'https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf' },
];
const runtime = [
  ['wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.js', 204816, '6f6b86509cf9e163ea1cfec7edc8cf53732699c04781e4c21c557c1ba402310e'],
  ['wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_internal.wasm', 11453626, 'cb3ec20026a9aecc2a81a93c25630ceb5389297ddb7a5f0bd61dd09cde606b9b'],
  ['wasm/vision_wasm_nosimd_internal.js', 'wasm/vision_wasm_nosimd_internal.js', 204669, '9f8fc960e363f0fb2f42f7937b97ae9cf9a5630490f71031fa90caa9bb121938'],
  ['wasm/vision_wasm_nosimd_internal.wasm', 'wasm/vision_wasm_nosimd_internal.wasm', 10647962, '924274fcd5ac8985f6570a8573e7971b7bd2d580ba1b8f3beb0ba8f95db6347c'],
  ['vision_bundle.cjs', 'wasm/vision_bundle.js', 137315, '43c65a77825c5d5af7456d4781a64cd15cb3e53f479ff1f923c12b5adecf2b44'],
].map(([input, path, bytes, sha256]) => ({ input, path, bytes, sha256, source: `npm:@mediapipe/tasks-vision@${expectedVersion}/${input}`, license: 'Apache-2.0' }));

function check(buffer, asset) {
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (buffer.length !== asset.bytes || hash !== asset.sha256) throw new Error(`Integrity mismatch for ${asset.path}. Expected ${asset.bytes} bytes and SHA-256 ${asset.sha256}; got ${buffer.length} and ${hash}.`);
}
async function download(asset) {
  const target = resolve(root, 'public', asset.path);
  try { check(await readFile(target), asset); console.log(`Verified ${asset.path}`); return; } catch {}
  console.log(`Installing ${asset.path} from official source…`);
  const response = await fetch(asset.source, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${asset.path}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  check(buffer, asset);
  await writeFile(`${target}.download`, buffer);
  await rename(`${target}.download`, target);
}

try {
  const pkg = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  if (pkg.version !== expectedVersion) throw new Error(`Install @mediapipe/tasks-vision ${expectedVersion}; found ${pkg.version}. Updating versions requires updating asset digests.`);
  await mkdir(resolve(root, 'public/models'), { recursive: true });
  await mkdir(resolve(root, 'public/wasm'), { recursive: true });
  for (const asset of runtime) {
    const source = resolve(packageRoot, asset.input);
    check(await readFile(source), asset);
    await copyFile(source, resolve(root, 'public', asset.path));
  }
  for (const asset of [model, ...documents]) await download(asset);
  const manifest = {
    schemaVersion: 1,
    package: '@mediapipe/tasks-vision', packageVersion: expectedVersion,
    provenance: 'Google MediaPipe official npm release and official Google model storage. Hashes pinned in scripts/install-assets.mjs.',
    license: 'Apache-2.0',
    licenseFile: 'models/MEDIAPIPE-LICENSE.txt', modelCard: 'models/pose-model-card.pdf',
    documentation: 'https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js',
    use: 'PoseLandmarker VIDEO mode, numPoses=3, merged foreground from all available segmentation masks. No individual-mask or identity guarantee. The older model card describes the per-person model; current task runs detection on multiple body crops.',
    privacy: 'All inference is on this computer. No analytics, uploads, or remote model URLs at runtime.',
    files: [model, ...runtime.map(({ input, ...asset }) => asset), ...documents],
  };
  await writeFile(resolve(root, 'public/models/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Local models, worker runtime, SIMD/non-SIMD WASM, licenses, and model card verified. Runtime needs no internet.');
} catch (error) {
  console.error(`Asset installation failed: ${error.message}`);
  process.exitCode = 1;
}
