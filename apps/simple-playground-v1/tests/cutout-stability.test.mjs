import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../src/cutout-stability.ts',import.meta.url),'utf8');
const {CutoutStability}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const pose=(x=.5)=>({id:1,landmarks:Array.from({length:33},()=>({x,y:.5,visibility:1}))});
const mask=(alpha=255)=>({width:8,height:8,data:Uint8ClampedArray.from({length:256},(_,i)=>i%4===3?alpha:255)});
const image=()=>({closed:0,close(){this.closed++;}});
const frame=(at,options={})=>({timestamp:at,image:image(),mask:mask(),poses:[pose()],inferenceMs:10,...options});
function ready(){const c=new CutoutStability();c.accept(frame(100),100);c.view(100);c.accept(frame(200),200);c.view(200);c.accept(frame(280),280);assert.equal(c.view(280).blend,1);return c;}
test('short missing mask keeps its exact paired image, then recovers without a visible toggle',()=>{
 const c=ready(),pair=c.view(280).pair,bad=frame(330,{mask:null});c.accept(bad,330);const v=c.view(350);assert.equal(v.blend,1);assert.equal(v.holding,true);assert.equal(v.pair,pair);assert.equal(bad.image.closed,1);
 c.accept(frame(390),390);assert.equal(c.view(390).blend,1);assert.equal(pair.image.closed,1);c.accept(frame(480),480);assert.equal(c.view(480).blend,1);c.clear();assert.equal(c.retained,0);
});
test('lost people, movement, stale frames and absolute mask age cannot leave persistent ghosts',()=>{
 for(const [patch,deadline] of [[{poses:[]},470],[{poses:[pose(.8)]},350],[{timestamp:-10},631]]){
  const c=ready();c.accept(frame(330,{mask:null,...patch}),330);c.view(350);assert.equal(c.view(deadline).pair,null);
 }
 const c=ready();assert.equal(c.view(631).pair,null);
});
test('owned bitmaps close once; out-of-order results never replace a newer paired image',()=>{
 const c=ready(),old=frame(250);c.accept(old,300);assert.equal(old.image.closed,1);assert.equal(c.view(300).pair.at,280);const pair=c.view(300).pair;c.clear();c.clear();assert.equal(pair.image.closed,1);
});
test('only uncertain edge alpha is smoothed; definite empty pixels remain empty',()=>{
 const c=new CutoutStability();c.accept(frame(100,{mask:mask(150)}),100);const next=mask(200);next.data[3]=0;next.data[7]=255;c.accept(frame(180,{mask:next}),180);const result=c.view(180).pair.mask;assert.equal(result.data[3],0);assert.equal(result.data[7],255);assert.equal(result.data[11],190);c.clear();
});
test('recovery requires consecutive useful masks, and a mask missing a tracked body is not trusted',()=>{
 const c=ready(),bad=mask();bad.data.fill(0);bad.data[3]=255;c.accept(frame(320,{mask:bad}),320);assert.equal(c.view(330).holding,true);c.view(632);c.accept(frame(640),640);assert.equal(c.view(640).blend,0);c.accept(frame(740),740);assert.ok(c.view(740).blend>0);c.clear();
});
test('GPU dropout debounce preserves poses and copied mask ownership; legacy host fallback remains immediate',async()=>{
 const code=await readFile(new URL('../public/vision-worker.js',import.meta.url),'utf8');
 async function run(stableMasks){const messages=[],closed=[],borrowed=new Float32Array(4).fill(.9);let good=false;
  const context={self:{postMessage:m=>messages.push(m)},OffscreenCanvas:class{},ImageData:class{constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}},performance:{now:()=>10},Float32Array,Error};
  context.importScripts=()=>Object.assign(context.self.exports,{FilesetResolver:{forVisionTasks:async()=>({})},PoseLandmarker:{createFromOptions:async()=>({detectForVideo(_i,_t,cb){cb({landmarks:[[{}]],segmentationMasks:good?[{width:2,height:2,getAsFloat32Array:()=>borrowed}]:[]});borrowed.fill(0);}})}});
  vm.runInNewContext(code,context);context.self.onmessage({data:{type:'init',base:'http://127.0.0.1',stableMasks}});await new Promise(r=>setImmediate(r));
  const send=()=>context.self.onmessage({data:{type:'frame',image:{close(){closed.push(1);}},timestamp:100}});
  send();send();send();assert.equal(messages.filter(m=>m.type==='error').length,stableMasks?1:3);assert.equal(messages.filter(m=>m.type==='frame').length,stableMasks?2:0);
  good=true;borrowed.fill(.9);send();const copied=messages.at(-1).mask;assert.equal(copied.data[3],255);assert.equal(borrowed[0],0);send();assert.equal(messages.at(-1).type,stableMasks?'frame':'error');
 }
 await run(true);await run(false);
});
