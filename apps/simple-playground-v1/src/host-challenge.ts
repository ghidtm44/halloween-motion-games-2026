import type {Pose} from './types';

/** Conservative geometry only. No identity, emotion, age, or audio inference. */
export function challengeGestures(poses:Pose[]):{wave:boolean;pose:boolean}|null{
  if(!poses.length||poses.length>3)return null;
  let wave=false,pose=false;
  for(const person of poses){
    const points=[0,11,12,15,16].map(i=>person.landmarks[i]);
    if(points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1||(p.visibility??0)<.75))return null;
    const [nose,leftShoulder,rightShoulder,leftWrist,rightWrist]=points;
    wave ||= leftWrist.y<leftShoulder.y-.07||rightWrist.y<rightShoulder.y-.07;
    pose ||= leftWrist.y<nose.y-.04&&rightWrist.y<nose.y-.04;
  }
  return {wave,pose};
}
