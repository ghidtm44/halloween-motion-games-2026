// Synthetic browser/audio validation. No camera, microphone, network model or speakers needed.
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {createPlaygroundServer} from '../server.mjs';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'world-polish-')),errors=[];let browser;
const app=await createPlaygroundServer({port:0,stateFile:join(dir,'state.json'),motionOnly:true}),base=`http://127.0.0.1:${app.port}`;
const vite=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await vite.listen();const dev=`http://127.0.0.1:${vite.httpServer.address().port}`;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});const context=await browser.newContext({viewport:{width:1280,height:720}});
 await context.route('**/*',r=>[base,dev].some(origin=>r.request().url().startsWith(origin))||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
 await context.addInitScript(()=>{window.__audio=[];const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(...args){super(...args);window.__audio.push(this);}};navigator.mediaDevices.getUserMedia=()=>{throw Error('Hardware capture forbidden in polish test');};});
 const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));await admin.goto(base);await expect(admin.locator('#connection')).toContainText('ready');
 const opened=context.waitForEvent('page');await admin.locator('#open-player').click();const player=await opened;player.on('pageerror',e=>errors.push(e.message));await player.waitForLoadState();await player.waitForTimeout(850);
 assert.equal(await player.evaluate(()=>window.__audio.length),0,'No autoplay context before direct gesture');assert.equal(await player.locator('body').innerText(),'');
 await player.locator('#stage').click();await expect(admin.locator('#music-note')).toContainText('Music enabled');assert.equal(await player.evaluate(()=>window.__audio.length),1);
 await admin.locator('#play-density').fill('0.8');await admin.locator('#play-density').dispatchEvent('input');await expect(admin.locator('#density-label')).toHaveText('Lively');
 await admin.locator('#music-volume').fill('0.4');await admin.locator('#music-volume').dispatchEvent('input');await admin.locator('#music-muted').check();
 await expect.poll(async()=>{const state=await(await fetch(base+'/api/state')).json();return [state.settings.playDensity,state.settings.musicVolume,state.settings.musicMuted];}).toEqual([.8,.4,true]);
 await admin.locator('#music-muted').uncheck();await mkdir('work/polish',{recursive:true});
 for(const world of ['jungle','depths','space']){await admin.locator(`[data-scene="${world}"]`).click();await player.waitForTimeout(600);const first=await player.locator('#stage').evaluate(c=>c.toDataURL());await player.waitForTimeout(250);const second=await player.locator('#stage').evaluate(c=>c.toDataURL());assert.notEqual(first,second,'Living environment animates when empty');await player.screenshot({path:`work/polish/${world}.png`});assert.equal(await player.locator('body').innerText(),'');}
 await admin.locator('#pause').click();await player.waitForTimeout(150);await admin.locator('#pause').click();
 const checks=await context.newPage();await checks.goto(dev+'/models/manifest.json');
 const dsp=await checks.evaluate(async()=>{
  const {WorldMusic}=await import('/src/world-music.ts'),renders=[];
  for(const world of ['jungle','depths','space']){
   const offline=new OfflineAudioContext(1,48000*2,48000);let time=0;
   const facade={get currentTime(){return time;},state:'running',resume:async()=>{},close:async()=>{},destination:offline.destination,createGain:()=>offline.createGain(),createOscillator:()=>offline.createOscillator(),createDynamicsCompressor:()=>offline.createDynamicsCompressor()};
   const music=new WorldMusic(()=>facade);await music.enable();music.configure(world,1,false,true);for(time=0;time<1;time+=.025){music.tick();if(Math.abs(time-.5)<.01)music.celebrate();}
   const audio=await offline.startRendering(),samples=audio.getChannelData(0);let sum=0,peak=0;for(const v of samples){sum+=v*v;peak=Math.max(peak,Math.abs(v));}renders.push({world,peak,rms:Math.sqrt(sum/samples.length)});music.dispose();
  }
  const music=new WorldMusic();await music.enable();music.configure('jungle',.3,false,true);music.tick();const active=music.resourceCounts;
  for(let i=0;i<60;i++){music.configure(['jungle','depths','space'][i%3],.3,false,true);music.tick();music.celebrate();}
  const switched=music.resourceCounts;music.configure('space',.3,true,true);const muted=music.resourceCounts;
  music.configure('depths',.3,false,true);music.tick();music.configure('depths',.3,false,false);const paused=music.resourceCounts;music.dispose();const disposed=music.resourceCounts;
  // Benchmark only the compositor's new work, not inference or live field performance.
  const {CutoutStability}=await import('/src/cutout-stability.ts'),cutouts=new CutoutStability(),pose={id:1,landmarks:Array.from({length:33},()=>({x:.5,y:.5,visibility:1}))},durations=[];
  for(let i=0;i<300;i++){const mask=new ImageData(256,256);for(let n=3;n<mask.data.length;n+=4)mask.data[n]=150+(i%20);const at=i*70,start=performance.now();cutouts.accept({timestamp:at,poses:[pose],mask,image:{close(){}},inferenceMs:0},at);cutouts.view(at);durations.push(performance.now()-start);}cutouts.clear();durations.sort((a,b)=>a-b);
  return {renders,active,switched,muted,paused,disposed,stabilityMs:{median:durations[150],p95:durations[285]}};
 });
 for(const row of dsp.renders){assert.ok(row.rms>.001);assert.ok(row.peak<.8,'Headroom at maximum music volume');}
 assert.ok(dsp.active.voices>0);assert.ok(dsp.switched.voices<=16);assert.ok(dsp.switched.buses<=3);for(const state of [dsp.muted,dsp.paused,dsp.disposed])assert.equal(state.voices,0);assert.equal(dsp.disposed.contexts,0);assert.equal(dsp.disposed.buses,0);assert.deepEqual(errors,[]);
 const report={passed:true,hardwareCapture:false,paidCalls:0,actualSpeakerListening:false,offlineOriginalSynthesis:true,...dsp};await writeFile('work/polish/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await vite.close();await app.close();await rm(dir,{recursive:true,force:true});}
