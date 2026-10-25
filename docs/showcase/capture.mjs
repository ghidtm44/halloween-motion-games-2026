// Documentation-only capture. Actual production renderers + synthetic landmarks.
// No camera, microphone, API calls, personal images, or app behavior modifications.
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';
const root=fileURLToPath(new URL('../..',import.meta.url)),app=resolve(root,'apps/simple-playground-v1');
const require=createRequire(resolve(app,'package.json'));const {chromium}=require('@playwright/test');const {createServer}=require('vite');
const out=resolve(root,'docs/media'),frames=resolve(app,'work/showcase');await mkdir(out,{recursive:true});await mkdir(frames,{recursive:true});
const vite=await createServer({root:app,server:{host:'127.0.0.1',port:0},logLevel:'error'});await vite.listen();const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});const errors=[],external=[];
try{
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(r.request().url().startsWith(base)||/^(blob|data):/.test(r.request().url()))return r.continue();external.push(r.request().url());return r.abort();});
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>{throw Error('Media capture forbidden in showcase');};Math.random=()=>.46;});
 await page.goto(base+'/models/manifest.json');
 await page.evaluate(async()=>{
  const {preloadWorldArt}=await import('/src/world-art.ts');await preloadWorldArt();const {HalloweenScene}=await import('/src/scene.ts');const {HostScene}=await import('/src/host-scene.ts');
  document.body.innerHTML='<style>body{margin:0;background:#071320}canvas{width:100vw;height:100vh;display:block}</style><canvas id="stage"></canvas>';
  window.stage=document.querySelector('canvas');window.scene=new HalloweenScene(window.stage);window.host=new HostScene(window.stage);window.people=document.createElement('canvas');window.people.width=1280;window.people.height=720;window.rewards=0;window.scene.onReward=()=>window.rewards++;
  window.drawPeople=(poses)=>{const c=window.people.getContext('2d');c.clearRect(0,0,1280,720);for(const [i,pose] of poses.entries()){
   const p=n=>({x:pose.landmarks[n].x*1280,y:pose.landmarks[n].y*720});const head=p(0),l=p(11),r=p(12),hip=p(23),lh=p(15),rh=p(16);const color=i?'#bdb4ff':'#95edee';
   c.save();c.strokeStyle=color;c.lineWidth=26;c.lineCap='round';c.lineJoin='round';c.shadowColor=color;c.shadowBlur=10;c.globalAlpha=.66;
   c.beginPath();c.moveTo(lh.x,lh.y);c.lineTo(l.x,l.y);c.lineTo(r.x,r.y);c.lineTo(rh.x,rh.y);c.stroke();
   const g=c.createLinearGradient(0,l.y,0,720);g.addColorStop(0,i?'#756dd8':'#299ba6');g.addColorStop(1,'#122b47');c.fillStyle=g;c.beginPath();c.moveTo(l.x-8,l.y);c.quadraticCurveTo(head.x,l.y-20,r.x+8,r.y);c.lineTo(r.x+19,hip.y+65);c.lineTo(l.x-19,hip.y+65);c.closePath();c.fill();
   c.fillStyle=color;c.beginPath();c.ellipse(head.x,head.y,34,43,0,0,Math.PI*2);c.fill();c.shadowBlur=0;c.lineWidth=25;
   for(const side of [-1,1]){c.beginPath();c.moveTo(head.x+side*25,hip.y+50);c.lineTo(head.x+side*39,735);c.stroke();}c.restore();
  }};
  window.step=(ms,world)=>{
   const object=window.scene.play.objects.find(o=>!o.collected),poses=[];
   for(const [i,cx] of [390,840].entries()){
    let dy=0;if(object?.kind==='duck'&&Math.abs(object.x-cx)<290)dy=75*Math.min(1,(290-Math.abs(object.x-cx))/90);
    const points=Array.from({length:33},()=>({x:0,y:0,visibility:0})),point=(n,x,y)=>points[n]={x:x/1280,y:(y+dy)/720,visibility:.99};
    point(0,cx,365);point(11,cx-48,445);point(12,cx+48,445);point(23,cx-26,590);point(24,cx+26,590);point(15,cx-78,515);point(16,cx+78,515);
    if(object&&!['duck','dodge','jump'].includes(object.kind)&&i===(object.x<640?0:1)){
     const blend=Math.max(0,Math.min(1,(object.age-.22)/.6)),side=object.x<cx?15:16,rest=points[side];points[side]={x:rest.x+(object.x/1280-rest.x)*blend,y:rest.y+(object.y/720-rest.y)*blend,visibility:.99};
    }
    poses.push({id:i+1,landmarks:points});
   }
   window.scene.observe(poses,ms);window.drawPeople(poses);window.scene.render(ms,{scene:world,motion:true,paused:false,playDensity:.5},window.people,poses);
  };
 });
 for(let frame=0;frame<144;frame++){
  const world=frame<48?'jungle':frame<96?'depths':'space';
  await page.evaluate(({frame,world})=>{for(let sub=0;sub<5;sub++)window.step((frame*5+sub+1)*1000/60,world);},{frame,world});
  await page.screenshot({path:resolve(frames,`motion-${String(frame).padStart(4,'0')}.png`)});
  if([30,78,126].includes(frame))await page.screenshot({path:resolve(out,`${world}.png`)});
 }
 const rewards=await page.evaluate(()=>window.rewards);if(rewards<3)throw Error('Actual interaction rewards missing');
 await page.evaluate(()=>window.host.render(0,{gaze:{x:.5,y:.45},speaking:false,caption:'',captions:false,label:'',people:2,paused:false}));await page.waitForFunction(()=>[...window.host.images.values()].every(im=>im.complete&&im.naturalWidth));
 for(let frame=0;frame<72;frame++){
  await page.evaluate(frame=>{const t=frame/12;for(let sub=0;sub<5;sub++){const sec=t+sub/60;if(frame===59&&sub===0)window.host.farewell();window.host.render(sec*1000,{gaze:{x:.5+Math.sin(sec*.9)*.32,y:.4},thinking:sec>1.6&&sec<2.4,speaking:sec>2.4&&sec<4.9,voiceLevel:Math.max(0,Math.sin(sec*12)*.7+Math.sin(sec*19)*.3),people:2,caption:'',captions:false,label:'',paused:false});}},frame);
  await page.screenshot({path:resolve(frames,`host-${String(frame).padStart(4,'0')}.png`)});if(frame===17)await page.screenshot({path:resolve(out,'spooky-host.png')});
 }
 if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));
 await writeFile(resolve(frames,'capture-report.json'),JSON.stringify({actualProductionRenderers:true,syntheticLandmarks:true,syntheticAvatarLayer:true,simulatedSpeechEnvelope:true,rewards,motionSeconds:12,hostSeconds:6,fps:12,realCamera:false,realMicrophone:false,paidRequests:0,errors,external},null,2));console.log(JSON.stringify({rewards,motionFrames:144,hostFrames:72,errors,external}));
}finally{await browser.close();await vite.close();}
