import type {Pose,VisionFrame} from './types';
type Pair={image:ImageBitmap;mask:ImageData;at:number;poses:Pose[]};
type Center={x:number;y:number};
function centers(poses:Pose[]):Center[]{return poses.map(p=>{const points=[11,12,23,24].map(i=>p.landmarks[i]).filter(v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&(v.visibility??0)>.5);return points.length?{x:points.reduce((n,v)=>n+v.x,0)/points.length,y:points.reduce((n,v)=>n+v.y,0)/points.length}:{x:-10,y:-10};});}
function stable(a:Pose[],b:Pose[]){if(!a.length||a.length!==b.length)return false;const remaining=centers(b);return centers(a).every(p=>{const index=remaining.findIndex(v=>p.x>=0&&v.x>=0&&Math.hypot(p.x-v.x,p.y-v.y)<.055);if(index<0)return false;remaining.splice(index,1);return true;});}
function covered(mask:ImageData,poses:Pose[]){
 if(!mask.width||!mask.height||mask.data.length!==mask.width*mask.height*4)return false;
 let visible=false;for(let i=3;i<mask.data.length;i+=4)if(mask.data[i]>30){visible=true;break;}if(!visible)return false;
 return poses.every(p=>{const samples=[p.landmarks[0],...[ [11,12],[23,24] ].flatMap(([a,b])=>{const x=p.landmarks[a],y=p.landmarks[b];return x&&y&&(x.visibility??0)>.6&&(y.visibility??0)>.6?[{x:(x.x+y.x)/2,y:(x.y+y.y)/2,visibility:1}]:[];})].filter(v=>v&&(v.visibility??0)>.6&&v.x>=0&&v.x<=1&&v.y>=0&&v.y<=1);
  return !samples.length||samples.some(v=>{const x=Math.min(mask.width-1,Math.round(v.x*(mask.width-1))),y=Math.min(mask.height-1,Math.round(v.y*(mask.height-1)));return mask.data[(y*mask.width+x)*4+3]>20;});
 });
}
/** Owns copied masks and their exact source images. It never applies an old mask to new pixels. */
export class CutoutStability {
 private pair:Pair|null=null;private inputAt=-Infinity;private missingAt=Infinity;private emptyAt=Infinity;
 private streak=0;private validSince=Infinity;private blend=0;private tickAt:number|null=null;private clearImmediately=false;
 get retained(){return this.pair?1:0;}
 clear(){this.pair?.image.close();this.pair=null;this.inputAt=-Infinity;this.missingAt=Infinity;this.emptyAt=Infinity;this.streak=0;this.validSince=Infinity;this.blend=0;this.tickAt=null;this.clearImmediately=false;}
 accept(frame:VisionFrame,now:number){
  if(!Number.isFinite(frame.timestamp)||frame.timestamp<=this.inputAt){frame.image?.close();return;}
  this.inputAt=frame.timestamp;
  const recent=now-frame.timestamp>=0&&now-frame.timestamp<350;
  const good=recent&&frame.image&&frame.poses.length&&frame.mask&&covered(frame.mask,frame.poses);
  const same=this.pair?stable(this.pair.poses,frame.poses):false;
  if(good&&frame.image&&frame.mask){
   const mask=frame.mask,old=this.pair?.mask;
   // Smooth uncertain edge alpha only. Definite zero/opaque pixels and motion
   // are never blended with an old silhouette, preventing persistent trails.
   if(same&&old&&old.width===mask.width&&old.height===mask.height&&this.pair&&frame.timestamp-this.pair.at<180){
    for(let i=3;i<mask.data.length;i+=4){const a=mask.data[i],b=old.data[i];if(a>12&&a<243&&b>12&&b<243&&Math.abs(a-b)<80)mask.data[i]=Math.round(a*.8+b*.2);}
   }
   this.pair?.image.close();this.pair={image:frame.image,mask,at:frame.timestamp,poses:frame.poses};
   if(!this.streak)this.validSince=now;this.streak++;this.missingAt=Infinity;this.emptyAt=Infinity;this.clearImmediately=false;
  }else{
   frame.image?.close();this.streak=0;this.validSince=Infinity;if(this.missingAt===Infinity)this.missingAt=now;
   if(!frame.poses.length){if(this.emptyAt===Infinity)this.emptyAt=now;}
   else{this.emptyAt=Infinity;if(!same)this.clearImmediately=true;}
   if(!recent)this.clearImmediately=true;
  }
 }
 view(now:number){
  const dt=this.tickAt===null?0:Math.max(0,Math.min(100,now-this.tickAt));this.tickAt=now;
  const age=this.pair?now-this.pair.at:Infinity,missing=now-this.missingAt;
  if(this.clearImmediately||age>350||now-this.emptyAt>=120){this.pair?.image.close();this.pair=null;this.blend=0;this.clearImmediately=false;}
  const holding=!!this.pair&&missing>=0&&missing<=120&&age<=300;
  const recovered=this.blend===1||(this.streak>=2&&now-this.validSince>=80);
  const target=this.pair&&(holding||recovered&&missing<0)?1:0;
  this.blend=Math.max(0,Math.min(1,this.blend+(target?1:-1)*dt/160));
  if(!target&&!holding&&missing>120&&this.blend===0){this.pair?.image.close();this.pair=null;}
  return {pair:this.pair,blend:this.pair?this.blend:0,holding,maskAgeMs:this.pair?Math.max(0,now-this.pair.at):0};
 }
}
