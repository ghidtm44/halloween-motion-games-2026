import type {Landmark,Pose} from './types';

export type PlayKind='candy'|'star'|'bubble'|'duck'|'dodge'|'jump';
export interface PlayObject {id:number;kind:PlayKind;x:number;y:number;vx:number;vy:number;radius:number;age:number;collected:boolean;duration:number;}
export interface PlayReward {x:number;y:number;kind:'catch'|'duck'|'dodge'|'jump';objectId:number;}
export type Point={x:number;y:number};
export const HAND_RADIUS=18;
export const COLLECTIBLE_RADIUS=58;
export const TRACK_FRESH_MS=300;
export const isObstacle=(kind:PlayKind)=>kind==='duck'||kind==='dodge'||kind==='jump';
// Rendering and interaction use this exact same wrist eligibility and geometry.
export const trackedPoint=(p:Landmark|undefined):Point|null=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&(p.visibility??0)>=.75?{x:p.x*1280,y:p.y*720}:null;
type Body={head:Point;center:Point;hip:Point|null;halfWidth:number;};
type Track={body:Body|null;hands:(Point|null)[];at:number;};
type Opportunity={body:Body;completed:boolean;riseAt:number;};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
function body(pose:Pose):Body|null{
 const head=trackedPoint(pose.landmarks[0]),left=trackedPoint(pose.landmarks[11]),right=trackedPoint(pose.landmarks[12]);
 if(!head||!left||!right)return null;
 const lh=trackedPoint(pose.landmarks[23]),rh=trackedPoint(pose.landmarks[24]);
 return {head,center:{x:(left.x+right.x)/2,y:(left.y+right.y)/2},hip:lh&&rh?{x:(lh.x+rh.x)/2,y:(lh.y+rh.y)/2}:null,halfWidth:Math.max(28,Math.abs(left.x-right.x)/2)};
}
function sweep(a:Point,b:Point,radius:number){
 const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/length)):0;
 return Math.hypot(a.x+t*dx,a.y+t*dy)<=radius;
}

/** One readable event at a time; scenery travels continuously, even with no people. */
export class WalkupPlay {
 private items:PlayObject[]=[];
 private tracks=new Map<number,Track>();
 private opportunities=new Map<number,Map<number,Opportunity>>();
 private lastPositions=new Map<number,Point>();
 private lastObservation=-Infinity;
 private previous:number|null=null;
 private density=.5;
 setDensity(value:number){this.density=Number.isFinite(value)?Math.max(0,Math.min(1,value)):.5;}
 private eventIn=0;private serial=0;private beat=0;private collectible=0;
 constructor(private random:()=>number=Math.random){}
 get objects():readonly PlayObject[]{return this.items;}
 get resourceCounts(){return {objects:this.items.length,tracks:this.tracks.size,opportunities:[...this.opportunities.values()].reduce((sum,m)=>sum+m.size,0)};}
 clearTracking(){this.tracks.clear();this.opportunities.clear();this.lastPositions.clear();this.lastObservation=-Infinity;}
 reset(){this.items=[];this.clearTracking();this.previous=null;this.eventIn=0;this.beat=0;this.collectible=0;}
 private spawn(){
  const sequence=['collect','collect','collect','duck','collect','collect','collect','jump','collect','collect','collect','dodge'] as const;
  const action=sequence[this.beat%sequence.length];
  const kind=action==='collect'?(['candy','star','bubble'] as const)[this.collectible++%3]:action;
  const bodies=[...this.tracks.values()].flatMap(t=>t.body?[t.body]:[]),target=bodies[this.beat%Math.max(1,bodies.length)];
  const right=this.beat%4<2,horizontal=kind==='duck'||kind==='jump';
  const x=horizontal?(right?-220:1500):kind==='dodge'?Math.max(180,Math.min(1100,target?.center.x??640)):300+this.random()*680;
  const y=kind==='duck'?Math.max(130,Math.min(430,target?.head.y??250)):kind==='jump'?Math.max(400,Math.min(620,(target?.hip?.y??470)+70)):kind==='dodge'?-80:265;
  const grabInterval=this.density<=.5?5-this.density*4.8:2.6-(this.density-.5)*1.2;
  const interval=isObstacle(kind)?Math.max(4.4,grabInterval+.8):grabInterval,duration=interval-.25;
  this.items.push({id:++this.serial,kind,x,y,vx:horizontal?(right?1:-1)*1660/(duration-.55):0,vy:kind==='dodge'?780/(duration-.55):horizontal?0:55,radius:kind==='duck'||kind==='jump'?110:kind==='dodge'?75:COLLECTIBLE_RADIUS,age:0,collected:false,duration});
  this.beat++;this.eventIn=interval;
 }
 advance(timeMs:number){
  const dt=this.previous===null?0:Math.max(0,Math.min(.08,(timeMs-this.previous)/1000));this.previous=timeMs;
  for(const o of this.items){const delay=isObstacle(o.kind)?.55:.2;const moving=Math.max(0,o.age+dt-delay)-Math.max(0,o.age-delay);o.age+=dt;o.x+=o.vx*moving;o.y+=o.vy*moving;}
  this.items=this.items.filter(o=>!o.collected&&o.age<o.duration&&o.y<810&&o.x>-250&&o.x<1530);
  const live=new Set(this.items.map(o=>o.id));for(const id of this.opportunities.keys())if(!live.has(id))this.opportunities.delete(id);for(const id of this.lastPositions.keys())if(!live.has(id))this.lastPositions.delete(id);
  this.eventIn-=dt;if(this.eventIn<=0&&!this.items.length)this.spawn();
 }
 observe(poses:Pose[],at:number):PlayReward[]{
  if(!Number.isFinite(at)||at<=this.lastObservation)return [];
  const gap=at-this.lastObservation;this.lastObservation=at;
  if(gap>TRACK_FRESH_MS){this.tracks.clear();this.opportunities.clear();this.lastPositions.clear();}
  const rewards:PlayReward[]=[],present=new Set<number>();
  for(const pose of poses.slice(0,3)){
   const current=body(pose),hands=[trackedPoint(pose.landmarks[15]),trackedPoint(pose.landmarks[16])];
   if(!current&&!hands.some(Boolean))continue;
   present.add(pose.id);let previous=this.tracks.get(pose.id);
   if(previous&&(at-previous.at>TRACK_FRESH_MS||(current&&previous.body&&distance(current.center,previous.body.center)>150))){previous=undefined;for(const m of this.opportunities.values())m.delete(pose.id);}
   if(!current||!previous?.body)for(const m of this.opportunities.values())m.delete(pose.id);
   if(previous)for(const o of this.items){
    if(o.collected)continue;
    if(!isObstacle(o.kind)){
     const before=this.lastPositions.get(o.id);if(!before)continue;
     for(let i=0;i<2;i++){
      const hand=hands[i],old=previous.hands[i];if(!hand||!old||distance(hand,old)>180)continue;
      const a={x:old.x-before.x,y:old.y-before.y},b={x:hand.x-o.x,y:hand.y-o.y},radius=o.radius+HAND_RADIUS;
      // Two fresh confident wrists confirm a visible overlap. Full-body landmarks
      // are irrelevant to grabbing; a missing hip must never disable a hand ring.
      if(Math.hypot(b.x,b.y)<=radius||(Math.hypot(a.x,a.y)>radius&&sweep(a,b,radius))){
       o.collected=true;rewards.push({kind:'catch',x:o.x/1280,y:o.y/720,objectId:o.id});break;
      }
     }
     continue;
    }
    if(!current||!previous.body)continue;
    let candidates=this.opportunities.get(o.id);if(!candidates){candidates=new Map();this.opportunities.set(o.id,candidates);}
    let chance=candidates.get(pose.id);
    if(!chance){
     const horizontal=o.kind==='duck'||o.kind==='jump',ahead=(current.head.x-o.x)*Math.sign(o.vx);
     const incoming=horizontal?ahead>o.radius+50&&ahead<o.radius+450&&(o.kind==='jump'?!!current.hip:Math.abs(current.head.y-o.y)<65):o.y<current.head.y-75&&o.y>current.head.y-340&&Math.abs(o.x-current.center.x)<o.radius+current.halfWidth;
     if(incoming){chance={body:current,completed:false,riseAt:-Infinity};candidates.set(pose.id,chance);}
    }
    if(!chance||chance.completed)continue;
    const baseline=chance.body,height=Math.max(180,(baseline.hip?.y??baseline.center.y+170)-baseline.head.y);
    const crouch=Math.max(18,Math.min(34,height*.085)),rise=Math.max(16,Math.min(30,height*.065));
    const crossing=Math.abs(o.x-baseline.head.x)<o.radius+80;
    const duck=o.kind==='duck'&&crossing&&current.head.y-baseline.head.y>crouch&&current.center.y-baseline.center.y>crouch*.5&&current.head.y>o.y+20&&Math.abs(current.center.x-baseline.center.x)<110;
    const dodge=o.kind==='dodge'&&o.y>=baseline.head.y-35&&o.y<=(baseline.hip?.y??baseline.center.y+170)&&Math.abs(current.center.x-baseline.center.x)>60&&Math.abs(current.center.x-o.x)>current.halfWidth+o.radius+12&&Math.abs(current.head.x-o.x)>o.radius+25;
    if(o.kind==='jump'&&baseline.hip&&current.hip&&baseline.hip.y-current.hip.y>rise&&baseline.head.y-current.head.y>rise*.45&&baseline.center.y-current.center.y>rise*.55&&Math.abs(current.center.x-baseline.center.x)<110)chance.riseAt=at;
    // A modest bounce/rise counts; no airborne-foot classification or high jump.
    const jump=o.kind==='jump'&&crossing&&current.hip!==null&&at-chance.riseAt<1200;
    if(duck||dodge||jump){chance.completed=true;rewards.push({kind:duck?'duck':dodge?'dodge':'jump',x:current.center.x/1280,y:current.head.y/720,objectId:o.id});}
   }
   this.tracks.set(pose.id,{body:current,hands,at});
  }
  for(const id of this.tracks.keys())if(!present.has(id)){this.tracks.delete(id);for(const m of this.opportunities.values())m.delete(id);}
  for(const o of this.items)this.lastPositions.set(o.id,{x:o.x,y:o.y});
  return rewards;
 }
}
