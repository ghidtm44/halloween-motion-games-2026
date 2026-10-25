import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/host-attention.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {HostAttention}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const pose=(x=.5,visibility=1,width=.16)=>({id:1,landmarks:Array.from({length:33},(_,i)=>({x:x+(i===11?-width/2:i===12?width/2:0),y:i===0?.25:.45,visibility}))});
function tick(attention,poses,from,to,step=100){let arrivals=0,result;for(let t=from;t<=to;t+=step){result=attention.update(poses,t);arrivals+=Number(result.arrival);}return {arrivals,result};}

test('stable group arrives once; brief tracking jitter does not repeat greetings',()=>{
 const a=new HostAttention();assert.equal(tick(a,[pose()],0,900).arrivals,0);
 assert.equal(a.update([pose()],1000).arrival,true);assert.equal(tick(a,[pose()],1100,3000).arrivals,0);
 a.update([],3100);a.update([],3200);assert.equal(tick(a,[pose()],3300,16000).arrivals,0);
});
test('three people share one greeting and group gaze stays between them',()=>{
 const a=new HostAttention(),group=[pose(.2,1,.12),pose(.5,1,.2),pose(.8,1,.14)];
 const {arrivals,result}=tick(a,group,0,2500);assert.equal(arrivals,1);assert.equal(result.people,3);
 assert.ok(result.gaze.x>.4&&result.gaze.x<.6);assert.ok(result.gaze.y<.45);
});
test('absence rearms only after 3.5 seconds and greeting cooldown still applies',()=>{
 const a=new HostAttention();tick(a,[pose()],0,1500);tick(a,[],1600,5200);
 assert.equal(tick(a,[pose()],5300,12900).arrivals,0);assert.equal(a.update([pose()],13000).arrival,true);
});
test('confidence gating ignores missing, uncertain and non-finite landmarks',()=>{
 const a=new HostAttention(),bad=pose();bad.landmarks[11].x=NaN;
 assert.deepEqual(a.update([pose(.2,.4),bad,{id:2,landmarks:[]}],0),{gaze:{x:.5,y:.45},people:0,arrival:false});
 assert.equal(tick(a,[pose(.2,.4)],100,2000).arrivals,0);
 assert.equal(a.update([],NaN).people,0);
});
test('gaze smooths instead of snapping and returns to idle after tracking disappears',()=>{
 const a=new HostAttention();const first=a.update([pose(.85)],0);assert.ok(first.gaze.x>.5&&first.gaze.x<.55);
 const later=tick(a,[pose(.85)],100,2000).result;assert.ok(later.gaze.x>.8);
 const idle=tick(a,[],2100,7000).result;assert.ok(Math.abs(idle.gaze.x-.5)<.005);assert.ok(Math.abs(idle.gaze.y-.45)<.005);
});
test('reset starts clean and suspended clocks cannot establish stable presence',()=>{
 const a=new HostAttention();a.update([pose()],0);assert.equal(a.update([pose()],5000).arrival,false);
 assert.equal(tick(a,[pose()],5100,6100).arrivals,1);a.reset();
 assert.deepEqual(a.update([],0),{gaze:{x:.5,y:.45},people:0,arrival:false});
});

test('gaze deliberately visits left, center and right guests without identifying them',()=>{
 const a=new HostAttention(),group=[pose(.2),pose(.5),pose(.8)],positions=[];
 for(let t=0;t<=5400;t+=100){const s=a.update(group,t);if([1700,3500,5300].includes(t))positions.push(s.gaze.x);}
 assert.ok(positions[0]<.25);assert.ok(positions[1]>.45&&positions[1]<.55);assert.ok(positions[2]>.75);
});
const {HostSceneChanges}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const pixels=(base=80,region=base)=>Uint8ClampedArray.from({length:24*18*4},(_,i)=>i%4===3?255:i<24*18?region:base);
test('local scene change detects a sustained costume-region change, not jitter or global lighting',()=>{
 const d=new HostSceneChanges();assert.equal(d.sample(pixels(),0),false);
 assert.equal(d.sample(pixels(120),500),false,'global exposure shift');
 assert.equal(d.sample(pixels(81,90),1000),false,'small jitter');
 assert.equal(d.sample(pixels(80,180),1500),false,'one transient frame');
 assert.equal(d.sample(pixels(),2000),false);
 assert.equal(d.sample(pixels(80,180),2500),false);
 assert.equal(d.sample(pixels(80,180),3000),true);
 assert.equal(d.sample(pixels(80,180),4000),false,'same view does not repeat');
 assert.equal(d.sample(pixels(),4500),false);assert.equal(d.sample(pixels(),5000),false,'local change cooldown');
 assert.equal(d.sample(pixels(),7000),true);
 d.reset();assert.equal(d.sample(pixels(20,200),8000),false,'reset retains no scene');
});
