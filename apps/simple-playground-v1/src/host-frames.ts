export interface HostFrame {image:string;ageMs:number;}

/** A bounded, volatile action window. Never capture until an AI session is explicitly active. */
export class HostFrames {
  private frames:{image:string;at:number}[]=[];
  clear(){this.frames=[];}
  sample(at:number,capture:()=>string|undefined,force=false){
    const last=this.frames.at(-1);
    if(last&&(at<=last.at||(!force&&at-last.at<600)))return;
    const image=capture();if(!image||image.length>130000)return;
    if(force&&last&&at-last.at<300)this.frames.pop();
    this.frames.push({image,at});this.frames=this.frames.filter(f=>at-f.at<=1800).slice(-3);
  }
  read(now:number):HostFrame[]|undefined{
    this.frames=this.frames.filter(f=>now-f.at>=0&&now-f.at<=1800);
    if(!this.frames.length||now-this.frames.at(-1)!.at>700)return;
    return this.frames.map(f=>({image:f.image,ageMs:Math.round(now-f.at)}));
  }
}
