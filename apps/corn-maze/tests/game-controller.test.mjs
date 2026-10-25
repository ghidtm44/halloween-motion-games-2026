import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const asUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const engine=asUrl(transpile(await readFile(new URL('../src/corn-game.ts',import.meta.url),'utf8')));
const source=transpile(await readFile(new URL('../src/game-controller.ts',import.meta.url),'utf8')).replace("'./corn-game'",JSON.stringify(engine));
const {CornGameController}=await import(asUrl(source));
const base={scene:'cornmaze',gameRound:0,gamePractice:false,cameraOn:true,deviceId:'',demo:false,mirror:true,motion:true,mode:'cutout',quality:'balanced',sensitivity:1,paused:false};
function setup(){
 const listeners=new Map(),windowListeners=new Map();globalThis.window={addEventListener:(name,fn)=>windowListeners.set(name,fn)};
 const canvas={addEventListener:(name,fn)=>listeners.set(name,fn),getBoundingClientRect:()=>({left:0,top:0,width:1280,height:960})};
 const events=[];const controller=new CornGameController(canvas,e=>events.push(e));let now=1000;
 const pose=(x=.3,y=.42,id=7)=>({id,landmarks:Array.from({length:33},(_,index)=>({x,y,visibility:index===15?1:0}))});
 return {controller,events,pose,blur:()=>windowListeners.get('blur')(),move:(x,y)=>listeners.get('pointermove')({clientX:x,clientY:y}),tick:(poses,settings=base,{fresh=true,active=true,capture}={})=>{now+=50;controller.update(50,settings,poses,capture??(fresh?now:1000),now,active);return now;}};
}
test('fresh camera wrist samples grab, carry, and deposit through the real controller',()=>{
 const t=setup();for(let i=0;i<11;i++)t.tick([t.pose()]);assert.equal(t.controller.snapshot().items[0].heldBy,'7:15');
 for(let i=1;i<=8;i++)t.tick([t.pose(.3-.1*i/8,.42+.36*i/8)]);for(let i=0;i<6;i++)t.tick([t.pose(.2,.78)]);
 assert.equal(t.controller.status().collected,1);assert.equal(t.events.filter(e=>e.kind==='deposit').length,1);
});
test('frozen and expired camera frames cannot finish a partially completed grab',()=>{
 const t=setup();let capture;for(let i=0;i<6;i++)capture=t.tick([t.pose()]);
 for(let i=0;i<20;i++)t.tick([t.pose()],base,{capture});assert.equal(t.events.filter(e=>e.kind==='grab').length,0);assert.equal(t.controller.snapshot().hands.length,0);
});
test('pause, mirror changes, disconnect and reset release ownership without score',()=>{
 for(const boundary of ['pause','mirror','disconnect','reset']){const t=setup();for(let i=0;i<11;i++)t.tick([t.pose()]);assert.ok(t.controller.snapshot().items[0].heldBy);
 const settings={...base,...(boundary==='pause'?{paused:true}:boundary==='mirror'?{mirror:false}:boundary==='reset'?{gameRound:1}:{})};t.tick([t.pose()],settings,{active:boundary!=='disconnect'});assert.equal(t.controller.snapshot().items[0].heldBy,null);assert.equal(t.controller.status().collected,0);}
});
test('pointer practice maps letterboxed stage correctly and rejects bars',()=>{
 const t=setup(),settings={...base,cameraOn:false,gamePractice:true};t.tick([],settings);t.move(384,120+720*.42);for(let i=0;i<10;i++)t.tick([],settings);assert.equal(t.controller.snapshot().items[0].heldBy,'practice');
 t.move(384,30);t.tick([],settings);assert.equal(t.controller.snapshot().items[0].heldBy,null);assert.equal(t.controller.snapshot().hands.length,0);
});
test('two people can grab separate corn with opposite wrist IDs in camera mode',()=>{
 const t=setup(),left=t.pose(.3,.42,1),right=t.pose(.7,.47,2);right.landmarks[15].visibility=0;right.landmarks[16].visibility=1;
 for(let i=0;i<11;i++)t.tick([left,right]);assert.deepEqual(t.controller.snapshot().items.map(item=>item.heldBy),['1:15','2:16']);
});
test('focusing admin preserves camera-held corn but releases pointer practice',()=>{
 const camera=setup();for(let i=0;i<11;i++)camera.tick([camera.pose()]);
 assert.equal(camera.controller.snapshot().items[0].heldBy,'7:15');camera.blur();
 assert.equal(camera.controller.snapshot().items[0].heldBy,'7:15');
 for(let i=1;i<=8;i++)camera.tick([camera.pose(.3-.1*i/8,.42+.36*i/8)]);for(let i=0;i<6;i++)camera.tick([camera.pose(.2,.78)]);
 assert.equal(camera.controller.status().collected,1);assert.equal(camera.events.filter(event=>event.kind==='drop').length,0);
 const practice=setup(),settings={...base,cameraOn:false,gamePractice:true};practice.tick([],settings);practice.move(384,120+720*.42);
 for(let i=0;i<10;i++)practice.tick([],settings);assert.equal(practice.controller.snapshot().items[0].heldBy,'practice');
 practice.blur();assert.equal(practice.controller.snapshot().items[0].heldBy,null);assert.equal(practice.controller.snapshot().hands.length,0);
 for(let i=0;i<12;i++)practice.tick([],settings);assert.equal(practice.controller.snapshot().items[0].heldBy,null);assert.equal(practice.controller.status().collected,0);
});
