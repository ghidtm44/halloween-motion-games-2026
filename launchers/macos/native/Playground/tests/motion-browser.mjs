// Isolated Chrome, fake camera and synthetic landmark stream. No real media or API.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlaygroundServer} from '../server.mjs';
const temp=await mkdtemp(join(tmpdir(),'motion-browser-')),checks=[],errors=[],external=[];
const app=await createPlaygroundServer({port:0,stateFile:join(temp,'state.json'),motionOnly:true});
const base=`http://127.0.0.1:${app.port}`,state=()=>fetch(base+'/api/state').then(r=>r.json());let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['camera']});
 await context.route('**/*',r=>{const u=r.request().url();if(!u.startsWith(base)&&!u.startsWith('data:')&&!u.startsWith('blob:')){external.push(u);return r.abort();}return r.continue();});
 await context.addInitScript(()=>{
  window.__poses=[];window.__textCalls=0;window.__cameraStarts=0;window.__liveWorkers=0;window.__frames=0;
  const fill=CanvasRenderingContext2D.prototype.fillText,stroke=CanvasRenderingContext2D.prototype.strokeText;
  CanvasRenderingContext2D.prototype.fillText=function(...args){if(this.canvas.id==='stage')window.__textCalls++;return fill.apply(this,args);};CanvasRenderingContext2D.prototype.strokeText=function(...args){if(this.canvas.id==='stage')window.__textCalls++;return stroke.apply(this,args);};
  if(!navigator.mediaDevices)return;const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{if(options.audio)throw new Error('Microphone requested');window.__cameraStarts++;return media(options);};
  window.Worker=class{constructor(){window.__liveWorkers++;this.stopped=false;}postMessage(m){if(m.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready',status:'Synthetic local tracking ready'}}));else if(m.type==='frame'){window.__frames++;queueMicrotask(()=>{if(this.stopped){m.image.close();return;}this.onmessage?.({data:{type:'frame',landmarks:structuredClone(window.__poses),image:m.image,mask:null,timestamp:m.timestamp,inferenceMs:1}});});}}terminate(){if(!this.stopped)window.__liveWorkers--;this.stopped=true;}};
 });
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const admin=await context.newPage();await admin.goto(base);await expect(admin.locator('#connection')).toContainText('ready');
 await expect(admin.locator('[data-scene]:visible')).toHaveCount(3);await expect(admin.locator('[data-scene="spooky"]')).toBeHidden();
 for(const old of ['pumpkin','enchanted','midnight'])await expect(admin.locator(`[data-scene="${old}"]`)).toHaveCount(0);
 const opened=context.waitForEvent('page');await admin.locator('#open-player').click();const player=await opened;await player.waitForLoadState();await player.setViewportSize({width:1280,height:720});
 await player.locator('#stage').click();await expect.poll(()=>player.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await mkdir('work',{recursive:true});
 for(const scene of ['jungle','depths','space']){await admin.locator(`[data-scene="${scene}"]`).click();await expect.poll(async()=>(await state()).settings.scene).toBe(scene);await expect.poll(()=>player.locator('body').innerText()).toBe('');await player.screenshot({path:`work/motion-${scene}.png`});}
 assert.equal(await player.evaluate(()=>window.__textCalls),0);assert.equal((await state()).settings.cameraOn,false);checks.push('Only three new choices; empty worlds animate with no DOM/canvas text, and switching preserves fullscreen');
 await admin.locator('#camera-toggle').click();await expect(admin.locator('#camera-note')).toContainText('fake');
 await player.evaluate(()=>{window.__poses=[.18,.46,.76].map(x=>{const p=Array.from({length:33},()=>({x,y:.45,visibility:1}));p[0].y=.23;for(const i of [11,12])p[i].y=.38;for(const i of [23,24])p[i].y=.7;p[11].x=x-.04;p[12].x=x+.04;p[23].x=x-.035;p[24].x=x+.035;p[15]={x:x-.09,y:.38,visibility:1};p[16]={x:x+.09,y:.38,visibility:1};return p;});window.__savedStream=document.querySelector('video').srcObject;});
 await expect(admin.locator('#people')).toHaveText('3');const starts=await player.evaluate(()=>window.__cameraStarts);
 for(const scene of ['jungle','depths','space','jungle']){await admin.locator(`[data-scene="${scene}"]`).click();await expect.poll(async()=>(await state()).settings.scene).toBe(scene);await expect(admin.locator('#people')).toHaveText('3');assert.equal(await player.evaluate(()=>document.querySelector('video').srcObject===window.__savedStream),true);}
 assert.equal(await player.evaluate(()=>window.__cameraStarts),starts);assert.equal(await player.evaluate(()=>window.__liveWorkers),1);
 checks.push('Live world switching retains the same camera stream, worker and three synthetic participants without restart');
 await admin.locator('#mirror').uncheck();await expect.poll(async()=>(await state()).settings.mirror).toBe(false);assert.equal(await player.evaluate(()=>window.__cameraStarts),starts);await admin.locator('#mirror').check();
 await player.evaluate(()=>{window.__poses[1].forEach(p=>p.visibility=.1);});await expect(admin.locator('#people')).toHaveText('3');
 await player.evaluate(()=>{window.__poses=[];});await expect(admin.locator('#people')).toHaveText('0');
 await admin.locator('[data-scene="depths"]').click();await expect.poll(()=>player.locator('body').innerText()).toBe('');
 await admin.locator('#pause').click();await expect(admin.locator('#pause')).toContainText('Resume');await expect.poll(()=>player.locator('body').innerText()).toBe('');await admin.locator('#pause').click();
 checks.push('Mirror, pause and empty-frame switching keep admin control and text-free output; occlusion and exit are fed through the real player');
 await expect.poll(()=>admin.locator('#camera-select option').count()).toBeGreaterThan(1);const id=await admin.locator('#camera-select option').nth(1).getAttribute('value');await admin.locator('#camera-select').selectOption(id);await expect.poll(()=>player.evaluate(()=>window.__cameraStarts)).toBe(starts+1);await expect.poll(()=>player.evaluate(()=>window.__liveWorkers)).toBe(1);
 const fps=(await state()).status.fps;assert.ok(fps>=25,`Synthetic stage fps ${fps}`);
 await admin.locator('#camera-toggle').click();await expect.poll(()=>player.locator('#camera-video').evaluate(v=>v.srcObject===null)).toBe(true);await expect.poll(()=>player.evaluate(()=>window.__liveWorkers)).toBe(0);
 await admin.locator('#guide-button').click();await expect(admin.locator('#guide')).toBeVisible();await admin.locator('.dialog-close').click();await admin.screenshot({path:'work/motion-admin.png',fullPage:true});
 await player.close();await expect.poll(async()=>(await state()).playerConnected).toBe(false);checks.push('Input selection restarts only the chosen camera; Stop/disconnect clean up; admin guide remains usable');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const report={passed:true,checks,syntheticStageFps:fps,externalRequests:external,browserErrors:errors,realCamera:false,realMicrophone:false,paidCalls:0,limitation:'Synthetic landmarks/fake camera validate rendering and lifecycle; real 2–3-person accuracy and physical TV alignment require a supervised rehearsal.'};
 await writeFile('work/motion-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await context.close();
}finally{await browser?.close();await app.close();await rm(temp,{recursive:true,force:true});}
