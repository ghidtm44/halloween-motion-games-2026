import {HalloweenScene} from './scene';
import {VisionEngine} from './vision';
import {SyncClient} from './sync';
import {MotionDetector} from './motion';
import {CornGameController} from './game-controller';
import {DEFAULT_SETTINGS,type Settings,type VisionFrame,type Pose,type PlayerStatus} from './types';
export function mountPlayer(){
  document.body.classList.add('player-page');document.title='Moonlight Motion · Player';
  document.querySelector<HTMLDivElement>('#app')!.innerHTML=`<main class="player-shell"><canvas id="stage" width="1280" height="720" aria-label="Interactive Halloween playground"></canvas><div class="player-top"><span class="player-brand">☾ moonlight <small>MOTION</small></span><span id="player-indicator">Connecting locally…</span></div><div id="player-message" role="status"></div><div class="player-controls"><span id="player-hint">SCENE DEMO · Start your camera in the control room</span><button id="start-here">Start camera</button><button id="fullscreen">⛶ Fullscreen <kbd>F</kbd></button><a href="/" target="moonlight-admin">Control room ↗</a></div><div id="duplicate" hidden><h1>A player is already running.</h1><p>This window will take over if the other player closes.</p><a href="/">Back to control room</a></div><video id="camera-video" autoplay muted playsinline hidden></video></main>`;
  const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const stage=$<HTMLCanvasElement>('stage'),video=$<HTMLVideoElement>('camera-video'),scene=new HalloweenScene(stage),sync=new SyncClient('player'),motion=new MotionDetector();
  const quest=new CornGameController(stage,event=>{
    if(['grab','deposit','bonus','win'].includes(event.kind))scene.trigger({id:crypto.randomUUID(),kind:event.kind==='win'||event.kind==='deposit'?'candy':'magic',x:event.x,y:event.y,at:Date.now()});
  });
  let settings:Settings={...DEFAULT_SETTINGS},stream:MediaStream|null=null,vision:VisionEngine|null=null,poses:Pose[]=[],model='Standby',camera='Camera off',error='',fallback='',configured='',generation=0,hasCutout=false,lastResult=0,inferenceMs=0,fps=0,frames=0,lastFps=0,lastSubmit=0,lastStatus=0,lastPreview=0,sceneTime=0,previousTime=0,maskSeen=false;
  let devices:PlayerStatus['devices']=[];
  const layer=document.createElement('canvas');layer.width=1280;layer.height=720;const ctx=layer.getContext('2d')!;
  const source=document.createElement('canvas');const sourceCtx=source.getContext('2d')!;const maskCanvas=document.createElement('canvas');const maskCtx=maskCanvas.getContext('2d')!;
  const thumbnail=document.createElement('canvas');thumbnail.width=480;thumbnail.height=270;
  let latestPair:ImageBitmap|null=null,latestMask:ImageData|null=null;
  let cameraFrame=0,submittedFrame=0,cameraFrameAt=0,lastVideoTime=-1,videoFrameCallback:number|null=null;
  const mapPose=(pose:Pose,w:number,h:number):Pose=>{const scale=Math.min(1280/w,720/h),dw=w*scale,dh=h*scale,dx=(1280-dw)/2,dy=(720-dh)/2;return {...pose,landmarks:pose.landmarks.map(p=>({...p,x:(dx+(settings.mirror?1-p.x:p.x)*dw)/1280,y:(dy+p.y*dh)/720}))};};
  const updateDevices=async()=>{try{devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput').map((d,i)=>({deviceId:d.deviceId,label:d.label||`Camera ${i+1}`}));}catch{devices=[];}};
  navigator.mediaDevices?.addEventListener('devicechange',updateDevices);void updateDevices();
  function onFrame(frame:VisionFrame){
    if(!stream){frame.image?.close();return;}
    latestPair?.close();latestPair=frame.image??null;latestMask=frame.mask;maskSeen=!!frame.mask;lastResult=frame.timestamp;inferenceMs=frame.inferenceMs;
    const w=frame.image?.width||video.videoWidth||1280,h=frame.image?.height||video.videoHeight||720;
    poses=frame.poses.map(p=>mapPose(p,w,h));
    if(settings.scene!=='cornmaze'&&settings.motion&&!settings.paused&&performance.now()-lastResult<1200)for(const trigger of motion.update(poses,lastResult,settings.sensitivity))scene.trigger({...trigger,id:crypto.randomUUID(),at:Date.now()});
  }
  function watchCameraFrames(ownGeneration:number){
    if(typeof video.requestVideoFrameCallback!=='function')return;
    const presented=(now:number)=>{
      if(ownGeneration!==generation||!stream)return;
      cameraFrame++;cameraFrameAt=now;
      videoFrameCallback=video.requestVideoFrameCallback(presented);
    };
    videoFrameCallback=video.requestVideoFrameCallback(presented);
  }
  function stopCamera(){generation++;if(videoFrameCallback!==null)video.cancelVideoFrameCallback?.(videoFrameCallback);videoFrameCallback=null;cameraFrame=0;submittedFrame=0;cameraFrameAt=0;lastVideoTime=-1;lastSubmit=0;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;vision?.stop();vision=null;latestPair?.close();latestPair=null;latestMask=null;poses=[];hasCutout=false;maskSeen=false;lastResult=0;model='Standby';camera='Camera off';motion.reset();quest.release();ctx.clearRect(0,0,1280,720);}
  async function configure(){
    const key=`${sync.connected&&sync.active}:${settings.cameraOn}:${settings.deviceId}`;if(key===configured)return;configured=key;stopCamera();error='';fallback='';
    if(!sync.active||!sync.connected||!settings.cameraOn)return;
    const ownGeneration=generation;camera='Requesting camera permission…';
    try{
      const candidate=await navigator.mediaDevices.getUserMedia({audio:false,video:{deviceId:settings.deviceId?{exact:settings.deviceId}:undefined,width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}});
      if(ownGeneration!==generation){candidate.getTracks().forEach(t=>t.stop());return;}
      stream=candidate;video.srcObject=stream;await video.play();if(ownGeneration!==generation)return;
      watchCameraFrames(ownGeneration);
      camera=stream.getVideoTracks()[0]?.label||'Camera connected';
      stream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{if(ownGeneration===generation){error='Camera disconnected. Reconnect it, then stop and start camera or choose another input.';camera='Camera disconnected';stopCamera();}}));
      await updateDevices();model='Loading local model…';
      const engine=vision=new VisionEngine(onFrame,(status,reason)=>{if(ownGeneration!==generation)return;model=status;if(reason)fallback=reason;});
      await engine.start();
      if(ownGeneration!==generation){engine.stop();return;}
    }catch(caught){if(ownGeneration!==generation)return;const e=caught as Error;
      if(stream){model='Vision unavailable';fallback='Vision could not start. Camera overlay is active; manual effects still work.';console.warn(e);}
      else {camera='Camera unavailable';error=e.name==='NotAllowedError'?'Camera access was denied. Allow Chrome in System Settings → Privacy & Security → Camera, then stop and start camera.':e.name==='OverconstrainedError'?'That camera is unavailable. Select Default camera or another connected input.':`Could not open the camera: ${e.message}. Stop and start camera to retry.`;}
    }
  }
  function compose(now:number){
    ctx.clearRect(0,0,1280,720);hasCutout=false;
    if(!stream||video.readyState<2)return;
    const fresh=now-lastResult<1200;
    const useMask=settings.mode!=='camera'&&fresh&&maskSeen&&latestMask&&poses.length>0;
    const picture=useMask&&latestPair?latestPair:video;
    const w=picture instanceof HTMLVideoElement?picture.videoWidth:picture.width,h=picture instanceof HTMLVideoElement?picture.videoHeight:picture.height;
    if(!w||!h)return;
    if(source.width!==w||source.height!==h){source.width=w;source.height=h;}
    sourceCtx.clearRect(0,0,w,h);sourceCtx.globalCompositeOperation='source-over';sourceCtx.drawImage(picture,0,0,w,h);
    if(useMask&&latestMask){
      maskCanvas.width=latestMask.width;maskCanvas.height=latestMask.height;maskCtx.putImageData(latestMask,0,0);sourceCtx.globalCompositeOperation='destination-in';sourceCtx.drawImage(maskCanvas,0,0,w,h);sourceCtx.globalCompositeOperation='source-over';
      if(settings.mode==='silhouette'){sourceCtx.globalCompositeOperation='source-in';const gradient=sourceCtx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#d3b6ff');gradient.addColorStop(1,'#6be9df');sourceCtx.fillStyle=gradient;sourceCtx.fillRect(0,0,w,h);sourceCtx.globalCompositeOperation='source-over';}
      hasCutout=true;
    }
    const scale=Math.min(1280/w,720/h),dw=w*scale,dh=h*scale,dx=(1280-dw)/2,dy=(720-dh)/2;
    ctx.save();if(settings.mirror){ctx.translate(1280,0);ctx.scale(-1,1);}if(!useMask)ctx.globalAlpha=.85;ctx.drawImage(source,dx,dy,dw,dh);ctx.restore();
    if(settings.mode==='camera')fallback='Camera overlay selected. Everyone remains visible, including when tracking is uncertain.';
    else if(!fresh||!maskSeen||!poses.length)fallback=/load|init/i.test(model)?'Loading local vision. Camera overlay is active.':'No usable foreground cutout. Camera overlay is active; keep full bodies in frame.';
    else fallback='';
  }
  let wakeLock:WakeLockSentinel|null=null;
  async function requestWake(){try{if('wakeLock' in navigator)wakeLock=await navigator.wakeLock.request('screen');}catch{}}
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();void requestWake();}catch{$('player-message').textContent='Use Chrome’s View → Enter Full Screen, or try the Fullscreen button again.';}}
  $('fullscreen').onclick=fullscreen;$('start-here').onclick=()=>{sync.send({type:'patch',patch:{cameraOn:true,demo:false,paused:false,gamePractice:false}});};
  window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='f')void fullscreen();});
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').innerHTML=document.fullscreenElement?'⛶ Exit fullscreen <kbd>F</kbd>':'⛶ Fullscreen <kbd>F</kbd>';document.body.classList.toggle('is-fullscreen',!!document.fullscreenElement);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void requestWake();void updateDevices();}});
  let hideTimer=0;document.addEventListener('pointermove',()=>{document.body.classList.add('controls-visible');clearTimeout(hideTimer);hideTimer=window.setTimeout(()=>document.body.classList.remove('controls-visible'),2800);});
  sync.onState=state=>{const reset=state.settings.mirror!==settings.mirror||state.settings.motion!==settings.motion;if(state.settings.mirror!==settings.mirror)poses=[];settings=state.settings;document.body.classList.toggle('corn-game',settings.scene==='cornmaze');if(reset)motion.reset();void configure();};
  sync.onRole=active=>{$('duplicate').hidden=active;$('duplicate').querySelector('h1')!.textContent=sync.connected?'A player is already running.':'Reconnecting to this Mac…';$('duplicate').querySelector('p')!.textContent=sync.connected?'This window will take over if the other player closes.':'Camera capture is paused. Keep the local launcher running; the player will reconnect automatically.';void configure();};
  sync.onConnection=connected=>{$('player-indicator').textContent=connected?'● LOCAL PLAYER':'Reconnecting · camera paused';void configure();};
  sync.onError=message=>{$('player-message').textContent=message;};sync.onEffect=event=>{if(sync.active)scene.trigger(event);};sync.connect();
  function frame(t:number){const dt=previousTime?Math.min(t-previousTime,100):16;previousTime=t;if(!settings.paused)sceneTime+=dt;
    if(sync.active){
      if(!settings.paused){
        if(stream&&video.readyState>=2){
          // Inference may revisit the same pixels; only newly presented video frames
          // refresh tracking and game dwell. Fall back to media time on older browsers.
          if(typeof video.requestVideoFrameCallback!=='function'&&video.currentTime!==lastVideoTime){lastVideoTime=video.currentTime;cameraFrame++;cameraFrameAt=t;}
          if(cameraFrame!==submittedFrame&&t-lastSubmit>(settings.quality==='performance'?120:65)&&vision?.submit(video,cameraFrameAt)){submittedFrame=cameraFrame;lastSubmit=t;}
        }
        compose(t);if(t-lastResult>=1200)motion.reset();
      }
      quest.update(dt,settings,poses,lastResult,t,sync.active&&sync.connected);
      scene.render(sceneTime,settings,stream?layer:null,t-lastResult<1200?poses:[],settings.demo&&!settings.cameraOn,settings.scene==='cornmaze'?quest.snapshot():undefined);
      frames++;if(t-lastFps>=1000){fps=Math.round(frames*1000/(t-lastFps));frames=0;lastFps=t;}
      if(t-lastStatus>750){let preview:string|undefined;if(t-lastPreview>1200){const s=Math.min(stage.width/1280,stage.height/720);thumbnail.getContext('2d')!.drawImage(stage,(stage.width-1280*s)/2,(stage.height-720*s)/2,1280*s,720*s,0,0,480,270);preview=thumbnail.toDataURL('image/jpeg',.63);lastPreview=t;}
        sync.status({camera,model,people:t-lastResult<1200?poses.length:0,fps,inferenceMs,fullscreen:!!document.fullscreenElement,fallback,devices,error,preview,game:settings.scene==='cornmaze'?quest.status():undefined});lastStatus=t;
        $('player-indicator').textContent=settings.paused?'Ⅱ PAUSED':settings.scene==='cornmaze'&&settings.gamePractice?'● MOUSE PRACTICE':settings.demo&&!settings.cameraOn?'● SCENE DEMO':stream?`● LIVE · ${t-lastResult<1200?poses.length:0} / 3 PEOPLE`:'● CAMERA OFF';
        $('player-message').textContent=error||(settings.cameraOn&&!hasCutout&&settings.mode!=='camera'?fallback:'');
        $('player-hint').textContent=settings.scene==='cornmaze'?(settings.gamePractice?'MOUSE PRACTICE · HOVER TO GRAB · CARRY TO A BASKET':'CORN MAZE QUEST · REACH, HOLD, CARRY · CHOOSE YOUR PATH'):settings.demo&&!settings.cameraOn?'SCENE DEMO · Start your camera in the control room':settings.cameraOn?'WAVE FOR MAGIC · HANDS UP FOR BATS · HOP FOR CANDY':'CAMERA OFF · Start camera to step inside';$('start-here').hidden=settings.cameraOn;
      }
    }
    requestAnimationFrame(frame);
  }requestAnimationFrame(frame);void requestWake();
  window.addEventListener('beforeunload',()=>{stopCamera();sync.close();void wakeLock?.release();});
}
