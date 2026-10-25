/** Runs the production player with instrumented canvas/sync/model boundaries. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const asUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const load=async file=>ts.transpileModule(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;

async function mount(t,{provider='mock',active=false,visionMode='ready',controlMode='auto'}={}) {
 const descriptors=new Map();
 const install=(name,value)=>{descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
 const events=new Map(),draws=[],encoded=[],renders=[],sent=[],statuses=[],tracks=[],played=[],inferences=[];
 let raf,now=1000,serial=0;
 const classList={add(){},remove(){},toggle(){}};
 class Element {hidden=false;classList=classList;addEventListener(){}before(){}setAttribute(){}querySelector(){return new Element();}}
 class Canvas extends Element {
  width=1280;height=720;
  constructor(name){super();this.name=name;}
  getBoundingClientRect(){return {left:0,top:0,width:1280,height:720};}
  getContext(){return {getImageData(){return {data:new Uint8ClampedArray(24*18*4)};},clearRect(){},drawImage:(source)=>draws.push({target:this.name,source}),save(){},restore(){},translate(){},scale(){},putImageData(){},fillRect(){},createLinearGradient(){return {addColorStop(){}};}};}
  toDataURL(){encoded.push(this.name);return 'data:image/jpeg;base64,AA==';}
 }
 class Video extends Element {
  videoWidth=1280;videoHeight=720;readyState=2;currentTime=0;srcObject=null;
  async play(){}
 }
 const video=new Video(),stage=new Canvas('stage'),elements=new Map([['stage',stage],['camera-video',video]]);
 const getElement=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 install('HTMLVideoElement',Video);install('HTMLCanvasElement',Canvas);
 install('document',{body:{classList,append(){}},querySelector:()=>new Element(),getElementById:getElement,createElement:name=>name==='canvas'?new Canvas(['observation','layer','source','mask','thumbnail'][serial++]||`canvas-${serial}`):new Element(),addEventListener(){},fullscreenElement:null});
 install('window',{addEventListener:(name,callback)=>events.set(name,callback),setTimeout,clearTimeout});
 install('location',{origin:'http://127.0.0.1:49998'});
 install('performance',{now:()=>now});
 install('navigator',{mediaDevices:{addEventListener(){},enumerateDevices:async()=>[],getUserMedia:async options=>{
  assert.equal(options.audio,false);const track={readyState:'live',label:'Synthetic camera',callbacks:new Map(),stop(){this.readyState='ended';},addEventListener(name,callback){this.callbacks.set(name,callback);}};tracks.push(track);return {getTracks:()=>[track],getVideoTracks:()=>[track]};
 }}});
 install('requestAnimationFrame',callback=>{raf=callback;return 1;});
 // Fallback is deliberately exercised through the production catch path.
 const originalWarn=console.warn;console.warn=()=>{};
 t.after(()=>{events.get('beforeunload')?.();console.warn=originalWarn;for(const [name,value]of descriptors){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const harness={visionMode,settings:null,host:null,sent,statuses,renders,stage,video,draws,played,inferences};
 install('__hostBoundaryHarness',harness);
 const types=asUrl(await load('types.ts'));
 const hostAttention=asUrl(await load('host-attention.ts')),hostPlayer=asUrl(await load('host-player.ts')),motion=asUrl(await load('motion.ts'));
 const scene=asUrl(`export class HalloweenScene {observe(){}clearTracking(){}dispose(){}constructor(c){this.canvas=c;}render(t,s,l,p){globalThis.__hostBoundaryHarness.renders.push({kind:'freeplay',layer:l});}trigger(){}}`);
 const hostScene=asUrl(`export class HostScene {clearFlourish(){}farewell(){}constructor(c){this.canvas=c;}render(t,s){globalThis.__hostBoundaryHarness.renders.push({kind:'host',state:s});}}`);
 const hostAudio=asUrl(`export class HostAudio {setEffects(){}dispose(){}setVolume(){}stop(){}async enable(){return false;}async play(result){globalThis.__hostBoundaryHarness.played.push(result);return false;}}`);
 const vision=asUrl(`export class VisionEngine {
  constructor(frame,status){this.frame=frame;this.status=status;globalThis.__hostBoundaryHarness.vision=this;}
  async start(){const mode=globalThis.__hostBoundaryHarness.visionMode;this.status(mode==='ready'?'Local GPU tracking ready':'Loading local model…');if(mode==='fallback')throw new Error('Synthetic model unavailable');}
  submit(v,time){if(globalThis.__hostBoundaryHarness.visionMode!=='ready')return false;globalThis.__hostBoundaryHarness.inferences.push(time);this.frame({timestamp:time,inferenceMs:1,mask:null,image:{width:1280,height:720,close(){}},poses:[{id:1,landmarks:Array.from({length:33},(_,i)=>({x:i===11?.3:i===12?.5:.4,y:i===0?.2:.4,visibility:1}))}]});return true;}
  stop(){}
 }`);
 const sync=asUrl(`export class SyncClient {
  connected=true;active=true;state={};constructor(){globalThis.__hostBoundaryHarness.sync=this;}
  connect(){const h=globalThis.__hostBoundaryHarness;this.state={settings:h.settings,host:h.host,playerConnected:true};this.onState(this.state);}
  send(m){globalThis.__hostBoundaryHarness.sent.push(m);return true;}patch(patch){return this.send({type:'patch',patch});}status(s){globalThis.__hostBoundaryHarness.statuses.push(s);}close(){}
 }`);
 const {DEFAULT_SETTINGS}=await import(types);
 harness.settings={...DEFAULT_SETTINGS,scene:'spooky',cameraOn:true,demo:false,mirror:false,mode:'camera',hostControlMode:controlMode};
 harness.host={active,provider,controlMode,configured:provider==='openai',phase:active?'ready':'off',message:'',sessionId:active?'synthetic-session':'',requestCount:0,limit:20};
 let player=await load('player.ts');
 for(const [name,url]of Object.entries({types,scene,vision,sync,motion,coordinates:asUrl(await load('coordinates.ts')),'host-scene':hostScene,'host-attention':hostAttention,'host-player':hostPlayer,'host-audio':hostAudio,'cutout-stability':asUrl(await load('cutout-stability.ts')),'world-music':asUrl(await load('world-music.ts')),'host-frames':asUrl(await load('host-frames.ts')),'host-challenge':asUrl(await load('host-challenge.ts'))}))player=player.replace(`'./${name}'`,JSON.stringify(url));
 const {mountPlayer}=await import(asUrl(player));mountPlayer();
 const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush();
 const tick=async(step=100,fresh=true)=>{now+=step;if(fresh)video.currentTime+=1/30;raf(now);await flush();};
 const settings=async patch=>{harness.settings={...harness.settings,...patch};harness.sync.state={...harness.sync.state,settings:harness.settings};harness.sync.onState(harness.sync.state);await flush();};
 return {...harness,encoded,tracks,tick,settings,getElement};
}

for(const visionMode of ['loading','ready','fallback'])test(`Spooky player excludes camera composition and preview pixels while vision is ${visionMode}`,async t=>{
 const h=await mount(t,{visionMode});
 for(const mode of ['camera','cutout','silhouette']){
  await h.settings({mode});
  for(let i=0;i<15;i++)await h.tick();
  assert.ok(h.renders.length>0);
  assert.ok(h.renders.every(render=>render.kind==='host'),'Only the host renderer receives the stage while spooky is selected');
  assert.ok(h.draws.every(draw=>draw.target==='thumbnail'&&draw.source===h.stage),'Only the finished crystal-ball stage is copied to the admin preview');
  assert.ok(h.encoded.every(name=>name==='thumbnail'),'Camera observations are not encoded while the AI session is inactive');
  assert.equal(h.sent.filter(message=>message.type==='host-observe').length,0);
 }
 assert.ok(h.statuses.some(status=>status.preview),'The stage preview is still functional');
 assert.equal(h.getElement('camera-video').srcObject!==null,true,'This boundary is tested with an actual synthetic camera stream attached');
 // Show that the instrumented canvas detects camera composition in the preserved mode.
 await h.settings({scene:'jungle',mode:'camera'});await h.tick();
 assert.ok(h.draws.some(draw=>draw.source===h.video),'Free-play still composites the camera, proving the host assertions observe a real boundary');
});

test('active scripted host can greet without capturing or sending camera observations',async t=>{
 const h=await mount(t,{active:true,provider:'mock'});
 for(let i=0;i<22;i++)await h.tick();
 const requests=h.sent.filter(message=>message.type==='host-observe');
 assert.equal(requests.length,1,'Stable local presence reaches the production arrival-to-greeting flow once');
 assert.equal(requests[0].people,1);assert.equal(requests[0].reason,'arrival');
 assert.equal(Object.hasOwn(requests[0],'image'),false,'Mock greetings never attach an image');
 assert.ok(h.draws.every(draw=>draw.target==='thumbnail'&&draw.source===h.stage));
 assert.ok(h.encoded.every(name=>name==='thumbnail'));
});

test('selecting live provider with inactive session cannot capture or upload images',async t=>{
 const h=await mount(t,{active:false,provider:'openai'});
 for(let i=0;i<22;i++)await h.tick();
 h.sync.onHost({type:'host-cue',sessionId:'synthetic-session',cueId:'synthetic-click'});await h.tick();
 assert.equal(h.sent.filter(message=>message.type==='host-observe').length,0);
 assert.ok(h.draws.every(draw=>draw.source!==h.video));
 assert.ok(h.encoded.every(name=>name==='thumbnail'));
});

test('explicit active AI session may sample a bounded observation but never puts it on stage',async t=>{
 const h=await mount(t,{active:true,provider:'openai'});
 for(let i=0;i<22;i++)await h.tick();
 const requests=h.sent.filter(message=>message.type==='host-observe');
 assert.equal(requests.length,1);assert.match(requests[0].frames.at(-1).image,/^data:image\/jpeg;base64,/);
 assert.ok(h.encoded.filter(name=>name==='observation').length>=1);
 assert.ok(h.draws.filter(draw=>draw.source===h.video&&draw.target==='observation').length>=1);assert.ok(requests[0].frames.length<=3);
 assert.ok(h.draws.filter(draw=>draw.source===h.video).every(draw=>draw.target==='observation'||draw.target.startsWith('canvas-')),'Tiny local change samples and one observation stay off stage');
 assert.ok(h.renders.every(render=>render.kind==='host'));
 assert.ok(h.draws.filter(draw=>draw.target==='thumbnail').every(draw=>draw.source===h.stage));
});

test('switching a paused camera scene to Spooky never reuses the composed camera layer',async t=>{
 const h=await mount(t);
 await h.settings({scene:'jungle',mode:'camera'});await h.tick();
 assert.ok(h.draws.some(draw=>draw.source===h.video));
 h.draws.length=0;h.renders.length=0;
 await h.settings({scene:'spooky',paused:true});
 for(let i=0;i<16;i++)await h.tick();
 assert.ok(h.renders.length>0&&h.renders.every(render=>render.kind==='host'&&render.state.paused));
 assert.ok(h.draws.every(draw=>draw.target==='thumbnail'&&draw.source===h.stage));
 assert.equal(h.sent.filter(message=>message.type==='host-observe').length,0);
});

test('physical camera disconnect stops the host and rejects late speech and observations',async t=>{
 const h=await mount(t,{active:true,provider:'openai'});
 for(let i=0;i<22;i++)await h.tick();
 const pending=h.sent.find(message=>message.type==='host-observe');
 assert.ok(pending?.frames?.length,'The test starts with an actual pending AI observation');
 const priorObservations=h.encoded.filter(name=>name==='observation').length;
 const ended=h.tracks[0].callbacks.get('ended');
 assert.equal(typeof ended,'function');ended();
 assert.ok(h.sent.some(message=>message.type==='host-stop'),'Physical disconnect explicitly stops the server session');
 assert.ok(h.sent.some(message=>message.type==='patch'&&message.patch.cameraOn===false),'Physical disconnect updates the authoritative camera state');
 assert.equal(h.video.srcObject,null);assert.ok(h.tracks.every(track=>track.readyState==='ended'));
 // A response arriving before the server acknowledges stop must already be rejected locally.
 h.sync.onHost({type:'host-result',sessionId:pending.sessionId,requestId:pending.requestId,text:'This cancelled line must never be spoken.',audio:{base64:'AA==',mime:'audio/mpeg'}});
 await h.tick();
 assert.equal(h.played.length,0,'The stale provider result never reaches audio playback');
 assert.equal(h.renders.at(-1).state.caption,'');assert.equal(h.renders.at(-1).state.speaking,false);
 assert.equal(h.encoded.filter(name=>name==='observation').length,priorObservations);
 // Apply the ordinary server acknowledgement, then prove later cues cannot restart uploads.
 h.sync.state={...h.sync.state,host:{...h.host,active:false,sessionId:'',phase:'off'}};
 await h.settings({cameraOn:false});
 h.sync.onHost({type:'host-cue',sessionId:'synthetic-session',cueId:'synthetic-click'});
 for(let i=0;i<90;i++)await h.tick();
 assert.equal(h.sent.filter(message=>message.type==='host-observe').length,1);
 assert.equal(h.encoded.filter(name=>name==='observation').length,priorObservations);
 assert.equal(h.played.length,0);
});

test('a single frozen pose cannot establish host arrival; fresh camera frames can',async t=>{
 const h=await mount(t,{active:true,provider:'mock'});
 await h.tick();
 assert.equal(h.inferences.length,1,'One camera frame produced a confident synthetic pose');
 for(let i=0;i<22;i++)await h.tick(100,false);
 assert.equal(h.inferences.length,1,'Retained video pixels never generate a second inference');
 assert.equal(h.sent.filter(message=>message.type==='host-observe').length,0,'A stale pose expires before the one-second arrival dwell');
 assert.equal(h.renders.at(-1).state.people,0,'The host drops stale attention');
 for(let i=0;i<18;i++)await h.tick();
 assert.ok(h.inferences.length>10,'Fresh camera frames resume local inference');
 const observations=h.sent.filter(message=>message.type==='host-observe');
 assert.equal(observations.length,1);assert.equal(observations[0].reason,'arrival');assert.equal(observations[0].people,1);
 assert.equal(Object.hasOwn(observations[0],'image'),false,'The resumed scripted greeting remains local');
});


test('operator mode buffers locally while active but uploads only one bounded sequence per Speak click',async t=>{
 const h=await mount(t,{active:true,provider:'openai',controlMode:'operator'});
 for(let i=0;i<300;i++)await h.tick();
 assert.ok(h.inferences.length>200,'Camera tracking continues locally while operator waits');
 assert.equal(h.sent.filter(m=>m.type==='host-observe').length,0);assert.ok(h.encoded.includes('observation'),'Active AI may retain a bounded local window before a cue');
 assert.equal(h.renders.at(-1).state.people,1,'The ball still tracks the guest locally');
 h.sync.onHost({type:'host-cue',sessionId:'synthetic-session',cueId:'click-one'});await h.tick();
 const observations=h.sent.filter(m=>m.type==='host-observe');assert.equal(observations.length,1);assert.equal(observations[0].reason,'speak');assert.equal(observations[0].cueId,'click-one');
 assert.ok(h.encoded.filter(name=>name==='observation').length>=1);assert.ok(observations[0].frames.length<=3);assert.equal('image' in observations[0],false);
 h.sync.onHost({type:'host-result',sessionId:observations[0].sessionId,requestId:observations[0].requestId,cueId:'click-one',text:'The pumpkin committee approves.'});await h.tick();
 assert.equal(h.played.length,1);assert.ok(h.sent.some(m=>m.type==='host-idle'&&m.cueId==='click-one'));
 for(let i=0;i<300;i++)await h.tick();
 assert.equal(h.sent.filter(m=>m.type==='host-observe').length,1,'No timer or local presence triggers another paid operation');
 h.sync.onHost({type:'host-cue',sessionId:'synthetic-session',cueId:'click-two'});await h.tick();
 assert.equal(h.sent.filter(m=>m.type==='host-observe').length,2);assert.ok(h.sent.filter(m=>m.type==='host-observe').every(m=>m.frames.length<=3));
 assert.ok(h.renders.every(render=>render.kind==='host'));
});
