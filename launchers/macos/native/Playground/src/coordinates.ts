import type {Pose} from './types';
export function cameraFit(width:number,height:number){const scale=Math.min(1280/width,720/height),w=width*scale,h=height*scale;return {w,h,x:(1280-w)/2,y:(720-h)/2};}
export function mapPoseToStage(pose:Pose,width:number,height:number,mirror:boolean):Pose{const f=cameraFit(width,height);return {...pose,landmarks:pose.landmarks.map(p=>({...p,x:(f.x+(mirror?1-p.x:p.x)*f.w)/1280,y:(f.y+p.y*f.h)/720}))};}
