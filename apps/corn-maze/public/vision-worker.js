/* Local-only classic worker. WASM scripts use importScripts, so this must not be a module worker. */
(() => {
  let detector = null;
  let delegate = 'GPU';
  let base = '';
  let files = null;

  const status = (value, error) => self.postMessage({ type: 'status', status: value, error });
  const message = error => error instanceof Error ? error.message : String(error);

  async function create(useDelegate) {
    const canvas = new OffscreenCanvas(1, 1);
    return self.exports.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${base}/models/pose_landmarker_lite.task`, delegate: useDelegate },
      canvas, runningMode: 'VIDEO', numPoses: 3, outputSegmentationMasks: true,
      minPoseDetectionConfidence: 0.45, minPosePresenceConfidence: 0.45, minTrackingConfidence: 0.5,
    });
  }

  async function initialize(origin, requestedDelegate = 'GPU') {
    base = origin;
    delegate = requestedDelegate === 'CPU' ? 'CPU' : 'GPU';
    // npm's CJS bundle is self-contained; this global receives its public exports.
    self.exports = {};
    importScripts(`${base}/wasm/vision_bundle.js`);
    files = await self.exports.FilesetResolver.forVisionTasks(`${base}/wasm`);
    try { detector = await create(delegate); }
    catch (error) {
      if (delegate === 'CPU') throw error;
      delegate = 'CPU'; status('GPU unavailable; loading local CPU tracking…', message(error));
      detector = await create('CPU');
    }
    self.postMessage({ type: 'ready', status: `Local ${delegate} tracking ready · up to 3 people` });
  }

  function maskUnion(masks) {
    if (!masks?.length) return null;
    const { width, height } = masks[0];
    const values = new Float32Array(width * height);
    for (const mask of masks) {
      if (mask.width !== width || mask.height !== height) continue;
      const confidence = mask.getAsFloat32Array();
      for (let i = 0; i < values.length; i++) values[i] = Math.max(values[i], confidence[i]);
    }
    if (!values.some(value => Number.isFinite(value) && value > 0.2)) return null;
    const output = new ImageData(width, height);
    for (let i = 0; i < values.length; i++) {
      const value = Math.max(0, Math.min(1, (values[i] - 0.25) / 0.5));
      output.data[i * 4] = output.data[i * 4 + 1] = output.data[i * 4 + 2] = 255;
      output.data[i * 4 + 3] = Math.round(value * value * (3 - 2 * value) * 255);
    }
    return output;
  }

  async function infer(image, timestamp) {
    const began = performance.now();
    let transferred = false;
    try {
      if (!detector) throw new Error('Tracking model is not initialized');
      detector.detectForVideo(image, timestamp, result => {
        // Copy masks while the callback owns them. MediaPipe disposes its native result on return.
        const mask = maskUnion(result.segmentationMasks);
        if (result.landmarks.length && !mask && delegate === 'GPU') throw new Error('GPU produced an empty person mask; CPU tracking is required');
        const landmarks = result.landmarks.map(pose => pose.map(point => ({ x: point.x, y: point.y, z: point.z, visibility: point.visibility })));
        const transfers = [image];
        if (mask) transfers.push(mask.data.buffer);
        self.postMessage({ type: 'frame', mask, landmarks, image, timestamp, inferenceMs: performance.now() - began }, transfers);
        transferred = true;
      });
    } catch (error) {
      self.postMessage({ type: 'error', error: message(error) });
    } finally { if (!transferred) image.close(); }
  }

  self.onmessage = event => {
    const command = event.data;
    if (command.type === 'init') void initialize(command.base, command.delegate).catch(error => self.postMessage({ type: 'init-error', error: message(error) }));
    else if (command.type === 'frame') void infer(command.image, command.timestamp);
  };
})();
