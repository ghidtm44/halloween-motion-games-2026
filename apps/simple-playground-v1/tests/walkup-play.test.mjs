import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const load=async name=>ts.transpileModule(await readFile(new URL('../src/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const playURL=url(await load('walkup-play')),{WalkupPlay,HAND_RADIUS,COLLECTIBLE_RADIUS,trackedPoint}=await import(playURL);
const {cameraFit,mapPoseToStage}=await import(url(await load('coordinates')));
function pose(id=1,x=640,head=250,hand={x:x-100,y:500},visibility=1){const landmarks=Array.from({length:33},()=>({x:x/1280,y:400/720,visibility}));landmarks[0]={x:x/1280,y:head/720,visibility};for(const [i,px,py] of [[11,x-50,head+90],[12,x+50,head+90],[23,x-45,head+290],[24,x+45,head+290],[15,hand.x,hand.y],[16,x+100,500]])landmarks[i]={x:px/1280,y:py/720,visibility};return {id,landmarks};}
function fixture(){let now=1000;const game=new WalkupPlay(()=>.5);game.advance(now);return {game,get now(){return now;},step(ms=50,poses=[]){now+=ms;game.advance(now);return game.observe(poses,now);}};}
const partial=(p,indices)=>{for(const i of indices)p.landmarks[i]={x:1.2,y:1.2,visibility:.1};return p;};
test('one readable challenge at a time, 19–21 beats per minute, breathing room and bounded empty flow',()=>{
 const f=fixture();const seen=new Set(),minute=new Set(),kinds=new Set();let empty=0;
 for(let i=0;i<24000;i++){assert.deepEqual(f.step(),[]);assert.ok(f.game.objects.length<=1);if(!f.game.objects.length)empty++;for(const o of f.game.objects){seen.add(o.id);kinds.add(o.kind);if(i<1200)minute.add(o.id);}}
 assert.deepEqual([...kinds].sort(),['bubble','candy','dodge','duck','jump','star']);assert.ok(minute.size>=19&&minute.size<=21);assert.ok(empty>24000*.06);assert.equal(f.game.resourceCounts.tracks,0);assert.equal(f.game.resourceCounts.opportunities,0);
});
test('visible wrists collect despite absent head, shoulder or hip landmarks',()=>{
 for(const missing of [[0],[11],[12],[23],[24],[0,11,12,23,24]]){
  const f=fixture(),o=f.game.objects[0];const hand=x=>partial(pose(1,640,250,{x,y:o.y}),missing);
  assert.deepEqual(f.step(50,[hand(o.x-110)]),[]);
  assert.equal(f.step(100,[hand(o.x)]).filter(r=>r.objectId===o.id).length,1,`Missing ${missing}`);
 }
});
test('either hand and the exact visible ring edge collect; just outside stays uncollected',()=>{
 for(const wrist of [15,16])for(const inside of [true,false]){
  const f=fixture(),o=f.game.objects[0];let p=pose();p.landmarks[15].visibility=p.landmarks[16].visibility=.1;
  const set=delta=>{p.landmarks[wrist]={x:(o.x+delta)/1280,y:o.y/720,visibility:1};return p;};
  f.step(50,[set(o.radius+HAND_RADIUS+35)]);
  assert.equal(f.step(50,[set(o.radius+HAND_RADIUS+(inside?-2:8))]).filter(r=>r.kind==='catch').length,inside?1:0);
  assert.equal(o.radius,COLLECTIBLE_RADIUS);assert.ok(trackedPoint(p.landmarks[wrist]));
 }
});
test('two fresh overlapping samples confirm contact once, including a shared collectible',()=>{
 const f=fixture(),o=f.game.objects[0],visitors=()=>[pose(1,570,250,{x:o.x,y:o.y}),pose(2,710,250,{x:o.x,y:o.y}),pose(3,900)];
 assert.deepEqual(f.step(50,visitors()),[]);assert.equal(f.step(50,visitors()).filter(r=>r.objectId===o.id).length,1);
 assert.deepEqual(f.game.observe(visitors(),f.now),[]);assert.ok(f.step(50,visitors()).every(r=>r.objectId!==o.id));
});
test('stale, absent, uncertain and teleporting wrists cannot generate phantom catches',()=>{
 for(const reason of ['stale','absent','uncertain','teleport','cleanup']){
  const f=fixture(),o=f.game.objects[0];f.step(50,[pose(1,640,250,{x:o.x-250,y:o.y})]);
  if(reason==='cleanup')f.game.clearTracking();
  const p=pose(1,640,250,{x:o.x,y:o.y});if(reason==='uncertain')p.landmarks[15].visibility=.1;
  assert.deepEqual(f.step(reason==='stale'?500:50,reason==='absent'?[]:[p]),[],reason);
 }
});
function obstacleTrial(kind,behavior){
 const f=fixture();let rewards=[],offset=0;
 for(let i=0;i<1220;i++){
  const o=f.game.objects.find(o=>o.kind===kind),ahead=o?(500-o.x)*Math.sign(o.vx):Infinity;
  const near=kind==='dodge'?o&&o.y>145:o&&ahead<280;
  let head=250,x=500;
  if(near&&behavior==='success'){if(kind==='duck')head+=50;if(kind==='jump')head-=30;if(kind==='dodge'){offset=Math.min(180,offset+70);x+=offset;}}
  if(behavior==='already-clear'&&kind==='duck')head=330;
  const p=pose(1,x,head);if(behavior==='hips-missing')partial(p,[23,24]);
  if(near&&behavior==='hips-missing'&&kind==='duck'){p.landmarks[0].y+=50/720;for(const i of [11,12])p.landmarks[i].y+=50/720;}
  if(near&&behavior==='head-only'&&kind==='jump')p.landmarks[0].y-=40/720;
  const next=f.step(50,near&&behavior==='occluded'?[]:[p]);rewards.push(...next.filter(r=>r.kind===kind));
 }
 return rewards;
}
for(const kind of ['duck','dodge','jump'])test(`${kind}: visible gesture rewards once per event; collision, occlusion and stationary stance do not`,()=>{
 const yes=obstacleTrial(kind,'success');assert.ok(yes.length>=1);assert.equal(new Set(yes.map(r=>r.objectId)).size,yes.length);
 for(const behavior of ['stationary','occluded','already-clear'])assert.equal(obstacleTrial(kind,behavior).length,0,behavior);
});
test('duck works with cropped hips; rise/hop needs matching hip and upper-body motion',()=>{
 assert.ok(obstacleTrial('duck','hips-missing').length>0);assert.equal(obstacleTrial('jump','hips-missing').length,0);assert.equal(obstacleTrial('jump','head-only').length,0);
});
test('loss, stale gaps and cleanup clear interaction history without stopping scenery',()=>{
 const f=fixture();f.step(50,[pose(),pose(2,300),pose(3,900)]);assert.equal(f.game.resourceCounts.tracks,3);const id=f.game.objects[0].id;
 f.step(50,[pose(1,640,250,undefined,.2)]);assert.equal(f.game.resourceCounts.tracks,0);f.step(50,[pose()]);f.game.clearTracking();assert.equal(f.game.resourceCounts.tracks,0);assert.ok(f.game.objects.some(o=>o.id===id));f.game.reset();assert.deepEqual(f.game.resourceCounts,{objects:0,tracks:0,opportunities:0});
});
test('mirrored and letterboxed wrists match the displayed camera rectangle for wide, 4:3 and portrait input',()=>{
 const p=pose();p.landmarks[15]={x:.1,y:.2,visibility:1};
 for(const [w,h]of [[1280,720],[640,480],[720,1280]]){const fit=cameraFit(w,h);const a=mapPoseToStage(p,w,h,false).landmarks[15],b=mapPoseToStage(p,w,h,true).landmarks[15];assert.ok(Math.abs(a.x*1280-(fit.x+.1*fit.w))<1e-9);assert.ok(Math.abs(a.y*720-(fit.y+.2*fit.h))<1e-9);assert.ok(Math.abs(a.x+b.x-1)<1e-9);assert.equal(a.y,b.y);}
});
test('all actual renderer gestures survive switching to each world with three people and no text',async()=>{
 const gradient={addColorStop(){}};let textCalls=0;const context=new Proxy({fillText(){textCalls++;},strokeText(){textCalls++;},createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get(t,k){return t[k]??(()=>{});}});
 const canvas=()=>({width:1280,height:720,getContext:()=>context,getBoundingClientRect:()=>({width:960,height:720})});
 const previousDocument=globalThis.document,previousWindow=globalThis.window;globalThis.document={createElement:canvas};globalThis.window={devicePixelRatio:2};
 try{
  const artURL=url(await load('world-art')),hostURL=url('export class HostScene {render(){}}');let source=await load('scene');for(const [name,entry]of [['walkup-play',playURL],['world-art',artURL],['host-scene',hostURL]])source=source.replace(`'./${name}'`,JSON.stringify(entry));
  const {HalloweenScene}=await import(url(source));
  for(const destination of ['jungle','depths','space'])for(const kind of ['catch','duck','dodge','jump']){
   const scene=new HalloweenScene(canvas());scene.play=new WalkupPlay(()=>.5);const rewards=[],observe=scene.play.observe.bind(scene.play);scene.play.observe=(...args)=>{const next=observe(...args);rewards.push(...next);return next;};let world=destination==='jungle'?'space':'jungle',switched=false;const offsets=[0,0,0];
   for(let t=0;t<=55000;t+=50){
    const settings={scene:world,motion:true,paused:false};scene.render(t,settings);const o=scene.play.objects.find(o=>kind==='catch'?!['duck','dodge','jump'].includes(o.kind):o.kind===kind);
    if(o&&!switched&&scene.play.resourceCounts.tracks===3){const before=structuredClone(scene.play.objects),history=scene.play.resourceCounts;world=destination;scene.render(t,{...settings,scene:world});assert.deepEqual(scene.play.objects,before);assert.deepEqual(scene.play.resourceCounts,history);switched=true;}
    const visitors=[300,640,1000].map((x,i)=>{let head=250,hand={x:x-100,y:500};const ahead=o?(x-o.x)*Math.sign(o.vx):Infinity;
     if(switched&&o){if(kind==='catch')hand={x:o.x,y:o.y};if(kind==='duck'&&ahead<280)head+=50;if(kind==='jump'&&ahead<280)head-=30;if(kind==='dodge'&&o.y>145){offsets[i]=Math.min(180,offsets[i]+70);x+=i===2?-offsets[i]:offsets[i];}}
     return pose(i+1,x,head,hand);
    });
    scene.observe(visitors,1000+t);if(rewards.some(r=>r.kind===kind))break;
   }
   assert.ok(switched,kind);assert.ok(rewards.some(r=>r.kind===kind),`${kind} in ${destination}`);assert.equal(scene.play.resourceCounts.tracks,3);assert.ok(scene.particles.length>0,'Gesture produces real renderer celebration');scene.observe([],60000);assert.equal(scene.play.resourceCounts.tracks,0);scene.dispose();assert.equal(scene.play.resourceCounts.objects,0);
  }
  assert.equal(textCalls,0);
 }finally{globalThis.document=previousDocument;globalThis.window=previousWindow;}
});

test('density changes only future challenges and keeps one readable action at all rates',()=>{
 const counts=[];
 for(const density of [0,.5,1]){const game=new WalkupPlay(()=>.5);game.setDensity(density);const seen=new Set();for(let t=0;t<60000;t+=50){game.advance(t);assert.ok(game.objects.length<=1);for(const o of game.objects)seen.add(o.id);}counts.push(seen.size);}
 assert.deepEqual(counts,[12,20,24]);
 const game=new WalkupPlay(()=>.5);game.advance(0);const before={...game.objects[0]};game.setDensity(1);game.advance(50);assert.equal(game.objects[0].duration,before.duration);assert.equal(game.objects[0].vy,before.vy);
});

// Count entry into a genuinely reachable region, not just scheduler starts.
test('default useful grabs arrive every 2–3 seconds in runs, with isolated body passages',()=>{
 const f=fixture(),seen=new Set(),entries=[],bodyEvents=[];
 for(let i=0;i<1200;i++){f.step();for(const o of f.game.objects){if(seen.has(o.id))continue;if(['duck','jump','dodge'].includes(o.kind)){bodyEvents.push(o.id);seen.add(o.id);}else if(o.y>=250&&o.y<=500&&o.x>=250&&o.x<=1030){entries.push({id:o.id,at:f.now});seen.add(o.id);}}}
 assert.ok(entries.length>=15&&entries.length<=17);assert.ok(bodyEvents.length>=4);
 const runGaps=entries.slice(1).flatMap((e,i)=>e.id===entries[i].id+1?[e.at-entries[i].at]:[]);
 assert.ok(runGaps.length>=8);assert.ok(runGaps.every(ms=>ms>=2000&&ms<=3000),JSON.stringify(runGaps));
 const allGaps=entries.slice(1).map((e,i)=>e.at-entries[i].at);assert.ok(Math.max(...allGaps)<7300);
});
