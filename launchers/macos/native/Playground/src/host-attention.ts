import type { Pose } from './types';

export interface HostAttentionState {
  gaze: { x: number; y: number };
  people: number;
  arrival: boolean;
}

/** Tiny in-memory color differences, evaluated locally. No recognition or retained frames. */
export class HostSceneChanges {
  private baseline: Uint8ClampedArray | null = null;
  private candidateAt: number | null = null;
  private last = -Infinity;
  reset(){this.baseline=null;this.candidateAt=null;this.last=-Infinity;}
  sample(pixels:Uint8ClampedArray,now:number):boolean{
    if(!this.baseline||this.baseline.length!==pixels.length){this.baseline=new Uint8ClampedArray(pixels);return false;}
    // Subtract the median lighting shift so auto-exposure does not greet the sun.
    const shifts=[0,1,2].map(channel=>{
      const values=[];for(let i=channel;i<pixels.length;i+=4)values.push(pixels[i]-this.baseline![i]);
      values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)]??0;
    });
    let changed=0;
    for(let i=0;i<pixels.length;i+=4){
      const difference=(Math.abs(pixels[i]-this.baseline[i]-shifts[0])+Math.abs(pixels[i+1]-this.baseline[i+1]-shifts[1])+Math.abs(pixels[i+2]-this.baseline[i+2]-shifts[2]))/3;
      if(difference>28)changed++;
    }
    if(changed< pixels.length/4*.12){this.candidateAt=null;return false;}
    this.candidateAt??=now;
    if(now-this.candidateAt<500||now-this.last<4000)return false;
    this.baseline=new Uint8ClampedArray(pixels);this.candidateAt=null;this.last=now;return true;
  }
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const CENTER = { x: .5, y: .45 };

/** Local, anonymous group attention. No identity, age, face or emotion inference. */
export class HostAttention {
  private gaze = { ...CENTER };
  private target = { ...CENTER };
  private previous: number | null = null;
  private presentSince: number | null = null;
  private absentSince: number | null = null;
  private lastArrival = -Infinity;
  private armed = true;
  private targetSince = -Infinity;
  private guestIndex = 0;

  reset(): void {
    this.gaze = { ...CENTER };
    this.target = { ...CENTER };
    this.previous = this.presentSince = this.absentSince = null;
    this.lastArrival = this.targetSince = -Infinity;
    this.armed = true; this.guestIndex = 0;
  }

  update(poses: Pose[], now: number): HostAttentionState {
    if (!Number.isFinite(now)) return { gaze: { ...this.gaze }, people: 0, arrival: false };
    if (this.previous !== null && (now < this.previous || now - this.previous > 1500)) {
      // A suspended frame loop cannot establish continuous presence.
      this.presentSince = null;
      this.absentSince = null;
    }
    const dt = this.previous === null ? 16 : clamp(now - this.previous, 0, 250);
    this.previous = now;
    const guests = poses.slice(0, 3).flatMap(pose => {
      const left = pose.landmarks[11], right = pose.landmarks[12], nose = pose.landmarks[0];
      const usable = (p: typeof left) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
        && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
        && Number.isFinite(p.visibility) && (p.visibility ?? 0) >= .6;
      if (!usable(left) || !usable(right)) return [];
      const x = (left.x + right.x) / 2;
      const y = usable(nose) ? nose.y : (left.y + right.y) / 2 - .1;
      return [{ x, y: clamp(y, .1, .8), weight: clamp(Math.hypot(left.x - right.x, left.y - right.y), .06, .3) }];
    });
    const people = guests.length;
    let arrival = false;
    if (people) {
      // A brief lost inference frame neither rearms a greeting nor moves the eyes.
      if (this.absentSince !== null && now - this.absentSince > 300) this.presentSince = null;
      this.absentSince = null;
      this.presentSince ??= now;
      if (this.armed && now - this.presentSince >= 1000 && now - this.lastArrival >= 12000) {
        arrival = true;
        this.armed = false;
        this.lastArrival = now;
      }
      // Give each position a deliberate turn. This is spatial attention, never identity tracking.
      if (now - this.targetSince >= 1800) {
        const ordered = [...guests].sort((a,b) => a.x-b.x);
        const guest = ordered[this.guestIndex++ % ordered.length];
        this.target = { x: clamp(guest.x, .1, .9), y: clamp(guest.y, .15, .75) };
        this.targetSince = now;
      }
    } else {
      this.absentSince ??= now;
      if (now - this.absentSince > 300) this.target = { ...CENTER };
      if (now - this.absentSince >= 3500) {
        this.presentSince = null;
        this.armed = true; this.guestIndex = 0;
        this.targetSince = -Infinity;
      }
    }
    const blend = 1 - Math.exp(-dt / 300);
    this.gaze.x += (this.target.x - this.gaze.x) * blend;
    this.gaze.y += (this.target.y - this.gaze.y) * blend;
    return { gaze: { ...this.gaze }, people, arrival };
  }
}
