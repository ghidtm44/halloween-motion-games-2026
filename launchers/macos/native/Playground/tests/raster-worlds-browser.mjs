// Real Canvas/raster decoding and synthetic gestures; never hardware capture.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('public/art/worlds-v2/manifest.json','utf8'));
for(const a of manifest.assets){const bytes=await readFile('public/art/worlds-v2/'+a.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);assert.ok(bytes.length>100);}
const vite=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await vite.listen();const base=`http://127.0.0.1:${vite.httpServer.address().port}`;let browser;const errors=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.route('**/*',r=>r.request().url().startsWith(base)||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>{throw Error('Hardware capture forbidden');};});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/models/manifest.json');
 const readiness=await page.evaluate(async()=>{
  const art=await import('/src/world-art.ts');await art.preloadWorldArt();const {HalloweenScene}=await import('/src/scene.ts');document.body.innerHTML='<canvas id="proof" style="width:100vw;height:100vh;display:block"></canvas>';document.body.style.margin='0';
  window.proof=new HalloweenScene(document.querySelector('canvas'));window.settings={scene:'jungle',motion:true,paused:false,playDensity:.5};window.t=0;window.art=art;return art.worldArtStatus();
 });assert.equal(readiness.ready,59);assert.deepEqual(readiness.failed,[]);assert.ok(readiness.decodedBytes<75*1024*1024);
 await mkdir('work/raster',{recursive:true});const timings=[];
 for(const world of ['jungle','depths','space']){
  const result=await page.evaluate(async world=>{window.settings.scene=world;const samples=[];for(let n=0;n<150;n++){await new Promise(requestAnimationFrame);const start=performance.now();window.t+=1000/60;window.proof.render(window.t,window.settings);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return {world,median:samples[75],p95:samples[142]};},world);timings.push(result);await page.screenshot({path:`work/raster/${world}.png`});
 }
 // A separate synthetic people layer checks foreground order without a camera.
 await page.evaluate(()=>{const people=document.createElement('canvas');people.width=1280;people.height=720;const c=people.getContext('2d');for(const [x,color] of [[380,'#bd6a76'],[650,'#668bc5'],[900,'#b59255']]){c.fillStyle=color;c.beginPath();c.ellipse(x,440,44,53,0,0,Math.PI*2);c.fill();c.beginPath();c.roundRect(x-65,490,130,220,50);c.fill();}window.proof.render(window.t,{...window.settings,scene:'jungle'},people);});await page.screenshot({path:'work/raster/three-synthetic-people.png'});
 const cleanup=await page.evaluate(()=>{for(let i=0;i<90;i++){window.t+=16;window.proof.render(window.t,{...window.settings,scene:['jungle','depths','space'][i%3]});}window.proof.dispose();return {objects:window.proof.play.resourceCounts,art:window.art.worldArtStatus()};});assert.deepEqual(cleanup.objects,{objects:0,tracks:0,opportunities:0});assert.equal(cleanup.art.ready,59);assert.deepEqual(errors,[]);
 const report={passed:true,runtimeFiles:manifest.assets.length,runtimeBytes:manifest.assets.reduce((n,a)=>n+a.bytes,0),readiness,rendererCpuMs:timings,cleanup,realCamera:false,actualTV:false};await writeFile('work/raster/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await vite.close();}
