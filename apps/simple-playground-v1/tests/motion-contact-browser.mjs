// Black-box contact regression: production player, real mapping/vision ID path,
// fake camera, synthetic wrists, and observations of actual Canvas drawing.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlaygroundServer} from '../server.mjs';
const dir=await mkdtemp(join(tmpdir(),'motion-contact-')),results=[],errors=[];let browser;
const app=await createPlaygroundServer({port:0,stateFile:join(dir,'state.json'),motionOnly:true});
const base=`http://127.0.0.1:${app.port}`;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 for(const [width,height,mirror,cameraWidth,cameraHeight,wrist,contact] of [[1280,720,true,1280,720,15,'center'],[960,720,false,640,480,15,'edge'],[720,960,true,720,1280,16,'center'],[1920,1080,false,640,480,16,'edge'],[1280,720,true,1280,720,15,'journey']]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===1920?2:1,permissions:['camera']});
  await context.route('**/*',r=>r.request().url().startsWith(base)||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
  await context.addInitScript(()=>{
   Math.random=()=>.5;window.__mode='absent';window.__draw={objects:[],hands:[],particles:0};window.__bursts=0;window.__overlap=false;window.__rewardKinds={};window.__beats=0;window.__offsets=[0,0,0];window.__lastKind=null;let frame={objects:[],hands:[],obstacles:[],particles:0},arc=null;
   const canonical=value=>{const c=document.createElement('canvas').getContext('2d');c.strokeStyle=value;return c.strokeStyle;},handColor=canonical('#faffeeaa'),objectColors=['#ffe47baa','#adf4e7aa','#b4f3dfaa'].map(canonical);
   const proto=CanvasRenderingContext2D.prototype,set=proto.setTransform,begin=proto.beginPath,drawArc=proto.arc,stroke=proto.stroke,rect=proto.fillRect,fill=proto.fill,drawImage=proto.drawImage;
   const position=c=>{const m=c.getTransform(),s=Math.min(c.canvas.width/1280,c.canvas.height/720);return {x:(m.e-(c.canvas.width-1280*s)/2)/s,y:(m.f-(c.canvas.height-720*s)/2)/s};};
   proto.drawImage=function(source,...args){if(this.canvas.id==='stage'){const match=source?.src?.match(/\/(?:jungle|depths|space)-(duck|jump|dodge)\.webp$/);if(match)frame.obstacles.push({...position(this),kind:match[1]});}return drawImage.call(this,source,...args);};
   proto.setTransform=function(...args){if(this.canvas.id==='stage'){if(frame.particles&&!window.__draw.particles){window.__bursts++;window.__rewardKinds[window.__action]=(window.__rewardKinds[window.__action]||0)+1;}const kind=frame.objects.length?'catch':frame.obstacles[0]?.kind||null;if(kind&&!window.__lastKind)window.__beats++;window.__lastKind=kind;window.__draw=frame;frame={objects:[],hands:[],obstacles:[],particles:0};}return set.apply(this,args);};
   proto.beginPath=function(...args){arc=null;return begin.apply(this,args);};
   proto.arc=function(x,y,r,...args){const m=this.getTransform(),s=Math.min(this.canvas.width/1280,this.canvas.height/720);arc={x:(m.a*x+m.c*y+m.e-(this.canvas.width-1280*s)/2)/s,y:(m.b*x+m.d*y+m.f-(this.canvas.height-720*s)/2)/s,r};return drawArc.call(this,x,y,r,...args);};
   proto.stroke=function(...args){if(this.canvas.id==='stage'&&arc){if(this.strokeStyle===handColor){frame.hands.push(arc);const target=window.__target;if(target&&performance.now()-target.at<200&&Math.hypot(arc.x-target.x,arc.y-target.y)<=arc.r+target.r)window.__overlap=true;}if(objectColors.includes(this.strokeStyle)&&arc.r>=30)frame.objects.push(arc);}return stroke.apply(this,args);};
   proto.fillRect=function(x,y,w,h){if(this.canvas.id==='stage'&&w<=10&&h<=10&&['#ffe47b','#ffaf83','#a6e497','#fff3bf','#adf4e7','#ffc7b0','#ead0f5','#f5ffdf','#b4f3df','#dfb6ff','#ffe3a6','#b5deff'].includes(this.fillStyle))frame.particles++;return rect.call(this,x,y,w,h);};
   if(!navigator.mediaDevices)return;const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=options=>{if(options.audio)throw new Error('Microphone requested');return media({...options,video:{...options.video,width:{exact:window.__cameraWidth},height:{exact:window.__cameraHeight}}});};
   window.Worker=class{constructor(){this.stopped=false;}postMessage(m){if(m.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready',status:'Synthetic tracking ready'}}));if(m.type!=='frame')return;
    const target=window.__draw.objects.find(o=>o.y>160&&o.y<550);let landmarks=[];
    if(window.__exercise){
     const o=window.__draw.obstacles[0],fit=Math.min(1280/m.image.width,720/m.image.height),w=m.image.width*fit,h=m.image.height*fit,dx=(1280-w)/2,dy=(720-h)/2;if(target)window.__action='catch';else if(o)window.__action=o.kind;
     landmarks=[300,640,1000].map((base,i)=>{let x=base,head=250;const right=window.__beatDirection??1;
      if(o){if(window.__previousObstacle&&window.__previousObstacle.kind===o.kind&&Math.abs(o.x-window.__previousObstacle.x)>1)window.__beatDirection=Math.sign(o.x-window.__previousObstacle.x);const ahead=(base-o.x)*(window.__beatDirection||1);if(ahead<280&&ahead>-250){if(o.kind==='duck')head+=50;if(o.kind==='jump')head-=30;}if(o.kind==='dodge'&&o.y>145&&Math.abs(o.x-base)<150)window.__offsets[i]=Math.min(180,window.__offsets[i]+70);if(o.kind==='dodge')x+=window.__offsets[i]*(base>640?-1:1);}
      else window.__offsets[i]=0;
      const p=Array.from({length:33},()=>({x,y:400,visibility:1}));for(const [n,px,py] of [[0,x,head],[11,x-50,head+90],[12,x+50,head+90],[23,x-45,head+290],[24,x+45,head+290],[15,target&&i===1?target.x:x-100,target&&i===1?target.y:500],[16,x+100,500]])p[n]={x:px,y:py,visibility:1};
      return p.map(v=>({x:window.__mirror?1-(v.x-dx)/w:(v.x-dx)/w,y:(v.y-dy)/h,visibility:v.visibility}));
     });if(o)window.__previousObstacle=o;
    }else if(target&&window.__mode!=='absent'){window.__target={...target,at:performance.now()};
     const fit=Math.min(1280/m.image.width,720/m.image.height),w=m.image.width*fit,h=m.image.height*fit,dx=(1280-w)/2,dy=(720-h)/2;
     // ALL torso/head landmarks are deliberately unreliable: a visible wrist
     // must not be rejected because hips are cropped out of the camera.
     const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:.1}));
     const x=target.x+(window.__mode==='edge'?target.r+16:window.__mode==='outside'?target.r+40:0),y=target.y;
     const raw=(x-dx)/w;p[window.__wrist]={x:window.__mirror?1-raw:raw,y:(y-dy)/h,visibility:window.__mode==='uncertain'?.1:1};landmarks=[p];
     if(window.__draw.hands.some(hand=>Math.hypot(hand.x-target.x,hand.y-target.y)<=hand.r+target.r))window.__overlap=true;
    }
    const old=window.__mode==='stale';queueMicrotask(()=>{if(this.stopped){m.image.close();return;}this.onmessage?.({data:{type:'frame',landmarks,image:m.image,mask:null,timestamp:m.timestamp-(old?500:0),inferenceMs:1}});});
   }terminate(){this.stopped=true;}};
  });
  const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));await admin.goto(base);await expect(admin.locator('#connection')).toContainText('ready');
  await admin.locator('#mirror').setChecked(mirror);await admin.locator('[data-scene="jungle"]').click();
  const opened=context.waitForEvent('page');await admin.locator('#open-player').click();const player=await opened;player.on('pageerror',e=>errors.push(e.message));await player.waitForLoadState();await player.evaluate(config=>{window.__mirror=config.mirror;window.__cameraWidth=config.cameraWidth;window.__cameraHeight=config.cameraHeight;window.__wrist=config.wrist;window.__exercise=config.contact==='journey';},{mirror,cameraWidth,cameraHeight,wrist,contact});
  await admin.locator('#camera-toggle').click();await expect(admin.locator('#camera-note')).toContainText('fake');
  if(contact==='journey'){
   // A real minute of production animation: gestures come through the actual
   // worker -> pose ID -> mapping -> collision -> renderer path, no engine hooks.
   for(const world of ['depths','space','jungle']){await player.waitForTimeout(20000);await admin.locator(`[data-scene="${world}"]`).click();}
   const journey=await player.evaluate(()=>({beats:window.__beats,rewards:window.__rewardKinds}));
   for(const kind of ['catch','duck','jump','dodge'])assert.ok(journey.rewards[kind]>0,`Real player ${kind} reward missing: ${JSON.stringify(journey)}`);
   assert.ok(journey.beats>=19&&journey.beats<=22,JSON.stringify(journey));assert.equal(await player.locator('body').innerText(),'');results.push({journeySeconds:60,threeSyntheticPeople:true,liveWorldSwitches:true,...journey});
   await admin.locator('#camera-toggle').click();await player.close();await context.close();continue;
  }
  await expect.poll(()=>player.evaluate(()=>window.__draw.objects.length)).toBeGreaterThan(0);
  // Fresh wrists may be visible with an invalid body; first verify a visible
  // overlap, then require actual particles and collectible disappearance.
  for(const mode of ['uncertain','stale','absent','outside']){await player.evaluate(value=>{window.__mode=value;},mode);await player.waitForTimeout(220);assert.equal(await player.evaluate(()=>window.__bursts),0,mode+' must not collect');}
  await player.evaluate(value=>{window.__mode=value;},contact);
  await expect.poll(()=>player.evaluate(()=>window.__overlap),{timeout:4000}).toBe(true).catch(async error=>{console.log(JSON.stringify({width,height,mirror,cameraWidth,cameraHeight,wrist,contact,diagnostic:await player.evaluate(()=>({mode:window.__mode,draw:window.__draw,bursts:window.__bursts,video:{width:document.querySelector('video').videoWidth,height:document.querySelector('video').videoHeight}}))}));throw error;});
  await expect.poll(()=>player.evaluate(()=>window.__bursts),{timeout:1500}).toBe(1);
  await expect.poll(()=>player.evaluate(()=>window.__draw.objects.length)).toBe(0);
  await player.waitForTimeout(350);assert.equal(await player.evaluate(()=>window.__bursts),1,'One contact must produce one celebration');
  assert.equal(await player.locator('body').innerText(),'');
  results.push({width,height,mirror,cameraWidth,cameraHeight,wrist,contact,negativeCases:['uncertain','stale','absent','outside'],lowConfidenceBody:true,visibleOverlap:true,oneCelebration:true});
  await admin.locator('#camera-toggle').click();await player.close();await context.close();
 }
 assert.deepEqual(errors,[]);await mkdir('work',{recursive:true});const report={passed:true,results,realCamera:false,paidCalls:0,browserErrors:errors};await writeFile('work/motion-contact-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await app.close();await rm(dir,{recursive:true,force:true});}
