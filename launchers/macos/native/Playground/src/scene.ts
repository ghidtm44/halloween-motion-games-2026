import type {EffectEvent,Pose,Settings} from './types';
import {HostScene} from './host-scene';
import {WalkupPlay,HAND_RADIUS,isObstacle,trackedPoint} from './walkup-play';
import {worldBackdrop,worldAmbient,worldTravel,worldCharacters,worldObject,worldCelebration,type PlayWorld} from './world-art';
const W=1280,H=720;
const COLORS:Record<PlayWorld,string[]>={jungle:['#ffe47b','#ffaf83','#a6e497','#fff3bf'],depths:['#adf4e7','#ffc7b0','#ead0f5','#f5ffdf'],space:['#b4f3df','#dfb6ff','#ffe3a6','#b5deff']};
type Particle={x:number;y:number;vx:number;vy:number;life:number;age:number;size:number;spin:number;rotation:number;seed:number;spark:boolean};
const random=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const ellipse=(c:CanvasRenderingContext2D,x:number,y:number,r:number)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();};
/** Shared mechanics across all three worlds. Changing the theme never resets play. */
export class HalloweenScene {
 private host:HostScene;private ctx:CanvasRenderingContext2D;
 private play=new WalkupPlay();private bursts:{x:number;y:number;at:number}[]=[];
 private particles:Particle[]=[];private seen=new Set<string>();private serial=0;
 private previous:number|null=null;private time=0;private rewardAt=-10;
 onReward:(()=>void)|null=null;
 constructor(private canvas:HTMLCanvasElement){this.host=new HostScene(canvas);const c=canvas.getContext('2d',{alpha:false});if(!c)throw new Error('Scene canvas unavailable.');this.ctx=c;}
 clearTracking(){this.play.clearTracking();}
 dispose(){this.play.reset();this.bursts=[];this.particles=[];this.seen.clear();}
 observe(poses:Pose[],at:number){const rewards=this.play.observe(poses,at);if(rewards.length){this.rewardAt=this.time;this.onReward?.();}for(const r of rewards)this.trigger({id:`reward-${++this.serial}`,kind:r.kind==='catch'?'candy':'magic',x:r.x,y:r.y,at},true);}
 trigger(effect:EffectEvent,brief=false){
  if(this.seen.has(effect.id))return;this.seen.add(effect.id);if(this.seen.size>250)this.seen.delete(this.seen.values().next().value!);
  const x=Math.max(0,Math.min(1,effect.x??.5))*W,y=Math.max(0,Math.min(1,effect.y??.45))*H;
  this.bursts.push({x,y,at:this.time});if(this.bursts.length>8)this.bursts.shift();
  for(let i=0;i<(brief?22:45);i++){const seed=++this.serial,angle=random(seed)*Math.PI*2,speed=60+random(seed+8)*(brief?120:240);this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-50,life:(brief?.65:1.3)+random(seed+4)*(brief?.25:.6),age:0,size:3+random(seed+2)*6,spin:(random(seed+9)-.5)*8,rotation:random(seed)*6.28,seed,spark:effect.kind==='magic'});}
  if(this.particles.length>350)this.particles.splice(0,this.particles.length-350);
 }
 render(timeMs:number,settings:Settings,peopleLayer?:CanvasImageSource|null,poses:Pose[]=[],_demo=false){
  if(settings.scene==='spooky'){this.host.render(timeMs,{gaze:{x:.5,y:.45},speaking:false,caption:'',captions:settings.hostCaptions,label:'SPOOKY HOST · SCENE PREVIEW',people:0,paused:settings.paused});return;}
  const dt=settings.paused||this.previous===null?0:Math.max(0,Math.min(.08,(timeMs-this.previous)/1000));this.previous=timeMs;this.time+=dt;
  this.play.setDensity(settings.playDensity);this.play.advance(this.time*1000);
  const world=settings.scene,c=this.ctx,b=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  const width=Math.max(1,Math.round((b.width||W)*dpr)),height=Math.max(1,Math.round((b.height||H)*dpr));
  if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
  c.setTransform(1,0,0,1,0,0);c.fillStyle='#080f21';c.fillRect(0,0,width,height);
  const scale=Math.min(width/W,height/H);c.translate((width-W*scale)/2,(height-H*scale)/2);c.scale(scale,scale);c.save();c.beginPath();c.rect(0,0,W,H);c.clip();
  worldBackdrop(c,world);worldAmbient(c,this.time,world);worldTravel(c,this.time,world);worldCharacters(c,this.time,world,this.play.objects.find(o=>!o.collected),this.time-this.rewardAt);
  if(peopleLayer)c.drawImage(peopleLayer,0,0,W,H);
  if(settings.motion&&!settings.paused)for(const pose of poses.slice(0,3))for(const index of [15,16]){const p=trackedPoint(pose.landmarks[index]);if(!p)continue;c.strokeStyle='#faffeeaa';c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,HAND_RADIUS,0,Math.PI*2);c.stroke();}
  for(const o of this.play.objects){
   if(o.collected)continue;c.save();c.translate(o.x,o.y);
   const obstacle=isObstacle(o.kind),radius=o.radius+12;
   const glow=c.createRadialGradient(0,0,4,0,0,radius);glow.addColorStop(0,obstacle?'#b6d5ff22':COLORS[world][0]+'66');glow.addColorStop(1,'#ffffff00');c.fillStyle=glow;ellipse(c,0,0,radius);
   if(!obstacle){c.strokeStyle=COLORS[world][0]+'aa';c.lineWidth=2;c.beginPath();c.arc(0,0,o.radius,0,Math.PI*2);c.stroke();}
   worldObject(c,o,world,this.time);
   c.strokeStyle='#ecfff2aa';c.lineWidth=4;
   if(o.kind==='duck'){c.beginPath();c.moveTo(-28,34);c.quadraticCurveTo(0,65,28,34);c.stroke();c.beginPath();c.moveTo(20,36);c.lineTo(28,34);c.lineTo(28,43);c.stroke();}
   if(o.kind==='jump'){c.beginPath();c.moveTo(-28,-38);c.quadraticCurveTo(0,-95,28,-38);c.stroke();c.beginPath();c.moveTo(17,-44);c.lineTo(28,-38);c.lineTo(30,-51);c.stroke();}
   if(o.kind==='dodge')for(const side of [-1,1]){c.beginPath();c.moveTo(side*82,-8);c.lineTo(side*92,0);c.lineTo(side*82,8);c.stroke();}
   c.restore();
  }
  for(const p of this.particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=120*dt;p.rotation+=p.spin*dt;c.save();c.translate(p.x,p.y);c.rotate(p.rotation);c.globalAlpha=Math.min(1,(p.life-p.age)/.4);c.fillStyle=COLORS[world][p.seed%4];if(p.spark){c.fillRect(-p.size,-1,p.size*2,2);c.fillRect(-1,-p.size,2,p.size*2);}else c.fillRect(-p.size/2,-p.size/3,p.size,p.size*.66);c.restore();}
  for(const burst of this.bursts)worldCelebration(c,world,burst.x,burst.y,this.time-burst.at);this.bursts=this.bursts.filter(b=>this.time-b.at<.75);
  this.particles=this.particles.filter(p=>p.age<p.life);c.restore();
 }
}
