import {CornMazeGame} from './corn-game';
import type {GameEvent,GameHand,GameSnapshot,GameStatus} from './game-types';
import type {Pose,Settings} from './types';

/** Camera and pointer share the same visible stage and the same game rules. */
export class CornGameController {
  private game=new CornMazeGame();
  private pointer:GameHand|null=null;
  private lastSettings:Settings|null=null;
  private lastUpdate=0;
  private cue='Start camera, or turn on Mouse practice in the control room.';
  private practice=false;
  private lastCapture=0;
  constructor(canvas:HTMLCanvasElement,private onEvent:(event:GameEvent)=>void){
    canvas.addEventListener('pointermove',event=>{
      const rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/1280,rect.height/720);
      const x=(event.clientX-rect.left-(rect.width-1280*scale)/2)/(1280*scale);
      const y=(event.clientY-rect.top-(rect.height-720*scale)/2)/(720*scale);
      this.pointer=x>=0&&x<=1&&y>=0&&y<=1?{id:'practice',x,y,confidence:1}:null;
    });
    canvas.addEventListener('pointerleave',()=>{this.pointer=null;});
    // The operator can focus admin while camera players keep carrying their corn.
    window.addEventListener('blur',()=>{this.pointer=null;if(this.practice)this.game.releaseHands();});
  }
  release(){this.pointer=null;this.lastCapture=0;this.game.releaseHands();}
  update(dt:number,settings:Settings,poses:Pose[],captureAt:number,now:number,active:boolean){
    const prev=this.lastSettings;
    if(prev&&settings.gameRound!==prev.gameRound)this.game.reset();
    if(prev&&(settings.scene!==prev.scene||settings.paused!==prev.paused||settings.deviceId!==prev.deviceId||settings.mirror!==prev.mirror||settings.cameraOn!==prev.cameraOn||settings.gamePractice!==prev.gamePractice))this.release();
    if(this.lastUpdate&&now-this.lastUpdate>250)this.release();
    this.lastUpdate=now;this.lastSettings={...settings};this.practice=settings.gamePractice&&!settings.cameraOn;
    let hands:GameHand[]=[];
    if(this.practice){if(this.pointer)hands=[this.pointer];}
    else if(settings.cameraOn&&captureAt>0&&now-captureAt<300){
      for(const pose of poses.slice(0,3))for(const index of [15,16]){
        const point=pose.landmarks[index];
        if(point)hands.push({id:`${pose.id}:${index}`,x:point.x,y:point.y,confidence:point.visibility??0});
      }
    }
    const enabled=active&&settings.scene==='cornmaze'&&!settings.paused&&hands.some(h=>h.confidence>=.55&&h.x>=0&&h.x<=1&&h.y>=0&&h.y<=1);
    if(!active)this.cue='Local connection paused. The game will wait.';
    else if(settings.paused)this.cue='Paused · Resume in the control room';
    else if(this.practice&&!hands.length)this.cue='Mouse practice · Move your pointer onto the playground';
    else if(!this.practice&&!settings.cameraOn)this.cue='Start camera, or turn on Mouse practice in the control room.';
    else if(!enabled)this.cue='Show your hands in the camera · The maze will wait for you';
    else this.cue='';
    // Camera dwell advances only on fresh inference samples, never repeated render frames.
    let gameDt=dt;
    if(!this.practice){gameDt=captureAt!==this.lastCapture&&this.lastCapture>0?Math.max(0,Math.min(100,captureAt-this.lastCapture)):0;this.lastCapture=captureAt;}
    for(const event of this.game.step(gameDt,hands,enabled))this.onEvent(event);
  }
  snapshot():GameSnapshot{const view=this.game.snapshot();if(this.cue&&view.phase!=='won')view.message=this.cue;return view;}
  status():GameStatus{const view=this.snapshot();return {room:view.roomName,phase:view.phase,collected:view.collected,goal:view.goal,bonus:view.bonus,practice:this.practice,message:view.message};}
}
