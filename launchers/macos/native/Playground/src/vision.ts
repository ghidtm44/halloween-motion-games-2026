import type { Landmark, Pose, VisionFrame } from './types';
import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';

type Track = { id: number; x: number; y: number; lastSeen: number };
type WorkerReply = { type: string; status?: string; error?: string; landmarks?: Landmark[][]; mask?: ImageData | null; image?: ImageBitmap; inferenceMs?: number; timestamp?: number };

/** One in-flight image at a time. Camera pixels never leave this browser. */
export class VisionEngine {
  private worker: Worker | null = null;
  private detector: PoseLandmarker | null = null;
  private workerDelegate: 'GPU' | 'CPU' = 'GPU';
  private ready = false;
  private busy = false;
  private generation = 0;
  private startPromise: Promise<void> | null = null;
  private pendingCancel: (() => void) | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private tracks: Track[] = [];
  private nextId = 1;
  private lastTimestamp = -1;
  private lastSubmit = -Infinity;
  private consecutiveErrors = 0;

  constructor(private onFrame: (frame: VisionFrame) => void, private onStatus: (status: string, error?: string) => void, private stableMasks=false) {}

  start(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    const generation = ++this.generation;
    this.onStatus('Loading local body tracking…');
    const task = this.initialize(generation);
    this.startPromise = task;
    void task.finally(() => { if (this.startPromise === task) this.startPromise = null; }).catch(() => {});
    return task;
  }

  private async initialize(generation: number): Promise<void> {
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') throw new Error('Background vision unavailable in this browser');
      await this.startWorker(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      (this.worker as Worker | null)?.terminate(); this.worker = null;
      this.onStatus('Loading CPU compatibility mode…', message(error));
      await this.startMainThread(generation);
    }
  }

  private startWorker(generation: number, delegate: 'GPU' | 'CPU' = 'GPU'): Promise<void> {
    this.workerDelegate = delegate;
    return new Promise((resolve, reject) => {
      // Classic worker is intentional: MediaPipe's WASM loader uses importScripts.
      const worker = new Worker('/vision-worker.js');
      this.worker = worker;
      let initialized = false;
      const timeout = setTimeout(() => { reject(new Error('Local model initialization timed out')); }, 45000);
      const clear = () => { clearTimeout(timeout); this.pendingCancel = null; };
      this.pendingCancel = () => { clear(); reject(new Error('Vision stopped')); };
      worker.onerror = (event) => {
        const error = event.message || 'Background vision failed';
        if (!initialized) { clear(); reject(new Error(error)); }
        else void this.recoverWorker(generation, error);
      };
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const result = event.data;
        if (generation !== this.generation || this.worker !== worker) { result.image?.close(); return; }
        if (result.type === 'status') { this.onStatus(result.status || 'Loading local vision…', result.error); return; }
        if (result.type === 'ready') {
          initialized = true; clear(); this.ready = true;
          if (result.status?.includes('CPU')) this.workerDelegate = 'CPU';
          this.onStatus(result.status || 'Local body tracking ready'); resolve(); return;
        }
        if (result.type === 'init-error') { clear(); reject(new Error(result.error || 'Cannot load local model')); return; }
        if (result.type === 'frame') {
          this.finishRequest();
          if (this.consecutiveErrors) this.onStatus(`Local ${this.workerDelegate} tracking ready · up to 3 people`);
          this.consecutiveErrors = 0;
          this.deliver(result.landmarks || [], result.mask || null, result.image, result.timestamp || 0, result.inferenceMs || 0);
        } else if (result.type === 'error') {
          this.finishRequest(); this.consecutiveErrors++;
          this.onStatus('Tracking interrupted; trying the next frame', result.error);
          if (this.workerDelegate === 'GPU' || this.consecutiveErrors >= 3) void this.recoverWorker(generation, result.error || 'Repeated inference failure');
        }
      };
      worker.postMessage({ type: 'init', base: location.origin, delegate, stableMasks: this.stableMasks });
    });
  }

  private async recoverWorker(generation: number, reason: string): Promise<void> {
    if (generation !== this.generation || !this.worker) return;
    const wasGPU = this.workerDelegate === 'GPU';
    this.worker.terminate(); this.worker = null; this.ready = false; this.finishRequest();
    this.consecutiveErrors = 0;
    this.onStatus('Switching to local CPU tracking…', reason);
    if (wasGPU) {
      // A fatal WASM GPU error poisons that instance. Recreate the whole worker.
      try { await this.startWorker(generation, 'CPU'); return; }
      catch (error) {
        if (generation !== this.generation) return;
        (this.worker as Worker | null)?.terminate(); this.worker = null;
        this.onStatus('Loading CPU compatibility mode…', message(error));
      }
    }
    try { await this.startMainThread(generation); }
    catch (error) { if (generation === this.generation) this.onStatus('Tracking unavailable — use camera fallback', message(error)); }
  }

  private async startMainThread(generation: number): Promise<void> {
    const { FilesetResolver, PoseLandmarker: Detector } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('/wasm');
    const detector = await Detector.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' },
      runningMode: 'VIDEO', numPoses: 3, outputSegmentationMasks: true,
      minPoseDetectionConfidence: 0.45, minPosePresenceConfidence: 0.45, minTrackingConfidence: 0.5,
      canvas: document.createElement('canvas'),
    });
    if (generation !== this.generation) { detector.close(); return; }
    this.detector = detector; this.ready = true;
    this.onStatus('Local CPU tracking ready · compatibility mode');
  }

  submit(source: HTMLVideoElement | HTMLCanvasElement, timestamp: number): boolean {
    if (!this.ready || this.busy || timestamp - this.lastSubmit < (this.detector ? 110 : 50)) return false;
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!width || !height) return false;
    this.busy = true; this.lastSubmit = timestamp;
    this.lastTimestamp = Math.max(timestamp, this.lastTimestamp + 0.01);
    const modelTimestamp = this.lastTimestamp;
    const generation = this.generation;
    const scale = Math.min(1, 960 / width, 720 / height);
    const options: ImageBitmapOptions = { resizeWidth: Math.max(1, Math.round(width * scale)), resizeHeight: Math.max(1, Math.round(height * scale)), resizeQuality: 'low' };
    void createImageBitmap(source, options).then((bitmap) => {
      if (generation !== this.generation || !this.ready) { bitmap.close(); if (generation === this.generation) this.finishRequest(); return; }
      if (this.worker) {
        this.watchdog = setTimeout(() => { void this.recoverWorker(generation, 'Frame processing timed out'); }, 15000);
        try { this.worker.postMessage({ type: 'frame', image: bitmap, timestamp: modelTimestamp }, [bitmap]); }
        catch (error) { bitmap.close(); throw error; }
      } else if (this.detector) {
        const began = performance.now();
        let delivered = false;
        try {
          this.detector.detectForVideo(bitmap, modelTimestamp, (result) => {
            const mask = unionMask(result);
            this.deliver(result.landmarks, mask, bitmap, modelTimestamp, performance.now() - began);
            delivered = true;
          });
          this.consecutiveErrors = 0;
        } catch (error) {
          this.consecutiveErrors++;
          this.onStatus('Tracking unavailable — use camera fallback', message(error));
          if (this.consecutiveErrors >= 3) this.ready = false;
        } finally { if (!delivered) bitmap.close(); this.finishRequest(); }
      } else { bitmap.close(); this.finishRequest(); }
    }).catch((error) => { if (generation === this.generation) { this.finishRequest(); this.onStatus('Could not read camera frame', message(error)); } });
    return true;
  }

  private deliver(landmarks: Landmark[][], mask: ImageData | null, image: ImageBitmap | undefined, timestamp: number, inferenceMs: number): void {
    const poses = this.assignIds(landmarks.slice(0, 3), timestamp);
    try { this.onFrame({ poses, mask, image, timestamp, inferenceMs }); }
    catch (error) { image?.close(); console.error('Vision frame consumer failed', error); }
  }

  private assignIds(landmarks: Landmark[][], timestamp: number): Pose[] {
    this.tracks = this.tracks.filter(track => timestamp - track.lastSeen < 900);
    const centers = landmarks.map(points => {
      const torso = [11, 12, 23, 24].map(i => points[i]).filter(p => p && (p.visibility ?? 1) > 0.2);
      const relevant = torso.length ? torso : points;
      return { x: relevant.reduce((sum, p) => sum + p.x, 0) / relevant.length, y: relevant.reduce((sum, p) => sum + p.y, 0) / relevant.length };
    });
    const pairs = centers.flatMap((center, index) => this.tracks.map(track => ({ index, track, distance: Math.hypot(center.x - track.x, center.y - track.y) }))).sort((a, b) => a.distance - b.distance);
    const ids = new Map<number, number>(); const used = new Set<number>();
    for (const pair of pairs) if (pair.distance < 0.28 && !ids.has(pair.index) && !used.has(pair.track.id)) { ids.set(pair.index, pair.track.id); used.add(pair.track.id); }
    // IDs are short-lived nearest-torso matches, never reliable person identities.
    return landmarks.map((points, index) => {
      const id = ids.get(index) ?? this.nextId++;
      this.tracks = this.tracks.filter(track => track.id !== id);
      this.tracks.push({ id, ...centers[index], lastSeen: timestamp });
      return { id, landmarks: points };
    });
  }

  private finishRequest(): void { this.busy = false; if (this.watchdog) clearTimeout(this.watchdog); this.watchdog = null; }

  stop(): void {
    ++this.generation; this.ready = false; this.finishRequest();
    this.pendingCancel?.(); this.pendingCancel = null;
    (this.worker as Worker | null)?.terminate(); this.worker = null;
    this.detector?.close(); this.detector = null;
    this.startPromise = null; this.tracks = []; this.lastTimestamp = -1; this.lastSubmit = -Infinity;
    this.consecutiveErrors = 0;
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

/** Merge all person confidences into one foreground. No individual-mask identity claims. */
function unionMask(result: PoseLandmarkerResult): ImageData | null {
  const masks = result.segmentationMasks;
  if (!masks?.length) return null;
  const { width, height } = masks[0];
  const confidence = new Float32Array(width * height);
  for (const mask of masks) {
    if (mask.width !== width || mask.height !== height) continue;
    const values = mask.getAsFloat32Array();
    for (let i = 0; i < confidence.length; i++) confidence[i] = Math.max(confidence[i], values[i]);
  }
  if (!confidence.some(value => Number.isFinite(value) && value > 0.2)) return null;
  const image = new ImageData(width, height);
  for (let i = 0; i < confidence.length; i++) {
    const value = Math.max(0, Math.min(1, (confidence[i] - 0.25) / 0.5));
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
    image.data[i * 4 + 3] = Math.round(value * value * (3 - 2 * value) * 255);
  }
  return image;
}
