import type {PlayObject} from './walkup-play';
export type PlayWorld='jungle'|'depths'|'space';
export const isPlayWorld=(world:string):world is PlayWorld=>['jungle','depths','space'].includes(world);
const worlds:PlayWorld[]=['jungle','depths','space'];
const common=['backdrop','foreground','route','candy','star','bubble','duck','jump','dodge','prop0','prop1','prop2','actor0','actor1','distant0','atmosphere','celebration'];
const names=worlds.flatMap(w=>[...common,...(w==='jungle'?[]:['actor2','actor3','distant1','distant2'])].map(n=>`${w}-${n}`));
const images=new Map<string,HTMLImageElement>();const failed=new Set<string>();let pending:Promise<void>|null=null;
/** Shared decoded images, once per Player; no camera or network service involved. */
export function preloadWorldArt():Promise<void>{
 if(typeof Image==='undefined')return Promise.resolve();
 return pending??=Promise.all(names.map(async name=>{const image=new Image();image.src=`/art/worlds-v2/${name}.webp`;try{await image.decode();images.set(name,image);}catch{failed.add(name);}})).then(()=>{});
}
export const worldArtStatus=()=>({ready:images.size,expected:names.length,failed:[...failed],decodedBytes:[...images.values()].reduce((n,im)=>n+im.naturalWidth*im.naturalHeight*4,0)});
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
function sprite(c:CanvasRenderingContext2D,name:string,x:number,y:number,w:number,h:number,angle=0,alpha=1,flip=1){
 const im=images.get(name);if(!im)return;c.save();c.translate(x,y);c.rotate(angle);c.scale(flip,1);c.globalAlpha*=clamp(alpha);
 const scale=Math.min(w/im.naturalWidth,h/im.naturalHeight),iw=im.naturalWidth*scale,ih=im.naturalHeight*scale;c.drawImage(im,-iw/2,-ih/2,iw,ih);c.restore();
}
export function worldBackdrop(c:CanvasRenderingContext2D,world:PlayWorld){
 void preloadWorldArt();const im=images.get(`${world}-backdrop`);if(im)c.drawImage(im,0,0,1280,720);else{c.fillStyle=world==='jungle'?'#143e35':world==='depths'?'#103b60':'#242345';c.fillRect(0,0,1280,720);}
}
/** Atmosphere and distant action stay behind people, with a fixed camera. */
export function worldAmbient(c:CanvasRenderingContext2D,time:number,world:PlayWorld){
 if(world==='jungle'){
  for(let i=0;i<2;i++)sprite(c,'jungle-atmosphere',250+i*750+Math.sin(time*.08+i)*90,350+i*45,740,140,0,.12);
  sprite(c,'jungle-distant0',1020+Math.sin(time*.21)*100,120+Math.cos(time*.37)*30,90,75,Math.sin(time*.5)*.12,.75);
 }else if(world==='depths'){
  sprite(c,'depths-atmosphere',650+Math.sin(time*.08)*60,240,580,500,Math.sin(time*.06)*.03,.16);
  for(let i=0;i<3;i++){const x=((time*(13+i*6)+i*490)%1620)-170;sprite(c,`depths-distant${i}`,x,110+i*60+Math.sin(time*.5+i)*12,i===0?180:140,80,Math.sin(time*.4+i)*.04,.6+i*.1,i===1?-1:1);}
 }else{
  sprite(c,'space-atmosphere',1000+Math.sin(time*.05)*80,140,620,250,Math.sin(time*.025)*.1,.22);
  for(let i=0;i<3;i++){const x=(time*(18+i*5)+i*480)%1620-170;sprite(c,`space-distant${i}`,x,90+i*70+Math.sin(time*.2+i)*15,110+i*30,65,Math.sin(time*.3+i)*.05,.65);}
 }
}
/** Perspective textured route: mirrored tile seams, fixed horizon, edge parallax. */
export function worldTravel(c:CanvasRenderingContext2D,time:number,world:PlayWorld){
 const route=images.get(`${world}-route`),horizon=world==='space'?417:world==='depths'?390:385;
 if(route){
  c.save();const depth=720-horizon;
  // 3-pixel scan bands project a repeatable surface; opacity eases into the
  // generated route at the horizon and edges instead of covering it with a slab.
  for(let y=horizon+6;y<720;y+=3){const p=(y-horizon)/depth,half=38+p*490,sy=((1/(p+.23)*170-time*105)%512+512)%512;
   c.globalAlpha=clamp(p*2)*.62;c.drawImage(route,0,Math.min(510,sy),512,2,640-half,y,half*2,3);
  }c.restore();
 }
 for(let i=0;i<4;i++)for(const side of [-1,1]){
  const p=(i/4+time*.075+(side===1?.12:0))%1,q=p*p,x=640+side*(165+q*650),y=horizon+q*(760-horizon),size=25+q*230;
  sprite(c,`${world}-prop${i%3}`,x,y-size*.3,size,size,Math.sin(time*.4+i)*.015,Math.min(1,p*5));
 }
 // Edge foliage sits behind the participant compositor, never over their face.
 const im=images.get(`${world}-foreground`);if(im){c.save();c.globalAlpha=.9;c.drawImage(im,-10+Math.sin(time*.2)*5,-5,1300,735);c.restore();}
}
export function worldObject(c:CanvasRenderingContext2D,o:PlayObject,world:PlayWorld,time:number){
 const obstacle=['duck','dodge','jump'].includes(o.kind);
 const w=obstacle?(o.kind==='dodge'?155:230):112,h=obstacle?(o.kind==='duck'?120:o.kind==='jump'?85:170):112;
 sprite(c,`${world}-${o.kind}`,0,0,w,h,obstacle?0:Math.sin(time*1.5+o.id)*.09);
}
/** Pose changes provide anticipation, launch, recovery and a short success payoff. */
export function worldCharacters(c:CanvasRenderingContext2D,time:number,world:PlayWorld,object:PlayObject|undefined,sinceReward:number){
 const cheer=clamp(1-sinceReward/.95),intro=object?clamp(1-object.age/.65):0,side=object&&object.x>640?1:0;
 for(let i=0;i<2;i++){
  const x=i?1150:130,y=world==='jungle'?220:world==='depths'?230:240;
  const active=intro>0&&i===side,blink=time%6.7>6.45;
  const pose=world==='jungle'?Math.floor(time*(cheer?7:3))%2:cheer?2:active?1:blink?3:0;
  const flap=world==='jungle'?Math.sin(time*(cheer?10:4))*.07:Math.sin(time*1.2+i)*.035;
  sprite(c,`${world}-actor${pose}`,x+(active?Math.sin(intro*Math.PI)*15*(i?-1:1):0),y+Math.sin(time*1.4+i)*10-cheer*Math.abs(Math.sin(sinceReward*10))*20,world==='space'?135:210,world==='space'?185:170,flap,1,i?-1:1);
 }
 if(object&&intro>0){
  // A brief thrown glimmer connects the living world to the actual target.
  const p=1-intro,x=side?1150:130,y=220;
  sprite(c,`${world}-celebration`,x+(object.x-x)*p,y+(object.y-y)*p-Math.sin(p*Math.PI)*70,30,30,time,.55*intro);
 }
}
export function worldCelebration(c:CanvasRenderingContext2D,world:PlayWorld,x:number,y:number,age:number){
 if(age<0||age>.75)return;const p=age/.75;sprite(c,`${world}-celebration`,x,y,70+100*p,70+100*p,p*.22,(1-p)*.9);
}
