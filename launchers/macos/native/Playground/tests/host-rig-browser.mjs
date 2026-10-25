// Actual renderer/PCM analysis, with generated art and synthetic speech only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import ts from 'typescript';
import {createPlaygroundServer} from '../server.mjs';
const mod=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');
const scene=mod(await readFile('src/host-scene.ts','utf8'));
const dir=await mkdtemp(join(tmpdir(),'host-rig-')),app=await createPlaygroundServer({port:0,stateFile:join(dir,'state.json'),hostOptions:{apiKey:''}}),base=`http://127.0.0.1:${app.port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],external=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{if(!r.request().url().startsWith(base)){external.push(r.request().url());return r.abort();}return r.continue();});
 await page.route(base+'/__rig__',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto(base+'/__rig__');await page.setContent('<style>body{margin:0;background:#070b17}canvas{width:100vw;height:100vh;display:block}</style><canvas id="stage"></canvas>');
 await page.evaluate(async url=>{const {HostScene}=await import(url);window.rig=new HostScene(document.querySelector('canvas'));window.state={gaze:{x:.5,y:.45},people:2,speaking:false,caption:'PRIVATE CAPTION MUST NOT RENDER',captions:true,label:'NO TEXT',paused:false};window.textCalls=0;const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(...a){window.textCalls++;return original.apply(this,a)};window.rig.render(1000,window.state);},scene);
 await page.waitForFunction(()=>[...window.rig.images.values()].every(im=>im.complete&&im.naturalWidth));await mkdir('work/host-rig',{recursive:true});
 const frames=[];
 for(const [name,patch,time]of [['idle',{},2000],['listening',{gaze:{x:.9,y:.3}},3000],['thinking',{thinking:true},4000],['speaking',{thinking:false,speaking:true,voiceLevel:.85},5000],['quiet',{speaking:false,voiceLevel:0},6000]]){
  const value=await page.evaluate(({patch,time})=>{Object.assign(window.state,patch);for(let n=0;n<24;n++)window.rig.render(time+n*16,window.state);return {jaw:window.rig.jaw,gaze:window.rig.gaze,textCalls:window.textCalls};},{patch,time});
  frames.push({name,...value});await page.screenshot({path:`work/host-rig/${name}.png`});
 }
 assert.ok(frames[3].jaw>.8);assert.ok(frames[4].jaw<.01);assert.ok(frames[1].gaze.x>10);assert.equal(frames[4].textCalls,0);
 await page.evaluate(()=>window.rig.dispose());assert.equal(await page.evaluate(()=>window.rig.images.size),0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const report={passed:true,frames,assets:8,external,errors,limits:'Actual Canvas rig with synthetic amplitude/attention; screenshots reviewed separately. No camera or live speech.'};await writeFile('work/host-rig.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
