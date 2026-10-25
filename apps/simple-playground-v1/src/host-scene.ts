export interface HostSceneState {
  gaze:{x:number;y:number};speaking:boolean;voiceLevel?:number;thinking?:boolean;
  caption:string;captions:boolean;label:string;people:number;paused:boolean;
}
const W=1280,H=720,clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const names=['stage','head','eye-left','eye-right','brow-left','brow-right','jaw','collar'] as const;
type Part=typeof names[number];
/** Original raster rig. No camera, caption or visitor image can enter this renderer. */
export class HostScene {
  private ctx:CanvasRenderingContext2D;private images=new Map<Part,HTMLImageElement>();
  private time=0;private farewellAt=-Infinity;private jaw=0;private gaze={x:0,y:0};private reactionAt=-Infinity;private wasSpeaking=false;
  constructor(private canvas:HTMLCanvasElement){
    const c=canvas.getContext('2d',{alpha:false});if(!c)throw new Error('Crystal ball canvas unavailable.');this.ctx=c;
  }
  private load(){if(this.images.size)return;for(const name of names){const im=new Image();im.decoding='async';im.src=`/art/host-v2/${name}.webp`;this.images.set(name,im);}}
  private draw(c:CanvasRenderingContext2D,name:Part,x:number,y:number,w:number,h:number){const im=this.images.get(name);if(im?.complete&&im.naturalWidth)c.drawImage(im,x,y,w,h);}
  farewell(){this.farewellAt=this.time;}
  clearFlourish(){this.farewellAt=-Infinity;}
  dispose(){for(const im of this.images.values())im.src='';this.images.clear();}
  render(timeMs:number,state:HostSceneState){
    this.load();const dt=clamp(timeMs/1000-this.time,0,.05);if(!state.paused)this.time=timeMs/1000;const t=this.time;
    const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round((rect.width||W)*dpr)),h=Math.max(1,Math.round((rect.height||H)*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.fillStyle='#070b17';c.fillRect(0,0,w,h);
    const scale=Math.min(w/W,h/H);c.translate((w-W*scale)/2,(h-H*scale)/2);c.scale(scale,scale);
    c.save();c.beginPath();c.rect(0,0,W,H);c.clip();this.draw(c,'stage',0,0,W,H);
    if(![...this.images.values()].every(im=>im.complete&&im.naturalWidth)){c.restore();return;}
    const gx=(clamp(state.gaze.x,0,1)-.5)*36,gy=(clamp(state.gaze.y,0,1)-.45)*24;
    this.gaze.x+=(gx-this.gaze.x)*(1-Math.exp(-dt*6));this.gaze.y+=(gy-this.gaze.y)*(1-Math.exp(-dt*6));
    const amplitude=state.speaking&&!state.paused?clamp(state.voiceLevel||0,0,1):0;
    this.jaw+=(amplitude-this.jaw)*(1-Math.exp(-dt*(amplitude>this.jaw?28:16)));
    if(state.speaking&&!this.wasSpeaking)this.reactionAt=t;this.wasSpeaking=state.speaking;
    const reaction=Math.max(0,1-(t-this.reactionAt)/1.1),farewell=Math.max(0,1-(t-this.farewellAt)/1.4);
    c.save();c.beginPath();c.ellipse(640,285,258,246,0,0,Math.PI*2);c.clip();
    // Independent collar/breath, head/neck, gaze, eyelids, brows and audio-driven jaw.
    c.save();c.translate(640,300);c.scale(.285,.285);
    this.draw(c,'collar',-350,265+Math.sin(t*1.7)*8,700,540);
    c.translate(this.gaze.x*1.4,this.gaze.y+Math.sin(t*1.2)*5);
    c.rotate(this.gaze.x*.0015+(state.thinking?Math.sin(t*1.3)*.022:Math.sin(t*.6)*.009));
    c.translate(-627,-850);
    this.draw(c,'jaw',350,1020+this.jaw*45,550,510);
    this.draw(c,'head',0,0,1254,1254);
    const blinkPhase=t%5.9,blink=blinkPhase>5.68?Math.max(.04,Math.abs(blinkPhase-5.79)/.11):1;
    for(let i=0;i<2;i++){
      const ex=i?817:499,ey=758;
      c.save();c.beginPath();c.ellipse(ex,ey,100,51,0,0,Math.PI*2);c.clip();
      // Eyelid closes over the socket; eyes track separately from the head.
      c.fillStyle='#214a4e';c.fillRect(ex-110,ey-60,220,120);
      c.translate(ex,ey);c.scale(1,blink);
      this.draw(c,i?'eye-right':'eye-left',-108+this.gaze.x*.55,-71+this.gaze.y*.4+(state.thinking?-10:0),216,142);
      c.restore();
      c.save();c.translate(ex,666-(i?1:-1)*(state.thinking?20:state.people?9:0)-reaction*(i?26:8)-this.jaw*(i?12:4));
      c.rotate((i?1:-1)*(.025+reaction*.07));this.draw(c,i?'brow-right':'brow-left',-123,-61,246,142);c.restore();
    }
    // Lower lip/teeth sit over the dark mouth cavity. Hinge follows measured audio,
    // not a free-running sine wave, and closes immediately during quiet syllables.
    c.save();c.beginPath();c.moveTo(380,1120+this.jaw*45);c.quadraticCurveTo(627,1000+this.jaw*45,880,1120+this.jaw*45);c.lineTo(880,1500);c.lineTo(380,1500);c.closePath();c.clip();this.draw(c,'jaw',350,1020+this.jaw*45,550,510);c.restore();
    c.restore();
    // Sparse translucent wisps stay below the mouth, preserving facial readability.
    for(let i=0;i<3;i++){const x=640+Math.sin(t*.25+i*2)*150,y=490+Math.cos(t*.31+i)*20;const mist=c.createRadialGradient(x,y,5,x,y,100);mist.addColorStop(0,'#9cc5f018');mist.addColorStop(1,'#9cc5f000');c.fillStyle=mist;c.fillRect(x-100,y-100,200,200);}
    c.restore();
    for(let i=0;i<18;i++){const a=i*2.399+t*.05,r=190+(i%5)*19;c.fillStyle=`rgba(188,228,255,${.12+.12*Math.sin(t+i)**2})`;c.beginPath();c.arc(640+Math.cos(a)*r,285+Math.sin(a)*r*.84,.7+i%2,0,Math.PI*2);c.fill();}
    if(farewell>0){c.save();c.globalAlpha=farewell*farewell;c.strokeStyle='#bcecff';c.lineWidth=2;for(let i=0;i<24;i++){const a=i*Math.PI/12,r=230+(1-farewell)*130,x=640+Math.cos(a)*r,y=285+Math.sin(a)*r*.8;c.beginPath();c.moveTo(x-4,y);c.lineTo(x+4,y);c.moveTo(x,y-4);c.lineTo(x,y+4);c.stroke();}c.restore();}
    c.restore();
  }
}
