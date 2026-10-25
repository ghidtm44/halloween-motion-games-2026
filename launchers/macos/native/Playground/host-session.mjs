import { randomUUID } from 'node:crypto';
import { createOpenAIProvider, mockReply } from './host-provider.mjs';

const integer = (value, fallback, min, max) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;

// Validate real JPEG framing/dimensions before a local browser can submit pixels.
// The trusted client downsizes the entire scene; remote image URLs are forbidden.
export function validHostImage(value) {
  if (typeof value !== 'string' || value.length > 300_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const data = Buffer.from(value.slice(23), 'base64');
  if (data.length < 12 || data[0] !== 0xff || data[1] !== 0xd8 || data.at(-2) !== 0xff || data.at(-1) !== 0xd9) return false;
  let offset = 2;
  while (offset + 8 < data.length) {
    if (data[offset++] !== 0xff) return false;
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xda || marker === 0xd9) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) return false;
    const size = data.readUInt16BE(offset);
    if (size < 2 || offset + size > data.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size < 8) return false;
      const h = data.readUInt16BE(offset + 3), w = data.readUInt16BE(offset + 5);
      return h > 0 && w > 0 && h <= 768 && w <= 768 && h * w <= 512_000;
    }
    offset += size;
  }
  return false;
}

// New client sends up to three chronological JPEGs; legacy single-image clients remain valid.
export function validHostFrames(frames) {
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 3) return false;
  let total = 0, previous = Infinity;
  for (const frame of frames) {
    if (!frame || !Number.isInteger(frame.ageMs) || frame.ageMs < 0 || frame.ageMs > 1800 || frame.ageMs >= previous || !validHostImage(frame.image) || frame.image.length > 130000) return false;
    total += frame.image.length; previous = frame.ageMs;
  }
  return total <= 390000 && frames.at(-1).ageMs <= 700;
}

export function createHostSession({ onChange, onResult, onRejected, options = {} }) {
  const apiKey = options.apiKey ?? (process.env.OPENAI_API_KEY?.trim() || process.env.SPOOKY_HOST_API_KEY);
  const configured = typeof apiKey === 'string' && apiKey.trim().length > 0;
  const limit = integer(options.limit ?? process.env.SPOOKY_HOST_REQUEST_CAP, 1200, 1, 5000);
  const timeoutMs = integer(options.timeoutMs, integer(process.env.SPOOKY_HOST_TIMEOUT_MS, 25_000, 1000, 60_000), 10, 60_000);
  const now = options.now || Date.now;
  const openai = options.provider || createOpenAIProvider({ apiKey, fetchImpl: options.fetchImpl, visionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini', speechModel: process.env.OPENAI_SPEECH_MODEL || 'gpt-4o-mini-tts', voice: process.env.OPENAI_SPEECH_VOICE || 'onyx' });
  const state = { adultMode: false, quiet: false, wrapped: false, continuation: false, active: false, provider: 'mock', controlMode: 'operator', tone: 0, configured, phase: 'off', message: 'Session off. Speak once, or explicitly start Auto mode.', sessionId: '', requestCount: 0, limit };
  let recentRemarks = [], playedPremises = [], challenge = null;
  let pending = null, lastRequest = -Infinity, epoch = 0, reservation = null, leaseTimer;
  function clearReservation() { clearTimeout(leaseTimer); reservation = null; }
  function stop(message = 'Session stopped. Camera images are not being sent.') {
    epoch++; recentRemarks = []; playedPremises = []; challenge = null;
    pending?.abort(); pending = null; clearReservation();
    Object.assign(state, { adultMode: false, active: false, phase: 'off', message, sessionId: '' });
    onChange();
  }
  function setControlMode(mode) {
    if (!['operator', 'auto'].includes(mode) || state.controlMode === mode) return;
    stop('Control mode changed. Start again when ready.');
    state.controlMode = mode; onChange();
  }
  function setTone(tone) {
    if (!Number.isInteger(tone) || tone < 0 || tone > 100 || tone === state.tone) return;
    state.tone = tone;
    // Lowering the dial must also prevent an old, spicier reply from playing.
    epoch++; pending?.abort(); pending = null; clearReservation(); challenge = null; state.continuation = true;
    if (state.active) Object.assign(state, { sessionId: randomUUID(), phase: 'ready', message: 'Tone updated. The next remark uses the new setting.' });
    onChange();
  }
  function setAdultMode(enabled) {
    if (typeof enabled !== 'boolean' || !state.active || state.adultMode === enabled) return false;
    state.adultMode = enabled;
    interruptBeat(enabled ? 'Adults-only comedy confirmed by the operator. Uncertain audiences still get clean material.' : 'Family-safe comedy restored. Previous output cancelled.');
    onChange(); return true;
  }
  function start(provider, controlMode = state.controlMode) {
    if (!['mock', 'openai'].includes(provider) || !['operator', 'auto'].includes(controlMode)) return false;
    if (state.active || pending) stop(); else epoch++;
    state.controlMode = controlMode;
    if (provider === 'openai' && !configured) {
      Object.assign(state, { provider, phase: 'error', message: 'AI is not configured. Use Scripted rehearsal, or configure a server-side API key.' });
      onChange(); return false;
    }
    lastRequest = -Infinity;
    challenge = null; recentRemarks = []; playedPremises = [];
    Object.assign(state, { adultMode: false, quiet: false, wrapped: false, continuation: false, active: true, provider, phase: 'ready', message: controlMode === 'operator' ? 'Operator mode ready. Each Speak click requests one remark.' : 'Auto is watching for arrivals and changes, with regular remarks while guests stay.', sessionId: randomUUID(), requestCount: 0 });
    onChange(); return true;
  }
  function reserveTimeout(ms, message) {
    clearTimeout(leaseTimer);
    const ownEpoch = epoch;
    leaseTimer = setTimeout(() => { if (epoch === ownEpoch && reservation) stop(message); }, ms);
    leaseTimer.unref?.();
  }
  function availability() {
    if (pending || reservation) return 'Wait for the current remark to finish. No Speak click was queued.';
    if (now() - lastRequest < 3000) return 'Give the host three seconds between remarks. Click Speak again when ready.';
    if (state.requestCount >= limit) { stop('Session request limit reached. Start a new session explicitly to continue.'); return 'Session request limit reached.'; }
    return '';
  }
  function cue(provider, controlMode, cameraOn) {
    if (state.quiet) return { error: 'Quiet now is on. Resume explicitly first.' };
    if (state.wrapped) return { error: 'This group has its farewell. Welcome a new group first.' };
    if (!['mock', 'openai'].includes(provider)) return { error: 'Choose a host provider.' };
    if (provider === 'openai' && !cameraOn) return { error: 'Start the camera before asking the AI host to Speak.' };
    if (!state.active) {
      if (controlMode !== 'operator') return { error: 'Start Auto mode explicitly before requesting a remark.' };
      if (!start(provider, controlMode)) return { error: state.message };
    }
    if (provider !== state.provider || controlMode !== state.controlMode) return { error: 'Stop the session before changing its provider or control mode.' };
    const unavailable = availability(); if (unavailable) return { error: unavailable };
    if (challenge) interruptBeat('Speak replaces the pending visual challenge.');
    const cueId = randomUUID();
    reservation = { cueId, requestId: '', phase: 'capture', expiresAt: now() + 10000 };
    state.phase = 'thinking'; state.message = 'Speak requested. Capturing a short frame sequence for this remark…'; onChange();
    reserveTimeout(10000, 'The player did not capture the Speak request. No retry was scheduled.');
    return { type: 'host-cue', sessionId: state.sessionId, cueId };
  }
  function interruptBeat(message, newGroup = false) {
    epoch++; pending?.abort(); pending = null; clearReservation(); challenge = null;
    if (newGroup) { recentRemarks = []; playedPremises = []; state.wrapped = false; }
    Object.assign(state, { sessionId: randomUUID(), continuation: true, phase: 'ready', message });
  }
  function action(kind, provider, controlMode, cameraOn) {
    if (kind === 'quiet') { stop('Quiet now. Resume explicitly when ready.'); state.quiet = true; onChange(); return {}; }
    if (kind === 'resume') {
      if (!state.quiet) return { error: 'The host is not in Quiet now.' };
      if (provider === 'openai' && !cameraOn) return { error: 'Start camera before resuming the AI host.' };
      const used = state.requestCount;
      if (used >= limit) return { error: 'Session limit reached. Start a new session explicitly.' };
      if (!start(provider, controlMode)) return { error: state.message };
      state.requestCount = used; onChange(); return {};
    }
    if (!['welcome', 'challenge', 'farewell'].includes(kind)) return { error: 'Unknown performance cue.' };
    if (!state.active || state.quiet) return { error: 'Start or resume the host before using a performance cue.' };
    if (state.provider === 'openai' && !cameraOn) return { error: 'Start camera before a performance cue.' };
    if (state.requestCount >= limit) { stop('Session limit reached. Start a new session explicitly.'); return { error: 'Session limit reached.' }; }
    if (state.wrapped && kind !== 'welcome') return { error: 'Farewell already given. Welcome a new group first.' };
    interruptBeat('Performance cue selected. The previous line is cancelled.', kind === 'welcome');
    const cueId = randomUUID(), delayMs = Math.max(0, 3000 - (now() - lastRequest));
    reservation = { cueId, requestId: '', phase: 'capture', expiresAt: now() + delayMs + 10000, intent: kind, notBefore: now() + delayMs };
    state.phase = 'thinking'; onChange();
    reserveTimeout(delayMs + 10000, 'The performance cue did not get a fresh image. No retry was scheduled.');
    return { type: 'host-cue', sessionId: state.sessionId, cueId, delayMs };
  }
  function endChallenge(message) {
    if (!state.active || message.sessionId !== state.sessionId || !challenge || message.challengeId !== challenge.id) return false;
    interruptBeat(message.turnover ? 'New arrivals. The old challenge is cancelled.' : 'No clear gesture. Moving on without a claim.', message.turnover === true);
    if(message.turnover===true)state.adultMode=false;
    onChange(); return true;
  }
  function idle(message) {
    if (!state.active || message.sessionId !== state.sessionId || !reservation || pending) return false;
    const match = reservation.cueId ? message.cueId === reservation.cueId && (!reservation.requestId || message.requestId === reservation.requestId) : !!reservation.requestId && message.requestId === reservation.requestId;
    if (!match) return false;
    if (reservation.challengePayoff) challenge = null;
    if (challenge && reservation.challengeId === challenge.id) {
      if (message.played === true) challenge.expiresAt = now() + 14000; else challenge = null;
    }
    if(message.played===true && reservation.candidate){
      recentRemarks=[...recentRemarks,reservation.candidate.text].slice(-6);
      if(reservation.candidate.novelty)playedPremises=[...playedPremises,{...reservation.candidate.novelty,spokenAt:now()}].slice(-48);
    }
    clearReservation(); state.phase = 'ready';
    state.message = state.wrapped ? 'Farewell given. Waiting for new arrivals or Welcome this group.' : challenge ? 'Challenge open. Waiting briefly for a clear new gesture; no response is assumed.' : state.controlMode === 'operator' ? 'Ready. Click Speak for a fresh frame sequence and remark.' : 'Auto is watching. Fresh observations continue while guests are present.';
    onChange(); return true;
  }
  async function observe(message, cameraOn) {
    const requestId = typeof message.requestId === 'string' && message.requestId.length <= 80 ? message.requestId : '';
    const cueId = typeof message.cueId === 'string' ? message.cueId : undefined;
    const reject = text => onRejected({ type: 'host-rejected', requestId, ...(cueId ? { cueId } : {}), sessionId: message.sessionId === state.sessionId ? state.sessionId : '', message: text });
    if (!state.active || message.sessionId !== state.sessionId) return reject('Start a new host session first.');
    if (challenge && !challenge.replying && now() > challenge.expiresAt) challenge = null;
    const manual = message.reason === 'speak';
    let intent = 'comment', gesture;
    if (state.quiet) return reject('Resume explicitly before observing.');
    if (manual) {
      if (!reservation || reservation.phase !== 'capture' || !cueId || cueId !== reservation.cueId || now() >= reservation.expiresAt) return reject('An unused operator Speak click is required for this observation.');
      if (reservation.notBefore && now() < reservation.notBefore) return reject('Wait for the performance cue cooldown.');
      intent = reservation.intent || 'comment';
      // Consume before validating the payload: a click can never be replayed.
      clearTimeout(leaseTimer); reservation.phase = 'processing'; reservation.requestId = requestId;
    } else if (message.reason === 'challenge-response') {
      if (!challenge || challenge.replying || message.challengeId !== challenge.id || challenge.expiresAt < now() || message.gesture !== challenge.kind || cueId) return reject('No active visual challenge matches this response.');
      const unavailable = availability(); if (unavailable) return reject(unavailable);
      intent = 'challenge-payoff'; gesture = challenge.kind; challenge.replying = true;
      reservation = { cueId: '', requestId, phase: 'processing' };
    } else {
      if (state.wrapped && message.reason !== 'arrival') return reject('This group has its farewell. Waiting for new arrivals.');
      if (challenge) return reject('Waiting for the visual challenge, not another remark.');
      if (state.controlMode !== 'auto' || !['arrival', 'change', 'comment'].includes(message.reason) || cueId) return reject('Operator mode accepts images only after a Speak click.');
      const unavailable = availability(); if (unavailable) return reject(unavailable);
      reservation = { cueId: '', requestId, phase: 'processing' };
    }
    const rejectAttempt = text => { clearReservation(); state.phase = 'ready'; state.message = text; onChange(); reject(text); };
    if (!requestId || !Number.isInteger(message.people) || message.people < 0 || message.people > 3) return rejectAttempt('Invalid host observation.');
    if (state.provider === 'openai' && (!cameraOn || (message.frames !== undefined ? message.image !== undefined || !validHostFrames(message.frames) : !validHostImage(message.image)))) return rejectAttempt('A fresh bounded JPEG sequence from the active camera is required. No AI call was made.');
    if (state.provider === 'mock' && (message.image !== undefined || message.frames !== undefined)) return rejectAttempt('Scripted rehearsal must not include camera images.');
    if (message.reason === 'arrival') { state.wrapped = false; challenge = null; if(state.requestCount>0)state.adultMode=false; }
    if (intent === 'welcome') {recentRemarks = []; playedPremises = [];}
    if (intent === 'challenge') { gesture = state.requestCount % 2 ? 'pose' : 'wave'; intent = 'challenge-invite'; }
    const ownEpoch = epoch, sessionId = state.sessionId, controller = pending = new AbortController();
    const sequence = state.requestCount++;
    // Only a new encounter resets novelty, not silence, movement or dial changes.
    if (message.reason === 'arrival') {recentRemarks = []; playedPremises = [];}
    lastRequest = now();
    state.phase = 'thinking'; state.message = state.provider === 'mock' ? 'Choosing one scripted remark…' : 'Reading the recent action and preparing one short AI remark…'; onChange();
    let timer;
    try {
      const cancelled = new Promise((_, rejectCancelled) => { controller.signal.addEventListener('abort', () => rejectCancelled(new Error('cancelled')), { once: true }); });
      const timeout = new Promise((_, rejectTimeout) => { timer = setTimeout(() => { controller.abort(); rejectTimeout(new Error('timeout')); }, timeoutMs); });
      let result = await Promise.race([state.provider === 'mock' ? Promise.resolve(mockReply({ people: message.people, sequence, tone: state.tone, adultMode: state.adultMode, intent, gesture })) : openai({ people: message.people, image: message.image, frames: message.frames, adultMode: state.adultMode, reason: message.reason, tone: state.tone, sequence, intent, gesture, recentRemarks: [...recentRemarks], playedPremises: structuredClone(playedPremises), signal: controller.signal }), timeout, cancelled]);
      if (ownEpoch !== epoch || controller.signal.aborted || !state.active) return;
      if (now()-lastRequest>12000) result = {text:'',silent:true,stale:true};
      if (result.silent) { if(result.silentReason==='empty'){recentRemarks=[];playedPremises=[];} challenge = null; }
      if (intent === 'challenge-payoff') reservation.challengePayoff = true;
      if (result.text) reservation.candidate = {text:result.text,novelty:result.novelty};
      const {novelty: privateNovelty,...publicResult}=result;
      if (result.text && intent === 'challenge-invite') { challenge = { id: randomUUID(), kind: gesture, expiresAt: Infinity }; reservation.challengeId = challenge.id; }
      if (result.text && intent === 'farewell') state.wrapped = true;
      reservation.phase = 'playback'; pending = null;
      state.message = 'Playing one remark. Further Speak clicks are not queued.';
      reserveTimeout(30000, 'The player did not finish its remark. Session stopped; no retry was scheduled.');
      onResult({ type: 'host-result', sessionId, requestId, ...(cueId ? { cueId } : {}), ...publicResult, latencyMs: Math.max(0,Math.round(now()-lastRequest)), frameCount: message.frames?.length || (message.image ? 1 : 0), performance: intent, ...(challenge && intent === 'challenge-invite' ? { challenge: { id: challenge.id, kind: challenge.kind } } : {}) }); onChange();
    } catch {
      if (ownEpoch !== epoch || !state.active) return;
      // A failure ends the session; no retry or silent paid fallback is scheduled.
      stop('AI unavailable or timed out. No automatic retry. Choose rehearsal or explicitly start again.');
      state.phase = 'error'; onChange();
      onRejected({ type: 'host-rejected', sessionId, requestId, ...(cueId ? { cueId } : {}), message: state.message });
    } finally {
      clearTimeout(timer);
      delete message.image; delete message.frames;
      if (pending === controller) pending = null;
    }
  }
  function invalidate(message) {
    if(!state.active || message.sessionId!==state.sessionId || (!pending&&!reservation))return false;
    interruptBeat('Scene changed. Discarding the old observation and taking a fresh look.',message.turnover===true);
    // New arrivals invalidate the previous operator's adult-only audience context.
    if(message.turnover===true)state.adultMode=false;
    onChange();return true;
  }
  return { invalidate, state, start, stop, observe, cue, idle, action, endChallenge, setControlMode, setTone, setAdultMode };
}
