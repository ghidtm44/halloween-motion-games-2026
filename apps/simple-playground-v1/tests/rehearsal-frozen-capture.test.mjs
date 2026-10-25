/**
 * Runs the production player and VisionEngine capture path with deterministic
 * DOM, rendering, local sync, and model stand-ins. No webcam, browser, server,
 * network, permissions, or game-controller dependencies are used.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const asUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const load=async file=>transpile(await readFile(new URL('../src/'+file,import.meta.url),'utf8'));

for(const frameCallbacks of [true,false])test(`V1 capture rejects retained frames and resumes on new frames (${frameCallbacks?'video frame callbacks':'media-time fallback'})`,async t=>{
  const descriptors=new Map();
  const install=(name,value)=>{descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
  const events=new Map(),captures=[],inferences=[],renderedPoseCounts=[],tracks=[];
  let raf=null,frameSerial=0,now=1000;
  const classList={add(){},remove(){},toggle(){}};
  class Element {
    hidden=false;classList=classList;
    addEventListener(){}
    before(){}setAttribute(){}
    querySelector(){return new Element();}
  }
  class Canvas extends Element {
    width=1280;height=720;
    getBoundingClientRect(){return {left:0,top:0,width:1280,height:720};}
    getContext(){return {clearRect(){},drawImage(){},save(){},restore(){},translate(){},scale(){},putImageData(){},fillRect(){},createLinearGradient(){return {addColorStop(){}};}};}
    toDataURL(){return 'data:image/jpeg;base64,AA==';}
  }
  class Video extends Element {
    videoWidth=1280;videoHeight=720;readyState=2;currentTime=0;srcObject=null;
    callbacks=new Map();nextCallback=0;
    async play(){}
    requestVideoFrameCallback(callback){const id=++this.nextCallback;this.callbacks.set(id,callback);return id;}
    cancelVideoFrameCallback(id){this.callbacks.delete(id);}
    present(time){const pending=[...this.callbacks.values()];this.callbacks.clear();for(const callback of pending)callback(time,{mediaTime:this.currentTime,presentedFrames:frameSerial});}
    getVideoPlaybackQuality(){return {totalVideoFrames:frameSerial};}
  }
  const video=new Video(),elements=new Map([['stage',new Canvas()],['camera-video',video]]);
  if(!frameCallbacks)video.requestVideoFrameCallback=undefined;
  const getElement=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const newStream=()=>{const track={label:'Deterministic retained-frame fixture',readyState:'live',muted:false,stop(){this.readyState='ended';},addEventListener(){}};tracks.push(track);return {getTracks:()=>[track],getVideoTracks:()=>[track]};};
  install('HTMLVideoElement',Video);install('HTMLCanvasElement',Canvas);install('OffscreenCanvas',Canvas);
  install('document',{body:{classList,append(){}},querySelector:()=>new Element(),getElementById:getElement,createElement:()=>new Canvas(),addEventListener(){},fullscreenElement:null});
  install('window',{addEventListener:(name,callback)=>events.set(name,callback),setTimeout,clearTimeout});
  install('location',{origin:'http://127.0.0.1:49999'});
  install('navigator',{mediaDevices:{addEventListener(){},enumerateDevices:async()=>[],getUserMedia:async options=>{assert.equal(options.audio,false);return newStream();}}});
  install('requestAnimationFrame',callback=>{raf=callback;return 1;});
  install('createImageBitmap',async(source,options)=>{
    captures.push({mediaTime:source.currentTime,frameSerial});
    return {width:options.resizeWidth,height:options.resizeHeight,close(){},mediaTime:source.currentTime,frameSerial};
  });
  install('Worker',class {
    terminated=false;
    postMessage(message){
      if(message.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready',status:'Local GPU tracking ready'}}));
      else if(message.type==='frame'){
        inferences.push({timestamp:message.timestamp,mediaTime:message.image.mediaTime,frameSerial:message.image.frameSerial});
        // New frames may show an unchanged person: content equality is not a stall.
        const landmarks=Array.from({length:33},()=>({x:.3,y:.42,visibility:1}));
        queueMicrotask(()=>{if(!this.terminated)this.onmessage({data:{type:'frame',landmarks:[landmarks],mask:null,image:message.image,timestamp:message.timestamp,inferenceMs:1}});});
      }
    }
    terminate(){this.terminated=true;}
  });
  install('__v1CaptureHarness',{settings:null,render:poses=>renderedPoseCounts.push(poses.length)});
  t.after(()=>{
    events.get('beforeunload')?.();
    for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  });
  const types=asUrl(await load('types.ts')),vision=asUrl(await load('vision.ts')),motion=asUrl(await load('motion.ts'));
  const hostAttention=asUrl(await load('host-attention.ts')),hostPlayer=asUrl(await load('host-player.ts'));
  const hostScene=asUrl(`export class HostScene {clearFlourish(){}farewell(){}render(){}}`);
  const hostAudio=asUrl(`export class HostAudio {setEffects(){}dispose(){}setVolume(){}stop(){} async enable(){return false;} async play(){return false;}}`);
  const scene=asUrl(`export class HalloweenScene {observe(){}clearTracking(){}dispose(){}render(t,s,l,p){globalThis.__v1CaptureHarness.render(p);}trigger(){}}`);
  const sync=asUrl(`export class SyncClient {
    connected=true;active=true;state={};
    constructor(){globalThis.__v1CaptureHarness.sync=this;}
    connect(){this.state={settings:globalThis.__v1CaptureHarness.settings,playerConnected:true};this.onState(this.state);}
    status(){} send(){return true;} close(){}
  }`);
  const {DEFAULT_SETTINGS}=await import(types);
  const harness=globalThis.__v1CaptureHarness;
  harness.settings={...DEFAULT_SETTINGS,cameraOn:true,demo:false,mirror:false,mode:'camera'};
  let player=await load('player.ts');
  for(const [name,url] of Object.entries({scene,vision,sync,motion,types,'host-attention':hostAttention,'host-player':hostPlayer,'host-scene':hostScene,'host-audio':hostAudio,'cutout-stability':asUrl(await load('cutout-stability.ts')),'world-music':asUrl(await load('world-music.ts')),'host-frames':asUrl(await load('host-frames.ts')),'host-challenge':asUrl(await load('host-challenge.ts'))}))player=player.replace(`'./${name}'`,JSON.stringify(url));
  player=player.replace("'./coordinates'",JSON.stringify(asUrl(await load('coordinates.ts'))));
  const {mountPlayer}=await import(asUrl(player));
  mountPlayer();
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const tick=async(fresh=false,step=70)=>{now+=step;if(fresh){video.currentTime+=1/30;frameSerial++;video.present(now);}raf(now);await flush();};
  await flush();
  await tick(true);await tick(true);
  assert.equal(inferences.length,2,'Both initial camera frames reach real capture scheduling');
  for(let i=0;i<20;i++)await tick();
  assert.equal(captures.length,2,'A retained image must not be recaptured on render ticks');
  assert.equal(inferences.filter(frame=>frame.frameSerial===2).length,1,'A retained frame must be inferred only once');
  assert.equal(renderedPoseCounts.at(-1),0,'Tracking from a frozen camera must expire');
  const beforeResumption=inferences.length;
  for(let i=0;i<12;i++)await tick(true);
  assert.equal(inferences.length-beforeResumption,12,'Fresh frames containing the same pose must resume inference');
  assert.equal(renderedPoseCounts.at(-1),1,'Resuming camera frames restores visible tracking');
  const beforeBurst=inferences.length;
  for(let i=0;i<20;i++)await tick(true,20);
  const burst=inferences.slice(beforeBurst);
  assert.ok(burst.length>0&&burst.length<=6,'Fast camera frames still respect the inference throttle');
  for(let i=1;i<burst.length;i++)assert.ok(burst[i].timestamp-burst[i-1].timestamp>65);
  const canceledCallback=[...video.callbacks.values()][0];
  harness.sync.onState({settings:{...harness.settings,cameraOn:false},playerConnected:true});
  await flush();
  assert.equal(video.callbacks.size,0,'Stopping camera cancels the pending frame callback');
  assert.equal(video.srcObject,null,'Stopping camera detaches its video stream');
  assert.ok(tracks.every(track=>track.readyState==='ended'),'Stopping camera releases fixture tracks');
  harness.sync.onState({settings:harness.settings,playerConnected:true});
  await flush();
  canceledCallback?.(now,{mediaTime:video.currentTime,presentedFrames:frameSerial});
  const beforeRestartFrames=inferences.length;
  for(let i=0;i<10;i++)await tick();
  assert.ok(inferences.length-beforeRestartFrames<=(frameCallbacks?0:1),'Restart must reject old callbacks and repeated retained frames');
  const beforeNewCameraFrames=inferences.length;
  for(let i=0;i<12;i++)await tick(true);
  assert.equal(inferences.length-beforeNewCameraFrames,12,'A restarted camera processes fresh frames normally');
  assert.equal(renderedPoseCounts.at(-1),1);
});
