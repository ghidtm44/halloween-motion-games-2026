import {HalloweenScene} from './scene';
import {cameraFit,mapPoseToStage} from './coordinates';
import {VisionEngine} from './vision';
import {WorldMusic} from './world-music';
import {CutoutStability} from './cutout-stability';
import {SyncClient} from './sync';
import {HostScene} from './host-scene';
import {HostAttention,HostSceneChanges} from './host-attention';
import {HostPerformer} from './host-player';
import {HostAudio} from './host-audio';
import {HostFrames} from './host-frames';
import {challengeGestures} from './host-challenge';
import {DEFAULT_SETTINGS,type Settings,type VisionFrame,type Pose,type PlayerStatus} from './types';
export function mountPlayer(){
  document.body.classList.add('player-page');document.title='Simple Playground V1 · Player';
  document.querySelector<HTMLDivElement>('#app')!.innerHTML=`<main class="player-shell"><canvas id="stage" width="1280" height="720" aria-label="Interactive Halloween playground"></canvas><div class="player-top"><span class="player-brand">☾ moonlight <small>MOTION</small></span><span id="player-indicator">Connecting locally…</span></div><div id="player-message" role="status"></div><div class="player-controls"><span id="player-hint">SCENE DEMO · Start your camera in the control room</span><button id="start-here">Start camera</button><button id="fullscreen">⛶ Fullscreen <kbd>F</kbd></button><a href="/" target="moonlight-simple-v1-admin">Control room ↗</a></div><div id="duplicate" hidden><h1>A player is already running.</h1><p>This window will take over if the other player closes.</p><a href="/">Back to control room</a></div><video id="camera-video" autoplay muted playsinline hidden></video></main>`;
  const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const stage=$<HTMLCanvasElement>('stage'),video=$<HTMLVideoElement>('camera-video'),scene=new HalloweenScene(stage),sync=new SyncClient('player');
  const music=new WorldMusic();scene.onReward=()=>music.celebrate();
  const hostScene=new HostScene(stage),attention=new HostAttention(),hostAudio=new HostAudio();
  const observation=document.createElement('canvas');
  const sceneChanges=new HostSceneChanges();let changeCanvas:HTMLCanvasElement|null=null,lastChangeSample=-Infinity;
  let attentionState={gaze:{x:.5,y:.45},people:0,arrival:false},hostSession='';
  const frameWindow=new HostFrames();
  const captureStill=()=>{
    if(!sync.active||!sync.connected||settings.scene!=='spooky'||settings.paused||!settings.cameraOn||!stream||video.readyState<2||!video.videoWidth||performance.now()-cameraFrameAt>700)return;
    const scale=Math.min(1,640/video.videoWidth,480/video.videoHeight);
    observation.width=Math.round(video.videoWidth*scale);observation.height=Math.round(video.videoHeight*scale);
    observation.getContext('2d')!.drawImage(video,0,0,observation.width,observation.height);
    const image=observation.toDataURL('image/jpeg',.65);observation.width=0;observation.height=0;return image;
  };
  const host=new HostPerformer({send:message=>sync.send(message),capture:()=>{
    frameWindow.sample(cameraFrameAt,captureStill,true);return frameWindow.read(performance.now());
  },play:(result,volume,muted)=>hostAudio.play(result,volume,muted),audioTimings:()=>hostAudio.timings,stopAudio:()=>{hostAudio.stop();hostScene.clearFlourish();},flourish:()=>hostScene.farewell()});
  const voiceButton=document.createElement('button');voiceButton.id='host-voice';voiceButton.textContent='Enable host voice';voiceButton.hidden=true;
  $('fullscreen').before(voiceButton);voiceButton.onclick=async()=>{voiceButton.textContent=await hostAudio.enable()?'Host voice enabled':'Tap to retry host voice';};
  const hostCaption=document.createElement('div');hostCaption.id='host-caption';hostCaption.className='sr-only';hostCaption.setAttribute('role','status');hostCaption.setAttribute('aria-live','polite');document.body.append(hostCaption);
  function configureHost(){
    const nextSession=sync.state.host?.sessionId||'';
    if(nextSession!==hostSession){frameWindow.clear();hostSession=nextSession;if(!sync.state.host?.continuation){attention.reset();sceneChanges.reset();}}
    host.configure(sync.state.host,sync.connected&&sync.active&&settings.scene==='spooky'&&!settings.paused,settings.hostVolume,settings.hostMuted);
    hostAudio.setVolume(settings.hostVolume);
    hostAudio.setEffects(settings.hostEffects,settings.hostEffectsBypass);
    if(!sync.state.host?.active||sync.state.host.provider!=='openai'||settings.paused||!sync.active||!sync.connected)frameWindow.clear();
    voiceButton.hidden=settings.scene!=='spooky';
    document.body.classList.toggle('spooky-player',settings.scene==='spooky');
    if(!host.caption)hostCaption.textContent='';
    if(settings.scene==='spooky'&&(!sync.connected||!sync.active))hostScene.render(0,{gaze:{x:.5,y:.45},people:0,speaking:false,caption:'',captions:settings.hostCaptions,label:'SPOOKY HOST · SESSION OFF',paused:false});
  }
  let settings:Settings={...DEFAULT_SETTINGS},stream:MediaStream|null=null,vision:VisionEngine|null=null,poses:Pose[]=[],model='Standby',camera='Camera off',error='',fallback='',configured='',generation=0,hasCutout=false,lastResult=0,inferenceMs=0,fps=0,frames=0,lastFps=0,lastSubmit=0,lastStatus=0,lastPreview=0,sceneTime=0,previousTime=0,maskSeen=false;
  let devices:PlayerStatus['devices']=[];
  const layer=document.createElement('canvas');layer.width=1280;layer.height=720;const ctx=layer.getContext('2d')!;
  const source=document.createElement('canvas');const sourceCtx=source.getContext('2d')!;const maskCanvas=document.createElement('canvas');const maskCtx=maskCanvas.getContext('2d')!;
  const thumbnail=document.createElement('canvas');thumbnail.width=480;thumbnail.height=270;
  const cutouts=new CutoutStability();
  let cameraFrame=0,submittedFrame=0,cameraFrameAt=0,lastVideoTime=-1,videoFrameCallback:number|null=null;

  const updateDevices=async()=>{try{devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput').map((d,i)=>({deviceId:d.deviceId,label:d.label||`Camera ${i+1}`}));}catch{devices=[];}};
  navigator.mediaDevices?.addEventListener('devicechange',updateDevices);void updateDevices();
  function onFrame(frame:VisionFrame){
    if(!stream){frame.image?.close();return;}
    maskSeen=!!frame.mask;lastResult=frame.timestamp;inferenceMs=frame.inferenceMs;
    const w=frame.image?.width||video.videoWidth||1280,h=frame.image?.height||video.videoHeight||720;
    poses=frame.poses.map(p=>mapPoseToStage(p,w,h,settings.mirror));
    if(settings.scene==='spooky'||settings.paused){frame.image?.close();cutouts.clear();}else cutouts.accept(frame,performance.now());
    if(settings.scene!=='spooky'&&settings.motion&&!settings.paused&&performance.now()-lastResult<300)scene.observe(poses,lastResult);else scene.clearTracking();
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
  function stopCamera(){frameWindow.clear();generation++;if(videoFrameCallback!==null)video.cancelVideoFrameCallback?.(videoFrameCallback);videoFrameCallback=null;cameraFrame=0;submittedFrame=0;cameraFrameAt=0;lastVideoTime=-1;lastSubmit=0;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;vision?.stop();vision=null;cutouts.clear();poses=[];hasCutout=false;maskSeen=false;lastResult=0;model='Standby';camera='Camera off';scene.clearTracking();ctx.clearRect(0,0,1280,720);}
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
      stream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{if(ownGeneration===generation){error='Camera disconnected. Reconnect it, then start camera or choose another input.';host.cancel();sync.send({type:'host-stop'});sync.patch({cameraOn:false});stopCamera();}}));
      await updateDevices();model='Loading local model…';
      const engine=vision=new VisionEngine(onFrame,(status,reason)=>{if(ownGeneration!==generation)return;model=status;if(reason)fallback=reason;},sync.state.motionOnly===true);
      await engine.start();
      if(ownGeneration!==generation){engine.stop();return;}
    }catch(caught){if(ownGeneration!==generation)return;const e=caught as Error;
      if(stream){model='Vision unavailable';fallback='Vision could not start. Camera overlay is active; manual effects still work.';console.warn(e);}
      else {camera='Camera unavailable';error=e.name==='NotAllowedError'?'Camera access was denied. Allow Chrome in System Settings → Privacy & Security → Camera, then stop and start camera.':e.name==='OverconstrainedError'?'That camera is unavailable. Select Default camera or another connected input.':`Could not open the camera: ${e.message}. Stop and start camera to retry.`;}
    }
  }
  function compose(now:number){
    ctx.clearRect(0,0,1280,720);hasCutout=false;
    if(settings.scene==='spooky'){fallback='The TV shows only the crystal ball. Camera tracking stays behind the scenes.';return;}
    if(!stream||video.readyState<2)return;
    const view=cutouts.view(now),blend=settings.mode==='camera'?0:view.blend;
    const pair=blend>0?view.pair:null,picture=pair?.image??video;
    const w=picture instanceof HTMLVideoElement?picture.videoWidth:picture.width,h=picture instanceof HTMLVideoElement?picture.videoHeight:picture.height;
    if(!w||!h)return;
    if(source.width!==w||source.height!==h){source.width=w;source.height=h;}
    const {w:dw,h:dh,x:dx,y:dy}=cameraFit(w,h);
    ctx.save();if(settings.mirror){ctx.translate(1280,0);ctx.scale(-1,1);}
    // Crossfade the same image's unmasked/masked versions, so a transition never
    // draws two people at different positions. A retained pair expires at 350 ms.
    if(blend<1){ctx.globalAlpha=.85*(1-blend);ctx.drawImage(picture,dx,dy,dw,dh);}
    if(pair){
      sourceCtx.clearRect(0,0,w,h);sourceCtx.globalCompositeOperation='source-over';sourceCtx.drawImage(picture,0,0,w,h);
      maskCanvas.width=pair.mask.width;maskCanvas.height=pair.mask.height;maskCtx.putImageData(pair.mask,0,0);sourceCtx.globalCompositeOperation='destination-in';sourceCtx.drawImage(maskCanvas,0,0,w,h);sourceCtx.globalCompositeOperation='source-over';
      if(settings.mode==='silhouette'){sourceCtx.globalCompositeOperation='source-in';const gradient=sourceCtx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#d3b6ff');gradient.addColorStop(1,'#6be9df');sourceCtx.fillStyle=gradient;sourceCtx.fillRect(0,0,w,h);sourceCtx.globalCompositeOperation='source-over';}
      ctx.globalAlpha=blend;ctx.drawImage(source,dx,dy,dw,dh);hasCutout=true;
    }
    ctx.restore();
    if(settings.mode==='camera')fallback='Camera overlay selected. Everyone remains visible, including when tracking is uncertain.';
    else if(blend<1)fallback=/load|init/i.test(model)?'Loading local vision. Camera overlay is active.':'Stabilizing the cutout. Camera overlay is the fallback while masks recover.';
    else fallback=view.holding?'Bridging a brief cutout dropout.':'';
  }

  let wakeLock:WakeLockSentinel|null=null;
  async function requestWake(){try{if('wakeLock' in navigator)wakeLock=await navigator.wakeLock.request('screen');}catch{}}
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();void requestWake();}catch{$('player-message').textContent='Use Chrome’s View → Enter Full Screen, or try the Fullscreen button again.';}}
  $('fullscreen').onclick=fullscreen;$('start-here').onclick=()=>{sync.send({type:'patch',patch:{cameraOn:true,demo:false,paused:false}});};
  stage.setAttribute('tabindex','0');
  stage.onclick=()=>{if(settings.scene==='spooky')void hostAudio.enable();else void music.enable();if(!document.fullscreenElement)void fullscreen();};
  stage.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();stage.click();}});
  window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='f')void fullscreen();});
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').innerHTML=document.fullscreenElement?'⛶ Exit fullscreen <kbd>F</kbd>':'⛶ Fullscreen <kbd>F</kbd>';document.body.classList.toggle('is-fullscreen',!!document.fullscreenElement);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void requestWake();void updateDevices();}});
  let hideTimer=0;document.addEventListener('pointermove',()=>{document.body.classList.add('controls-visible');clearTimeout(hideTimer);hideTimer=window.setTimeout(()=>document.body.classList.remove('controls-visible'),2800);});
  sync.onState=state=>{const reset=state.settings.mirror!==settings.mirror||state.settings.motion!==settings.motion;if(state.settings.mirror!==settings.mirror){poses=[];cutouts.clear();}if(state.settings.scene!==settings.scene||state.settings.paused!==settings.paused){if(state.settings.scene==='spooky'||settings.scene==='spooky'||state.settings.paused!==settings.paused)scene.clearTracking();attention.reset();host.cancel();if(state.settings.scene==='spooky'||settings.scene==='spooky'||state.settings.paused!==settings.paused)cutouts.clear();}settings=state.settings;if(reset)scene.clearTracking();configureHost();configureMusic();void configure();};
  sync.onRole=active=>{$('duplicate').hidden=active;$('duplicate').querySelector('h1')!.textContent=sync.connected?'A player is already running.':'Reconnecting to this Mac…';$('duplicate').querySelector('p')!.textContent=sync.connected?'This window will take over if the other player closes.':'Camera capture is paused. Keep the local launcher running; the player will reconnect automatically.';configureHost();configureMusic();void configure();};
  sync.onConnection=connected=>{$('player-indicator').textContent=connected?'● LOCAL PLAYER':'Reconnecting · camera paused';configureHost();configureMusic();void configure();};
  sync.onHost=message=>{if(message.type==='host-cue')host.cue(message,attentionState.people,performance.now());else void host.receive(message);};
  sync.onError=message=>{$('player-message').textContent=message;};sync.onEffect=event=>{if(sync.active)scene.trigger(event);};sync.connect();
  function configureMusic(){music.configure(settings.scene==='spooky'?'jungle':settings.scene,settings.musicVolume,settings.musicMuted,sync.active&&sync.connected&&!settings.paused&&settings.scene!=='spooky'&&!document.hidden);}
  document.addEventListener('visibilitychange',configureMusic);
  function frame(t:number){configureMusic();music.tick();const dt=previousTime?Math.min(t-previousTime,100):16;previousTime=t;if(!settings.paused)sceneTime+=dt;
    if(sync.active){
      if(!settings.paused){
        if(stream&&video.readyState>=2){
          // Inference may revisit the same pixels; only newly presented video frames
          // refresh tracking. Fall back to media time on older browsers.
          if(typeof video.requestVideoFrameCallback!=='function'&&video.currentTime!==lastVideoTime){lastVideoTime=video.currentTime;cameraFrame++;cameraFrameAt=t;}
          if(cameraFrame!==submittedFrame&&t-lastSubmit>(settings.quality==='performance'?120:65)&&vision?.submit(video,cameraFrameAt)){submittedFrame=cameraFrame;lastSubmit=t;}
        }
        compose(t);if(t-lastResult>=300)scene.clearTracking();
      }
      if(settings.scene==='spooky'){
        // Arrival needs a continuing stream of observations, not one frozen pose.
        attentionState=attention.update(!settings.paused&&t-lastResult<500?poses:[],t);
        let changed=false;
        if(sync.state.host?.active&&sync.state.host.provider==='openai'&&settings.hostControlMode==='auto'&&!settings.paused&&stream&&video.readyState>=2&&t-cameraFrameAt<1200){
          if(t-lastChangeSample>=500){
            changeCanvas??=document.createElement('canvas');changeCanvas.width=24;changeCanvas.height=18;
            const tiny=changeCanvas.getContext('2d',{willReadFrequently:true})!;
            tiny.drawImage(video,0,0,24,18);changed=sceneChanges.sample(tiny.getImageData(0,0,24,18).data,t);
            tiny.clearRect(0,0,24,18);lastChangeSample=t;
          }
        }else{sceneChanges.reset();if(changeCanvas){changeCanvas.width=0;changeCanvas.height=0;}}
        if(sync.state.host?.active&&sync.state.host.provider==='openai'&&!settings.paused&&stream&&t-cameraFrameAt<700)frameWindow.sample(cameraFrameAt,captureStill);
        else frameWindow.clear();
        host.tick(t,attentionState.people,attentionState.arrival,changed,!settings.paused&&t-lastResult<500?challengeGestures(poses):null);
        const controlLabel=settings.hostControlMode==='auto'?'AUTO':'OPERATOR';
        const label=sync.state.host?.active?(sync.state.host.provider==='mock'?`${controlLabel} · SCRIPTED DEMO`:`${controlLabel} · AI-GENERATED VOICE`):'SPOOKY HOST · SESSION OFF';
        hostScene.render(sceneTime,{gaze:attentionState.gaze,people:attentionState.people,speaking:host.speaking,voiceLevel:hostAudio.level,thinking:host.thinking,caption:host.caption,captions:settings.hostCaptions,label,paused:settings.paused});
      }else scene.render(sceneTime,settings,stream?layer:null,t-lastResult<300?poses:[],settings.demo&&!settings.cameraOn);
      const caption=settings.scene==='spooky'&&settings.hostCaptions?host.caption:'';if(hostCaption.textContent!==caption)hostCaption.textContent=caption;
      frames++;if(t-lastFps>=1000){fps=Math.round(frames*1000/(t-lastFps));frames=0;lastFps=t;}
      if(t-lastStatus>750){let preview:string|undefined;if(t-lastPreview>1200){const s=Math.min(stage.width/1280,stage.height/720);thumbnail.getContext('2d')!.drawImage(stage,(stage.width-1280*s)/2,(stage.height-720*s)/2,1280*s,720*s,0,0,480,270);preview=thumbnail.toDataURL('image/jpeg',.63);lastPreview=t;}
        sync.status({camera,model,people:t-lastResult<1200?poses.length:0,fps,inferenceMs,fullscreen:!!document.fullscreenElement,fallback,devices,error,preview,scene:settings.scene,hostCaption:settings.scene==='spooky'?host.caption:'',hostNotice:host.notice,hostVoiceEnabled:hostAudio.enabled,musicReady:music.enabled});lastStatus=t;
        $('player-indicator').textContent=settings.paused?'Ⅱ PAUSED':settings.demo&&!settings.cameraOn?'● SCENE DEMO':stream?`● LIVE · ${t-lastResult<1200?poses.length:0} / 3 PEOPLE`:'● CAMERA OFF';
        $('player-message').textContent=error||(settings.cameraOn&&!hasCutout&&settings.mode!=='camera'?fallback:'');
        $('player-hint').textContent=settings.demo&&!settings.cameraOn?'SCENE DEMO · Start your camera in the control room':settings.cameraOn?'WAVE FOR MAGIC · HANDS UP FOR BATS · HOP FOR CANDY':'CAMERA OFF · Start camera to step inside';$('start-here').hidden=settings.cameraOn;
        if(settings.scene==='spooky'){
          $('player-indicator').textContent=settings.paused?'Ⅱ PAUSED':sync.state.host?.active?(sync.state.host.provider==='mock'?'● SCRIPTED DEMO':'● AI SESSION ON'):'● HOST SESSION OFF';
          $('player-message').textContent=error;
          $('player-hint').textContent=host.notice;
        }
      }
    }
    requestAnimationFrame(frame);
  }requestAnimationFrame(frame);void requestWake();
  window.addEventListener('beforeunload',()=>{scene.dispose();music.dispose();host.cancel();hostAudio.dispose();hostScene.dispose?.();stopCamera();sync.close();void wakeLock?.release();});
}
