/**
 * Regression for a stalled camera decoder. Runs real player.ts -> VisionEngine
 * capture scheduling -> CornGameController -> CornMazeGame. Only browser/DOM,
 * synchronization, rendering, and model inference are deterministic stand-ins.
 * No browser, server, webcam, network, or permissions are used.
 *
 * The worker returns the same pose for the same retained image. The source video
 * stops presenting new frames but retains readyState=2 and its final image.
 * Expected: the retained image cannot complete an unfinished hand dwell.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import ts from 'typescript';

const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const asUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const load=async file=>transpile(await readFile(new URL('../src/'+file,import.meta.url),'utf8'));

for(const frameCallbacks of [true,false])test(`production capture rejects retained frames and resumes on fresh frames (${frameCallbacks?'video frame callbacks':'media-time fallback'})`,async t=>{
  const descriptors=new Map();
  const install=(name,value)=>{descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
  const events=new Map(),captures=[],inferences=[],snapshots=[],effects=[];
  let raf=null,frameSerial=0;
  const classList={add(){},remove(){},toggle(){}};
  class Element {
    hidden=false;classList=classList;
    addEventListener(){}
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
    present(now){const pending=[...this.callbacks.values()];this.callbacks.clear();for(const callback of pending)callback(now,{mediaTime:this.currentTime,presentedFrames:frameSerial});}
    getVideoPlaybackQuality(){return {totalVideoFrames:frameSerial};}
  }
  const video=new Video(),elements=new Map([['stage',new Canvas()],['camera-video',video]]);
  if(!frameCallbacks)video.requestVideoFrameCallback=undefined;
  const getElement=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const tracks=[];
  const newStream=()=>{const track={label:'Deterministic retained-frame fixture',readyState:'live',muted:false,stop(){this.readyState='ended';},addEventListener(){}};tracks.push(track);return {getTracks:()=>[track],getVideoTracks:()=>[track]};};
  install('HTMLVideoElement',Video);install('HTMLCanvasElement',Canvas);
  install('OffscreenCanvas',Canvas);
  install('document',{body:{classList},querySelector:()=>new Element(),getElementById:getElement,createElement:()=>new Canvas(),addEventListener(){},fullscreenElement:null});
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
        const landmarks=Array.from({length:33},(_,index)=>({x:.3,y:.42,visibility:index===15?1:0}));
        queueMicrotask(()=>{if(!this.terminated)this.onmessage({data:{type:'frame',landmarks:[landmarks],mask:null,image:message.image,timestamp:message.timestamp,inferenceMs:1}});});
      }
    }
    terminate(){this.terminated=true;}
  });
  install('__rehearsalCaptureHarness',{
    settings:null,
    render:game=>{if(game)snapshots.push(structuredClone(game));},
    effect:event=>effects.push(event),
  });
  t.after(()=>{
    events.get('beforeunload')?.();
    for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  });
  const types=asUrl(await load('types.ts'));
  const engine=asUrl(await load('corn-game.ts'));
  const controller=asUrl((await load('game-controller.ts')).replace("'./corn-game'",JSON.stringify(engine)));
  const vision=asUrl(await load('vision.ts'));
  const motion=asUrl(await load('motion.ts'));
  const scene=asUrl(`export class HalloweenScene {render(t,s,l,p,d,g){globalThis.__rehearsalCaptureHarness.render(g);}trigger(e){globalThis.__rehearsalCaptureHarness.effect(e);}}`);
  const sync=asUrl(`export class SyncClient {
    connected=true;active=true;
    constructor(){globalThis.__rehearsalCaptureHarness.sync=this;}
    connect(){this.onState({settings:globalThis.__rehearsalCaptureHarness.settings,playerConnected:true});}
    status(){} send(){return true;} close(){}
  }`);
  const {DEFAULT_SETTINGS}=await import(types);
  globalThis.__rehearsalCaptureHarness.settings={...DEFAULT_SETTINGS,scene:'cornmaze',cameraOn:true,demo:false,mirror:false,mode:'camera'};
  let player=await load('player.ts');
  for(const [name,url] of Object.entries({scene,vision,sync,motion,'game-controller':controller,types}))player=player.replace(`'./${name}'`,JSON.stringify(url));
  const {mountPlayer}=await import(asUrl(player));
  mountPlayer();
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();
  for(let i=0;i<2;i++){
    video.currentTime=i/30;frameSerial++;
    video.present(1000+i*70);raf(1000+i*70);await flush();
  }
  const beforeFreeze=snapshots.at(-1);
  // No further video frame callbacks, media-time changes, or decoder frames.
  for(let i=2;i<20;i++){raf(1000+i*70);await flush();}
  const afterFreeze=snapshots.at(-1);
  const retained=inferences.filter(item=>item.frameSerial===2);
  assert.equal(new Set(retained.map(item=>item.mediaTime)).size,1,'Fixture media time must remain frozen');
  const frozenCaptureCount=captures.length;
  // New decoded frames may contain the very same photo/pose; they must resume dwell.
  for(let i=20;i<32;i++){video.currentTime+=1/30;frameSerial++;video.present(1000+i*70);raf(1000+i*70);await flush();}
  const afterResumption=snapshots.at(-1);
  const canceledCallback=[...video.callbacks.values()][0];
  const harness=globalThis.__rehearsalCaptureHarness;
  harness.sync.onState({settings:{...harness.settings,cameraOn:false},playerConnected:true});
  await flush();
  assert.equal(video.callbacks.size,0,'Stopping camera cancels its video callback');
  assert.ok(tracks.every(track=>track.readyState==='ended'),'Stopping camera releases fixture tracks');
  harness.sync.onState({settings:harness.settings,playerConnected:true});
  await flush();
  canceledCallback?.(3300,{mediaTime:video.currentTime,presentedFrames:frameSerial});
  const beforeRestartFrames=inferences.length;
  for(let now=3300;now<4000;now+=70){raf(now);await flush();}
  assert.ok(inferences.length-beforeRestartFrames<=(frameCallbacks?0:1),'Restart must not resurrect callbacks or repeatedly infer an old frame');
  assert.equal(snapshots.at(-1).items[0].heldBy,null,'Restart clears held corn while camera has no new frames');
  for(let now=4000;now<4900;now+=70){video.currentTime+=1/30;frameSerial++;video.present(now);raf(now);await flush();}
  const afterRestart=snapshots.at(-1);
  const evidence={
    purpose:'Real production capture scheduling and game code with deterministic DOM/model stand-ins; no physical camera.',
    frameDetection:frameCallbacks?'requestVideoFrameCallback':'currentTime fallback',
    expected:'One retained camera frame must not complete an unfinished corn grab.',
    observed:{frozenCaptureCount,retainedFrameInferenceCount:retained.length,retainedInferenceTimestamps:retained.map(item=>item.timestamp),beforeFreeze:beforeFreeze.items[0],afterFreeze:afterFreeze.items[0],afterResumption:afterResumption.items[0],afterRestart:afterRestart.items[0],triggeredEffects:effects.length},
    conclusion:afterFreeze.items[0].heldBy?'Reproduced: fresh inference timestamps from one retained video frame complete the corn grab.':'Retained frame did not complete the grab; new frames and a camera restart restore normal grabbing.',
    limitation:'Simulates a decoder retaining a last frame; does not assert that a particular camera/Chrome stall produces this exact state. Model landmarks are deterministic fixtures; capture scheduling, ID assignment, pose mapping, controller, and game are production code.',
  };
  if(process.env.REHEARSAL_EVIDENCE_DIR){
    const evidenceDir=resolve(process.env.REHEARSAL_EVIDENCE_DIR);await mkdir(evidenceDir,{recursive:true});
    await writeFile(resolve(evidenceDir,`frozen-camera-${frameCallbacks?'callbacks':'fallback'}.json`),JSON.stringify(evidence,null,2)+'\n');
  }
  assert.equal(afterFreeze.items[0].heldBy,null,'A stale retained camera frame completed a grab despite no new decoded frames');
  assert.equal(retained.length,1,'One retained frame must be inferred only once');
  assert.ok(afterResumption.items[0].heldBy,'Fresh frames of an unchanged pose must resume and complete the grab');
  assert.ok(afterRestart.items[0].heldBy,'New frames after a camera restart must complete the grab');
});
