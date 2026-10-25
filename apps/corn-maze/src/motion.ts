import type {Pose, EffectKind} from './types';
export interface MotionTrigger {kind:EffectKind;x:number;y:number;}
interface History {left:{x:number;y:number};right:{x:number;y:number};hip:number;time:number;lastRaised:boolean;cooldown:number;}
export class MotionDetector {
  private history=new Map<number,History>();
  reset(){this.history.clear();}
  update(poses:Pose[],now:number,sensitivity=1):MotionTrigger[]{
    const triggers:MotionTrigger[]=[];
    for(const pose of poses){
      const p=pose.landmarks;
      const visible=(i:number)=>p[i] && (p[i].visibility??1)>.55;
      if(![11,12,15,16,23,24].every(visible))continue;
      const wrist=p[15].y<p[16].y?p[15]:p[16];
      const hip=(p[23].y+p[24].y)/2;
      const raised=p[15].y<p[11].y-.08 && p[16].y<p[12].y-.08;
      const previous=this.history.get(pose.id);
      let cooldown=previous?.cooldown??0;
      if(previous && now-previous.time<600 && now>cooldown){
        const dt=Math.max((now-previous.time)/1000,.04);
        const leftSpeed=Math.hypot(p[15].x-previous.left.x,p[15].y-previous.left.y)/dt;
        const rightSpeed=Math.hypot(p[16].x-previous.right.x,p[16].y-previous.right.y)/dt;
        const speed=Math.max(leftSpeed,rightSpeed);
        const movingWrist=leftSpeed>rightSpeed?p[15]:p[16];
        const hipRise=(previous.hip-hip)/dt;
        if(raised&&!previous.lastRaised){triggers.push({kind:'bats',x:.5,y:.2});cooldown=now+2400;}
        else if(hipRise>.3/sensitivity){triggers.push({kind:'candy',x:(p[23].x+p[24].x)/2,y:hip});cooldown=now+1800;}
        else if(speed>.8/sensitivity){triggers.push({kind:'magic',x:movingWrist.x,y:movingWrist.y});cooldown=now+950;}
      }
      this.history.set(pose.id,{left:{x:p[15].x,y:p[15].y},right:{x:p[16].x,y:p[16].y},hip,time:now,lastRaised:raised,cooldown});
    }
    for(const [id,h] of this.history)if(now-h.time>1500)this.history.delete(id);
    return triggers;
  }
}
