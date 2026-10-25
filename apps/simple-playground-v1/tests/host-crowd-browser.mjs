// Real browser plumbing; fake camera, synthetic PCM and an in-process provider only.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlaygroundServer} from '../server.mjs';
const wav=Buffer.alloc(44+16000*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);for(let i=0;i<16000;i++)wav.writeInt16LE(Math.sin(i*2*Math.PI*220/16000)*7000,44+i*2);
const audio={mime:'audio/wav',base64:wav.toString('base64')};
const temp=await mkdtemp(join(tmpdir(),'host-crowd-')),requests=[],checks=[],external=[],errors=[];
let browser,hold=false,release,heldSignal;
const app=await createPlaygroundServer({port:0,stateFile:join(temp,'state.json'),hostOptions:{apiKey:'synthetic-fixture',provider:async input=>{
 requests.push({at:Date.now(),adultMode:input.adultMode,ages:input.frames.map(f=>f.ageMs),intent:input.intent});
 if(hold){heldSignal=input.signal;return new Promise(r=>{release=r;});}
 await new Promise(r=>setTimeout(r,220));return {text:'That cape is doing all the work. You are basically its transportation.',audio};
}}});
const base=`http://127.0.0.1:${app.port}`,snapshot=()=>fetch(base+'/api/state').then(r=>r.json());
try{
 browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{channel:'chrome'}),headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({permissions:['camera']});
 await context.route('**/*',r=>{const u=r.request().url();if(!u.startsWith(base)&&!u.startsWith('blob:')&&!u.startsWith('data:')){external.push(u);return r.abort();}return r.continue();});
 await context.addInitScript(()=>{
  window.__outputNodes=new Set();window.__ready=[];window.__plays=[];
  const connect=AudioNode.prototype.connect,disconnect=AudioNode.prototype.disconnect;
  AudioNode.prototype.connect=function(...args){if(args[0] instanceof AudioDestinationNode)window.__outputNodes.add(this);return connect.apply(this,args);};
  AudioNode.prototype.disconnect=function(...args){window.__outputNodes.delete(this);return disconnect.apply(this,args);};
  const NativeWS=window.WebSocket;window.WebSocket=class extends NativeWS{constructor(...args){super(...args);this.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.type==='host-result')window.__ready.push({at:Date.now(),latencyMs:m.latencyMs,frameCount:m.frameCount});});}};
  const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){if(!this.__timed){this.__timed=true;this.addEventListener('playing',()=>window.__plays.push(Date.now()));}return play.apply(this,args);};
 });
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const admin=await context.newPage();await admin.goto(base);await admin.locator('[data-scene="spooky"]').click();await expect(admin.locator('#host-adult-mode')).toBeDisabled();
 const opened=context.waitForEvent('page');await admin.locator('#open-player').click();const player=await opened;await player.waitForLoadState();
 await admin.locator('#camera-toggle').click();await expect(admin.locator('#camera-note')).toContainText('fake');await player.locator('#stage').click();
 await admin.locator('#host-start').click();await expect.poll(()=>requests.length,{timeout:18000}).toBeGreaterThanOrEqual(3);
 await expect.poll(async()=>(await snapshot()).host.phase).toBe('ready');
 const timing=await player.evaluate(()=>({ready:window.__ready,plays:window.__plays}));
 assert.equal(requests[0].adultMode,false);assert.equal(requests[2].ages.length,3);
 for(const r of requests){assert.ok(r.ages.length>=1&&r.ages.length<=3);assert.ok(r.ages.at(-1)<=700);assert.ok(r.ages[0]<=1800);for(let i=1;i<r.ages.length;i++)assert.ok(r.ages[i]<r.ages[i-1]);}
 const gaps=requests.slice(1).map((r,i)=>r.at-requests[i].at);assert.ok(gaps.every(g=>g>=3000));
 const firstPlay=timing.plays.find(at=>at>=requests[0].at);assert.ok(firstPlay);assert.ok(timing.ready[0].latencyMs>=200);
 checks.push('Auto delivers chronological fresh sequences, repeats without overlap and respects the three-second request minimum');
 await admin.locator('#host-control-mode').selectOption('operator');await expect.poll(async()=>(await snapshot()).host.active).toBe(false);
 await admin.locator('#host-speak').click();await expect.poll(async()=>(await snapshot()).host.phase).toBe('ready');
 await admin.locator('#host-adult-mode').check();await expect.poll(async()=>(await snapshot()).host.adultMode).toBe(true);
 hold=true;const before=requests.length;await admin.locator('#host-welcome').click();await expect.poll(()=>requests.length,{timeout:8000}).toBe(before+1);assert.equal(requests.at(-1).adultMode,true);
 await admin.locator('#host-adult-mode').uncheck();await expect.poll(()=>heldSignal.aborted).toBe(true);hold=false;release({text:'A late adult response must never play.',audio});
 await expect(admin.locator('#host-transcript')).toHaveText('');assert.equal((await snapshot()).host.adultMode,false);
 checks.push('Adults-only requires an active operator confirmation; switching to safe mode aborts pending speech and drops late output');
 await admin.locator('#host-welcome').click();await expect.poll(()=>player.evaluate(()=>window.__outputNodes.size),{timeout:8000}).toBe(1);
 await admin.locator('#host-quiet').click();await expect.poll(()=>player.evaluate(()=>window.__outputNodes.size)).toBe(0);await expect(admin.locator('#host-adult-mode')).not.toBeChecked();
 const quietCount=requests.length;await new Promise(r=>setTimeout(r,3500));assert.equal(requests.length,quietCount);
 await admin.locator('#host-resume').click();await expect.poll(async()=>(await snapshot()).host.active).toBe(true);await expect(admin.locator('#host-adult-mode')).not.toBeChecked();
 await admin.locator('#host-stop').click();await expect.poll(async()=>(await snapshot()).host.active).toBe(false);await expect(admin.locator('#host-adult-mode')).toBeDisabled();
 checks.push('Quiet stops actual PCM and effect tails; Resume and Stop preserve family defaults, and TV stays text-free');
 await expect.poll(()=>player.locator('body').innerText()).toBe('');await admin.locator('#camera-toggle').click();await context.close();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const report={passed:true,checks,syntheticTiming:{providerDelayMs:220,firstReadyMs:timing.ready[0].latencyMs,firstAudioPlayingMs:firstPlay-requests[0].at,requestGapsMs:gaps,frameAgesMs:requests.slice(0,3).map(r=>r.ages)},liveApiLatencyMeasured:false,realCamera:false,realMicrophone:false,paidCalls:0,externalRequests:external,browserErrors:errors};
 await mkdir('work',{recursive:true});await writeFile('work/host-crowd-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{release?.({text:'Cancelled fixture.',audio});await browser?.close();await app.close();await rm(temp,{recursive:true,force:true});}
