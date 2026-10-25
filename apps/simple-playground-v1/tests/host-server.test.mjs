import {comedyFixture} from './host-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createPlaygroundServer } from '../server.mjs';
import { createHostSession, validHostImage } from '../host-session.mjs';
import { createOpenAIProvider, cleanHostLine, HOST_INSTRUCTIONS } from '../host-provider.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,11,8,1,104,2,128,1,1,17,0,255,217]).toString('base64');
function session(options = {}) {
  const results = [], rejections = [], snapshots = [];
  let runtime;
  runtime = createHostSession({ options: { apiKey: '', ...options }, onChange: () => snapshots.push(structuredClone(runtime.state)), onResult: value => results.push(value), onRejected: value => rejections.push(value) });
  const click = (provider = runtime.state.provider) => runtime.cue(provider, runtime.state.controlMode, true);
  const observe = (cue, fields = {}, cameraOn = true) => runtime.observe({ requestId: 'request', sessionId: runtime.state.sessionId, people: 2, reason: 'speak', ...(cue?.cueId ? { cueId: cue.cueId } : {}), ...(runtime.state.provider === 'openai' ? { image: jpeg } : {}), ...fields }, cameraOn);
  const idle = (cue, requestId = 'request') => runtime.idle({ sessionId: runtime.state.sessionId, ...(cue?.cueId ? { cueId: cue.cueId } : {}), requestId });
  return { runtime, results, rejections, snapshots, observe, click, idle };
}

test('Operator is default; only one explicit Speak cue permits one deterministic mock remark', async () => {
  let calls = 0;
  const f = session({ provider: async () => { calls++; } });
  assert.equal(f.runtime.state.controlMode, 'operator');
  await f.observe(); assert.equal(calls, 0); assert.equal(f.results.length, 0);
  f.runtime.start('mock'); await f.observe(); assert.equal(f.results.length, 0);
  const cue = f.click(); await f.observe(cue);
  assert.equal(f.results.length, 1); assert.match(f.results[0].text, /whole crew/);
  assert.equal(f.results[0].audio, undefined); assert.equal(calls, 0);
  assert.equal(f.runtime.state.requestCount, 1);
  assert.equal(JSON.stringify(f.runtime.state).includes(f.results[0].text), false);
  assert.equal(f.runtime.state.phase, 'thinking', 'Playback still owns the reservation');
  f.idle(cue); assert.equal(f.runtime.state.phase, 'ready');
});

test('missing key is explicit and does not silently start a mock or paid session', async () => {
  const f = session();
  assert.match(f.click('openai').error, /not configured/);
  assert.equal(f.runtime.state.active, false); assert.equal(f.runtime.state.phase, 'error');
  await f.observe(); assert.equal(f.results.length, 0);
});

test('one request and playback at a time, three-second cadence, and bounded session cap', async () => {
  let now = 10000, resolveReply, calls = 0;
  const f = session({ apiKey: 'test-only-key', now: () => now, limit: 2, provider: () => { calls++; return new Promise(resolve => { resolveReply = resolve; }); } });
  const firstCue = f.click('openai'), pending = f.observe(firstCue);
  await f.observe(firstCue, { requestId: 'duplicate' });
  assert.equal(calls, 1); assert.match(f.rejections.at(-1).message, /unused operator/);
  assert.match(f.click('openai').error, /No Speak click was queued/);
  resolveReply({ text: 'Welcome, wonderful wanderers!' }); await pending;
  assert.match(f.click('openai').error, /No Speak click was queued/); f.idle(firstCue);
  now += 2999; assert.match(f.click('openai').error, /three seconds/); assert.equal(calls, 1);
  now++; const secondCue=f.click('openai'), second=f.observe(secondCue);resolveReply({text:'The pumpkins send their regards.'});await second;f.idle(secondCue);
  assert.equal(calls,2);now+=8000;assert.match(f.click('openai').error,/limit/);assert.equal(f.runtime.state.active,false);
});

test('automatic observations are rejected in Operator; explicit Auto permits arrivals and comments only', async () => {
  let now=10000,calls=0;
  const f=session({apiKey:'test',now:()=>now,provider:async()=>{calls++;return {text:'Hello, wonderful guests!'};}});
  f.runtime.start('openai','operator');
  for(const reason of ['arrival','comment','again'])await f.observe(undefined,{reason});
  assert.equal(calls,0);
  f.runtime.start('openai','auto');await f.observe(undefined,{reason:'arrival'});assert.equal(calls,1);f.idle();
  now+=8000;await f.observe(undefined,{reason:'comment',requestId:'followup'});assert.equal(calls,2);f.idle(undefined,'followup');
  now+=8000;await f.observe(undefined,{reason:'speak'});assert.equal(calls,2,'manual clicks still require a cue in Auto');
});

test('Speak tokens expire, cannot be replayed, and mode changes invalidate them', async()=>{
 let now=10000;const f=session({now:()=>now});
 const expired=f.click();now+=10001;await f.observe(expired);assert.equal(f.results.length,0);
 f.runtime.stop();const cue=f.click();await f.observe(cue);f.idle(cue);now+=8000;await f.observe(cue);assert.equal(f.results.length,1);
 const prior=f.click();f.runtime.setControlMode('auto');assert.equal(f.runtime.state.active,false);await f.observe(prior);assert.equal(f.results.length,1);
});

test('stop invalidates a late result, aborts provider and rejects old-session observations',async()=>{
 let finish,signal;const f=session({apiKey:'test',provider:input=>{signal=input.signal;return new Promise(resolve=>{finish=resolve;});}});
 const cue=f.click('openai'),prior=f.runtime.state.sessionId,pending=f.observe(cue);f.runtime.stop();assert.equal(signal.aborted,true);
 finish({text:'This must never speak.'});await pending;assert.equal(f.results.length,0);
 f.runtime.start('mock');assert.notEqual(f.runtime.state.sessionId,prior);await f.observe(cue,{sessionId:prior});assert.equal(f.results.length,0);
});

test('provider timeout ends session without retry or leaked provider error',async()=>{
 let calls=0,aborted=false;const f=session({apiKey:'test',timeoutMs:20,provider:({signal})=>{calls++;signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}});
 const cue=f.click('openai');await f.observe(cue);assert.equal(calls,1);assert.equal(aborted,true);assert.equal(f.runtime.state.active,false);assert.equal(f.runtime.state.phase,'error');assert.match(f.runtime.state.message,/No automatic retry/);
 await f.observe(cue);assert.equal(calls,1);
});

test('live requires one valid JPEG and active camera; mock forbids images; unavailable capture can release cue',async()=>{
 assert.equal(validHostImage(jpeg),true);
 for(const value of ['https://example.com/picture.jpg','data:image/png;base64,abcd',jpeg+'a'.repeat(300000),'data:image/jpeg;base64,YWJjZA=='])assert.equal(validHostImage(value),false);
 let calls=0;const f=session({apiKey:'test',provider:async()=>{calls++;return {text:'Hello!'};}});
 let cue=f.click('mock');await f.observe(cue,{image:jpeg});assert.equal(f.results.length,0);
 f.runtime.stop();
 for(const fields of [{image:undefined},{image:'https://example.com/picture.jpg'}]){cue=f.click('openai');await f.observe(cue,fields);assert.equal(calls,0);}
 cue=f.click('openai');await f.observe(cue,{},false);assert.equal(calls,0);
 cue=f.click('openai');assert.equal(f.idle(cue),true,'No-image client can abandon its one-use capture reservation');
 await f.observe(cue);assert.equal(calls,0);
 cue=f.click('openai');await f.observe(cue);assert.equal(calls,1);
});

test('padded JPEG markers with truncated dimensions reject safely and release the Speak reservation', async () => {
  let calls = 0;
  const f = session({ apiKey: 'test', provider: async () => { calls++; return { text: 'Hello!' }; } });
  for (const marker of [0xc0, 0xc1, 0xc2]) {
    const image = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, ...Array(10).fill(0xff), marker, 0, 2, 0xff, 0xd9]).toString('base64');
    assert.equal(validHostImage(image), false);
    const cue = f.click('openai');
    await assert.doesNotReject(f.observe(cue, { image }));
    assert.match(f.rejections.at(-1).message, /fresh bounded JPEG/);
    assert.equal(f.runtime.state.phase, 'ready');
    assert.equal(f.runtime.state.requestCount, 0);
  }
  assert.equal(calls, 0);
  const cue = f.click('openai');
  await f.observe(cue);
  assert.equal(calls, 1, 'A valid later Speak request still succeeds');
  f.idle(cue);
});

test('Responses and Speech requests use fixed destinations, private key, no storage, and bounded untrusted image input', async () => {
  const requests = [];
  const provider = createOpenAIProvider({ apiKey: 'secret-test-sentinel', fetchImpl: async (url, options) => {
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    if (url.endsWith('/responses')) return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: comedyFixture('That looks like a splendid wizard hat! Did your broom get a parking ticket?') }] }] });
    if (url.endsWith('/moderations')) return Response.json({ results: [{ flagged: false }] });
    return new Response(new Uint8Array([73,68,51,4,0,0]), { headers: { 'content-type': 'audio/mpeg' } });
  } });
  const result = await provider({ people: 3, image: jpeg, reason: 'arrival', signal: new AbortController().signal });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses'); assert.equal(requests[1].url, 'https://api.openai.com/v1/moderations'); assert.equal(requests[2].url, 'https://api.openai.com/v1/audio/speech');
  assert.equal(requests[0].body.store, false); assert.equal(requests[0].body.max_output_tokens, 450);
  const sentImage=requests[0].body.input[0].content.find(item=>item.type==='input_image');
  assert.equal(sentImage.image_url, jpeg); assert.equal(sentImage.detail, 'high');
  assert.equal(requests[0].body.previous_response_id, undefined);
  assert.match(HOST_INSTRUCTIONS, /untrusted data/); assert.match(HOST_INSTRUCTIONS, /Never announce age guesses or infer gender, race, health/);
  assert.equal(requests[2].body.response_format, 'mp3'); assert.equal(requests[2].body.input, result.text);
  assert.equal(requests[1].body.model, 'omni-moderation-latest'); assert.equal(requests[1].body.input, result.text);
  assert.equal(result.audio.mime, 'audio/mpeg'); assert.equal(JSON.stringify(result).includes('secret-test-sentinel'), false);
  assert.equal(JSON.stringify(requests[0].body).includes('secret-test-sentinel'), false);
});

test('refused, unsafe and oversized replies never reach speech generation', async () => {
  for (const text of ['You are stupid.', '<script>bad</script>', 'Hello '.repeat(100)]) assert.throws(() => cleanHostLine(text));
  let calls = 0;
  const provider = createOpenAIProvider({ apiKey: 'test', fetchImpl: async () => { calls++; return Response.json({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }] }); } });
  await assert.rejects(provider({ people: 0, reason: 'again', signal: new AbortController().signal })); assert.equal(calls, 1);
  const tooLarge = createOpenAIProvider({ apiKey: 'test', fetchImpl: async () => new Response('x'.repeat(65000)) });
  await assert.rejects(tooLarge({ people: 0, reason: 'again', signal: new AbortController().signal }));
});

test('moderation blocks flagged or malformed decisions before speech and delivers no caption', async () => {
  for (const decision of [{ results: [{ flagged: true }] }, { results: [] }, { error: 'unavailable' }]) {
    const calls = [];
    const provider = createOpenAIProvider({ apiKey: 'test', fetchImpl: async url => {
      calls.push(url);
      return url.endsWith('/responses') ? Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: comedyFixture('The pumpkins are ready for their inspection!') }] }] }) : Response.json(decision);
    } });
    await assert.rejects(provider({ people: 2, reason: 'again', signal: new AbortController().signal }));
    assert.equal(calls.length, 2); assert.equal(calls.some(url => url.endsWith('/speech')), false);
  }
});

async function serverFixture(t, hostOptions = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'spooky-server-'));
  const stateFile = join(dir, 'state.json');
  const runtime = await createPlaygroundServer({ port: 0, stateFile, hostOptions: { apiKey: '', ...hostOptions } });
  const sockets = [];
  const connect = async role => {
    const ws = new WebSocket(`ws://127.0.0.1:${runtime.port}/sync`, { origin: `http://127.0.0.1:${runtime.port}` });
    const messages = [];
    ws.on('message', data => messages.push(JSON.parse(data.toString()))); ws.on('error', () => {});
    await once(ws, 'open'); sockets.push(ws);
    ws.send(JSON.stringify({ type: 'hello', role, clientId: role + sockets.length }));
    const peer = { messages, ws, send: value => ws.send(JSON.stringify(value)), next: async predicate => {
      for (let i = 0; i < 200; i++) { const index = messages.findIndex(predicate); if (index >= 0) return messages.splice(index, 1)[0]; await wait(5); }
      throw new Error('Expected host test message did not arrive.');
    } };
    await peer.next(m => m.type === 'state'); return peer;
  };
  t.after(async () => { for (const ws of sockets) ws.terminate(); await runtime.close(); await rm(dir, { recursive: true, force: true }); });
  const state = () => fetch(`http://127.0.0.1:${runtime.port}/api/state`).then(r => r.json());
  return { connect, state, stateFile };
}

async function startHost(f, provider = 'mock', controlMode = 'operator') {
  const admin = await f.connect('admin'), player = await f.connect('player');
  admin.send({ type: 'patch', patch: { scene: 'spooky', hostControlMode:controlMode, cameraOn:provider==='openai' } });
  await player.next(m => m.type === 'state' && m.state.settings.scene === 'spooky' && m.state.settings.hostControlMode===controlMode);
  admin.send({ type: controlMode==='auto'?'host-start':'host-speak', provider });
  const live = await player.next(m => m.type === 'state' && m.state.host.active);
  const cue=controlMode==='operator'?await player.next(m=>m.type==='host-cue'):undefined;
  admin.messages.length = 0; player.messages.length = 0;
  return { admin, player, sessionId: live.state.host.sessionId, cue };
}

test('selection sends no image; only admin Speak grants one cue to active player, never standby',async t=>{
 let calls=0;const f=await serverFixture(t,{apiKey:'secret-test-sentinel',provider:async()=>{calls++;return {text:'Welcome, wanderers!'};}});
 const admin=await f.connect('admin'),player=await f.connect('player'),standby=await f.connect('player');
 admin.send({type:'patch',patch:{scene:'spooky',cameraOn:true,hostControlMode:'operator'}});await player.next(m=>m.type==='state'&&m.state.settings.scene==='spooky');
 assert.equal((await f.state()).host.active,false);assert.equal(calls,0);
 player.send({type:'host-speak',provider:'openai'});await player.next(m=>m.type==='error');
 admin.send({type:'host-speak',provider:'openai'});const cue=await player.next(m=>m.type==='host-cue');
 const observation={type:'host-observe',sessionId:cue.sessionId,cueId:cue.cueId,requestId:'first',people:2,reason:'speak',image:jpeg};
 standby.send(observation);await standby.next(m=>m.type==='error');assert.equal(calls,0);
 player.send(observation);await player.next(m=>m.type==='host-result');assert.equal(calls,1);
 player.send(observation);await player.next(m=>m.type==='host-rejected');assert.equal(calls,1);
 const state=await f.state();assert.equal(JSON.stringify(state).includes('secret-test-sentinel'),false);assert.equal(JSON.stringify(state).includes('Welcome, wanderers!'),false);
 assert.equal(admin.messages.some(m=>m.type==='host-result'||m.type==='host-cue'),false);
});

test('Auto must be explicitly selected and started; switching control mode aborts its in-flight image',async t=>{
 let signal,finish,calls=0;const f=await serverFixture(t,{apiKey:'test',provider:input=>{calls++;signal=input.signal;return new Promise(resolve=>{finish=resolve;});}});
 const {admin,player,sessionId}=await startHost(f,'openai','auto');
 player.send({type:'host-observe',sessionId,requestId:'auto',people:2,reason:'arrival',image:jpeg});await admin.next(m=>m.type==='state'&&m.state.host.phase==='thinking');assert.equal(calls,1);
 admin.send({type:'patch',patch:{hostControlMode:'operator'}});await player.next(m=>m.type==='state'&&!m.state.host.active&&m.state.settings.hostControlMode==='operator');assert.equal(signal.aborted,true);
 finish({text:'Do not deliver.'});await wait(10);assert.equal(player.messages.some(m=>m.type==='host-result'),false);
 admin.send({type:'host-start',provider:'openai'});await admin.next(m=>m.type==='error');assert.equal((await f.state()).host.active,false);
});

test('pause, scene, camera stop/selection and control mode changes end sessions; no session persistence',async t=>{
 const f=await serverFixture(t);const {admin,player}=await startHost(f);
 for(const patch of [{paused:true},{scene:'jungle'},{cameraOn:false},{deviceId:'test-camera-selection'},{hostControlMode:'auto'}]){
  if(!(await f.state()).host.active){
   admin.send({type:'patch',patch:{scene:'spooky',hostControlMode:'operator',paused:false,cameraOn:true}});
   await player.next(m=>m.type==='state'&&m.state.settings.scene==='spooky'&&!m.state.settings.paused&&m.state.settings.cameraOn&&m.state.settings.hostControlMode==='operator');
   admin.send({type:'host-speak',provider:'mock'});await player.next(m=>m.type==='host-cue');
  }
  admin.send({type:'patch',patch});await player.next(m=>m.type==='state'&&!m.state.host.active);assert.equal((await f.state()).host.active,false);
 }
 await wait(30);const saved=await readFile(f.stateFile,'utf8');assert.equal(saved.includes('sessionId'),false);assert.equal(saved.includes('requestCount'),false);assert.equal(saved.includes('hostControlMode'),true);
});

test('host preview excludes cached and queued free-play camera thumbnails', async t => {
  const f = await serverFixture(t), admin = await f.connect('admin'), player = await f.connect('player');
  const preview = 'data:image/jpeg;base64,aGVsbG8=';
  player.send({ type: 'status', status: { scene: 'jungle', preview } });
  assert.equal((await admin.next(m => m.type === 'status')).status.preview, preview);
  admin.send({ type: 'patch', patch: { scene: 'spooky' } });
  const changed = await admin.next(m => m.type === 'state' && m.state.settings.scene === 'spooky');
  assert.equal(changed.state.status.preview, undefined);
  for (const scene of ['jungle', undefined, 'unrecognized']) {
    player.send({ type: 'status', status: { scene, preview } });
    assert.equal((await admin.next(m => m.type === 'status')).status.preview, undefined);
  }
  player.send({ type: 'status', status: { scene: 'spooky', preview } });
  const host = (await admin.next(m => m.type === 'status')).status;
  assert.equal(host.scene, 'spooky'); assert.equal(host.preview, preview);
});

test('losing the last admin ends reserved Speak without provider calls',async t=>{
 const f=await serverFixture(t),{admin,player}=await startHost(f);
 admin.ws.close();await player.next(m=>m.type==='state'&&!m.state.host.active&&/disconnected/.test(m.state.host.message));assert.equal((await f.state()).host.active,false);
});

test('active player disconnect cancels pending generation and standby never receives result',async t=>{
 let finish,signal;const f=await serverFixture(t,{apiKey:'test',provider:input=>{signal=input.signal;return new Promise(resolve=>{finish=resolve;});}});
 const {admin,player,sessionId,cue}=await startHost(f,'openai');const standby=await f.connect('player');
 player.send({type:'host-observe',sessionId,cueId:cue.cueId,requestId:'late',people:1,reason:'speak',image:jpeg});await admin.next(m=>m.type==='state'&&m.state.host.phase==='thinking'&&m.state.host.requestCount===1);
 player.ws.close();await standby.next(m=>m.type==='state'&&!m.state.host.active);assert.equal(signal.aborted,true);finish({text:'Never deliver this.'});await wait(20);assert.equal(standby.messages.some(m=>m.type==='host-result'),false);
});

test('live tone changes abort older delivery, preserve request budget and apply new tone/context',async()=>{
 let now=0,finish,inputs=[];
 const f=session({apiKey:'test',now:()=>now,provider:input=>{inputs.push(input);return new Promise(resolve=>{finish=resolve;});}});
 f.runtime.setTone(100);f.runtime.start('openai','auto');
 const old=f.runtime.state.sessionId,pending=f.observe(undefined,{reason:'arrival'});
 assert.equal(inputs[0].tone,100);f.runtime.setTone(0);assert.equal(inputs[0].signal.aborted,true);
 assert.equal(f.runtime.state.active,true);assert.notEqual(f.runtime.state.sessionId,old);assert.equal(f.runtime.state.requestCount,1);
 finish({text:'Old after-dark reply must not play.'});await pending;assert.equal(f.results.length,0);
  now=1000;await f.observe(undefined,{reason:'change'});assert.equal(inputs.length,1,'Tone changes preserve the request cooldown');
  now=3000;let next=f.observe(undefined,{reason:'change'});finish({text:'That purple cape looks ready for a gentle spell.'});await next;f.runtime.idle({sessionId:f.runtime.state.sessionId,requestId:f.results.at(-1).requestId,played:true});
 assert.equal(inputs[1].tone,0);assert.deepEqual(inputs[1].recentRemarks,[]);assert.equal(f.runtime.state.requestCount,2);
 now=13000;next=f.observe(undefined,{reason:'comment'});assert.deepEqual(inputs[2].recentRemarks,['That purple cape looks ready for a gentle spell.']);finish({text:'The stars on that hat are sparkling.'});await next;
 f.runtime.stop();assert.equal(JSON.stringify(f.runtime.state).includes('purple cape'),false);
});
test('default Auto is off until Start; tone is validated, synchronized and survives only as a setting',async t=>{
 const f=await serverFixture(t),admin=await f.connect('admin'),player=await f.connect('player');
 let s=await f.state();assert.equal(s.settings.hostControlMode,'auto');assert.equal(s.settings.hostTone,0);assert.equal(s.host.active,false);assert.equal(s.host.limit,1200);
 for(const hostTone of [-1,101,50.5,'adult']){admin.send({type:'patch',patch:{hostTone}});await admin.next(m=>m.type==='error');assert.equal((await f.state()).settings.hostTone,0);}
 admin.send({type:'patch',patch:{hostTone:100}});await player.next(m=>m.type==='state'&&m.state.settings.hostTone===100);assert.equal((await f.state()).host.tone,100);
 await wait(30);assert.equal(JSON.parse(await readFile(f.stateFile,'utf8')).hostTone,100);
});
test('provider applies operator tone, grounded driveway context and deep voice controls',async()=>{
 const requests=[];
 const provider=createOpenAIProvider({apiKey:'test',fetchImpl:async(url,options)=>{
  requests.push(JSON.parse(options.body));
  if(url.endsWith('/responses'))return Response.json({output:[{type:'message',content:[{type:'output_text',text:comedyFixture('That silver wizard hat has outshone my entire constellation.')}]}]});
  if(url.endsWith('/moderations'))return Response.json({results:[{flagged:false}]});
  return new Response(new Uint8Array([1,2,3]));
 }});
 await provider({people:2,image:jpeg,reason:'change',tone:100,sequence:2,recentRemarks:['A previous remark.'],signal:new AbortController().signal});
 assert.match(requests[0].instructions,/a Halloween-loving neighborhood/);assert.match(requests[0].instructions,/After dark/);assert.match(requests[0].instructions,/Whenever children may be present/);assert.match(requests[0].instructions,/audience is uncertain/);
 assert.match(requests[0].instructions,/Light double entendres/);assert.match(requests[0].instructions,/not bodies, attractiveness/);
 assert.match(requests[0].input[0].content[0].text,/previous remark/);assert.equal(requests[2].voice,'onyx');assert.equal(requests[2].speed,1.03);assert.match(requests[2].instructions,/deep, resonant baritone/);
});
test('empty scene requests no moderation or speech and returns a silent result',async()=>{
 let calls=0;const provider=createOpenAIProvider({apiKey:'test',fetchImpl:async()=>{calls++;return Response.json({output:[{type:'message',content:[{type:'output_text',text:comedyFixture('[[WAIT]]')}]}]});}});
 const reply=await provider({people:0,image:jpeg,reason:'change',signal:new AbortController().signal});
 assert.deepEqual(reply,{text:'',silent:true,silentReason:'empty'});assert.equal(calls,1);
});

test('voice effects validate, synchronize and persist without starting a session',async t=>{
 const f=await serverFixture(t),admin=await f.connect('admin'),player=await f.connect('player');
 assert.equal((await f.state()).settings.hostEffects,.4);assert.equal((await f.state()).settings.hostEffectsBypass,false);
 for(const patch of [{hostEffects:-.1},{hostEffects:1.01},{hostEffects:'1'},{hostEffectsBypass:1}]){admin.send({type:'patch',patch});await admin.next(m=>m.type==='error');}
 admin.send({type:'patch',patch:{hostEffects:.85,hostEffectsBypass:true}});await player.next(m=>m.type==='state'&&m.state.settings.hostEffects===.85);
 assert.equal((await f.state()).host.active,false);await wait(30);
 const saved=JSON.parse(await readFile(f.stateFile,'utf8'));assert.equal(saved.hostEffects,.85);assert.equal(saved.hostEffectsBypass,true);
});

test('adults-only confirmation is admin-only, session-only and never persisted or restored',async t=>{
 const f=await serverFixture(t),admin=await f.connect('admin'),player=await f.connect('player');
 admin.send({type:'patch',patch:{hostAdultMode:true}});await admin.next(m=>m.type==='error');
 assert.equal((await f.state()).settings.hostAdultMode,false);
 admin.send({type:'patch',patch:{scene:'spooky'}});await player.next(m=>m.type==='state'&&m.state.settings.scene==='spooky');
 admin.send({type:'host-start',provider:'mock'});await player.next(m=>m.type==='state'&&m.state.host.active);
 player.send({type:'patch',patch:{hostAdultMode:true}});await player.next(m=>m.type==='error');assert.equal((await f.state()).host.adultMode,false);
 for(const value of ['yes',1,null]){admin.send({type:'patch',patch:{hostAdultMode:value}});await admin.next(m=>m.type==='error');}
 admin.send({type:'patch',patch:{hostAdultMode:true}});await player.next(m=>m.type==='state'&&m.state.settings.hostAdultMode&&m.state.host.adultMode);
 await wait(30);const saved=JSON.parse(await readFile(f.stateFile,'utf8'));assert.equal(saved.hostAdultMode,false);
 // Even a legacy/manually saved true cannot enable adult comedy on app startup.
 await writeFile(f.stateFile,JSON.stringify({...saved,hostAdultMode:true}));
 const restarted=await createPlaygroundServer({port:0,stateFile:f.stateFile,hostOptions:{apiKey:''}});
 try{const state=await fetch(`http://127.0.0.1:${restarted.port}/api/state`).then(r=>r.json());assert.equal(state.settings.hostAdultMode,false);assert.equal(state.host.adultMode,false);}finally{await restarted.close();}
 admin.send({type:'host-action',action:'quiet'});await player.next(m=>m.type==='state'&&m.state.host.quiet&&!m.state.settings.hostAdultMode);
 admin.send({type:'host-action',action:'resume',provider:'mock'});await player.next(m=>m.type==='state'&&m.state.host.active&&!m.state.host.quiet);assert.equal((await f.state()).host.adultMode,false);
 admin.send({type:'patch',patch:{hostAdultMode:true}});await player.next(m=>m.type==='state'&&m.state.host.adultMode);
 admin.send({type:'host-stop'});await player.next(m=>m.type==='state'&&!m.state.host.active&&!m.state.settings.hostAdultMode);
 admin.send({type:'host-start',provider:'mock'});await player.next(m=>m.type==='state'&&m.state.host.active);assert.equal((await f.state()).settings.hostAdultMode,false);
});

test('rescue controls require admin; Quiet is explicit and a player cannot resume it',async t=>{
 const f=await serverFixture(t),admin=await f.connect('admin'),player=await f.connect('player');
 admin.send({type:'patch',patch:{scene:'spooky'}});await player.next(m=>m.type==='state'&&m.state.settings.scene==='spooky');
 admin.send({type:'host-start',provider:'mock'});await player.next(m=>m.type==='state'&&m.state.host.active);
 player.send({type:'host-action',action:'quiet'});await player.next(m=>m.type==='error');assert.equal((await f.state()).host.active,true);
 admin.send({type:'host-action',action:'quiet'});await player.next(m=>m.type==='state'&&m.state.host.quiet);assert.equal((await f.state()).host.active,false);
 player.send({type:'host-action',action:'resume',provider:'mock'});await player.next(m=>m.type==='error');assert.equal((await f.state()).host.quiet,true);
 admin.send({type:'host-action',action:'resume',provider:'mock'});await player.next(m=>m.type==='state'&&m.state.host.active&&!m.state.host.quiet);
});
