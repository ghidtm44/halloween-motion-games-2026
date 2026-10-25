import type {GameBasket, GameEvent, GameHand, GameItem, GameSnapshot, GameTarget} from './game-types';

type Direction = GameTarget['direction'];
type RoomId = 'start' | 'deadendA' | 'grove' | 'deadendB' | 'harvest' | 'exit';
type Room = {name:string;items:('corn'|'box')[];paths:{direction:Direction;destination:RoomId;label:string}[]};
type Dwell = {target:string;elapsed:number};
const ROOMS:Record<RoomId,Room> = {
  start:{name:'Moonlit Gate',items:['corn','corn'],paths:[{direction:'left',destination:'deadendA',label:'LEFT'},{direction:'right',destination:'grove',label:'RIGHT'}]},
  deadendA:{name:'Whispering Nook',items:['box'],paths:[{direction:'back',destination:'start',label:'BACK TO THE FORK'}]},
  grove:{name:'Firefly Fork',items:['corn','corn'],paths:[{direction:'left',destination:'harvest',label:'LEFT'},{direction:'right',destination:'deadendB',label:'RIGHT'}]},
  deadendB:{name:'Scarecrow Surprise',items:['box'],paths:[{direction:'back',destination:'grove',label:'BACK TO THE FORK'}]},
  harvest:{name:'Harvest Hollow',items:['corn','corn'],paths:[{direction:'left',destination:'exit',label:'GLOWING EXIT'},{direction:'right',destination:'grove',label:'EXPLORE AGAIN'}]},
  exit:{name:'The Moonlight Meadow',items:[],paths:[]},
};
const BASKETS:GameBasket[] = [.2,.5,.8].map(x=>({x,y:.78,radius:.075}));
const GRAB_MS=450, DEPOSIT_MS=250, PATH_MS=700, TRAVEL_MS=2800, GOAL=6;
/** All radii use stage width; this keeps visible circular targets and hitboxes aligned. */
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,(a.y-b.y)*720/1280);

/** Cooperative, local game state. Approximate pose IDs are temporary hand ownership only. */
export class CornMazeGame {
  private room:RoomId='start';
  private phase:GameSnapshot['phase']='collect';
  private collected=0;
  private bonus=0;
  private items=new Map<RoomId,GameItem[]>();
  private previousHands=new Map<string,GameHand>();
  private hands:GameHand[]=[];
  private hover=new Map<string,Dwell>();
  private deposits=new Map<string,Dwell>();
  private blockedPaths=new Map<string,string>();
  private travelElapsed=0;
  private travelDestination:RoomId='start';
  private travelDirection:Direction='right';
  private visited:string[]=[];

  constructor(){this.reset();}

  reset():void {
    this.room='start';this.phase='collect';this.collected=0;this.bonus=0;
    this.items.clear();
    for(const id of Object.keys(ROOMS) as RoomId[]){
      this.items.set(id,ROOMS[id].items.map((kind,index)=>{
        const x=kind==='box'?.5:index===0?.3:.7,y=kind==='box'?.46:index===0?.42:.47;
        return {id:`${id}:${kind}:${index}`,kind,x,y,homeX:x,homeY:y,radius:kind==='corn'?.055:.07,heldBy:null,progress:0,collected:false};
      }));
    }
    this.travelElapsed=0;this.travelDestination='start';this.travelDirection='right';
    this.visited=[ROOMS.start.name];this.releaseHands();
  }

  /** Keep permanent rewards; discard ownership and incomplete gestures at input boundaries. */
  releaseHands():void {
    for(const items of this.items.values())for(const item of items){item.heldBy=null;item.x=item.homeX;item.y=item.homeY;item.progress=0;}
    this.previousHands.clear();this.hands=[];this.hover.clear();this.deposits.clear();this.blockedPaths.clear();
  }

  step(dtMs:number,input:GameHand[],enabled=true):GameEvent[] {
    const events:GameEvent[]=[];
    if(!enabled||this.phase==='won'){this.releaseHands();return events;}
    const dt=Number.isFinite(dtMs)?Math.max(0,Math.min(100,dtMs)):0;
    const next=new Map<string,GameHand>();
    // Deterministic ordering settles simultaneous claims without relying on detector ordering.
    for(const hand of [...input].sort((a,b)=>a.id.localeCompare(b.id))){
      if(next.size>=6)break;
      if(!next.has(hand.id)&&hand.id&&Number.isFinite(hand.x)&&Number.isFinite(hand.y)&&Number.isFinite(hand.confidence)&&hand.confidence>=.55&&hand.x>=0&&hand.x<=1&&hand.y>=0&&hand.y<=1)next.set(hand.id,{...hand});
    }
    const active=new Map<string,GameHand>();
    for(const [id,hand] of next){const prior=this.previousHands.get(id);if(!prior||distance(prior,hand)<=.2)active.set(id,hand);}
    this.previousHands=next;this.hands=[...active.values()];
    const items=this.items.get(this.room)!;
    for(const item of items){
      item.progress=0;
      if(item.heldBy&&!active.has(item.heldBy)){
        events.push({kind:'drop',x:item.x,y:item.y});this.deposits.delete(item.heldBy);item.heldBy=null;item.x=item.homeX;item.y=item.homeY;
      }
    }
    for(const id of this.hover.keys())if(!active.has(id))this.hover.delete(id);
    for(const id of this.deposits.keys())if(!active.has(id))this.deposits.delete(id);
    if(this.phase==='travel'){
      if(active.size)this.travelElapsed+=dt;
      if(this.travelElapsed>=TRAVEL_MS){
        this.room=this.travelDestination;this.releaseHands();
        const name=ROOMS[this.room].name;if(!this.visited.includes(name))this.visited.push(name);
        this.phase=this.room==='exit'?'won':this.items.get(this.room)!.some(item=>!item.collected)?'collect':'choose';
        // A held hand cannot automatically select the same screen-space sign after arrival.
        if(this.phase==='choose')for(const [id,hand] of active){const target=this.targets().find(candidate=>distance(hand,candidate)<=candidate.radius);if(target)this.blockedPaths.set(id,target.id);}
        events.push({kind:'arrive',x:.5,y:.45});
        if(this.phase==='won')events.push({kind:'win',x:.5,y:.35});
      }
      return events;
    }
    for(const [id,targetId] of this.blockedPaths){
      const hand=active.get(id),target=this.targets().find(candidate=>candidate.id===targetId);
      if(!hand||!target||distance(hand,target)>target.radius)this.blockedPaths.delete(id);
    }

    for(const [id,hand] of active){
      const held=items.find(item=>item.heldBy===id&&!item.collected);
      if(held){
        this.hover.delete(id);held.x=hand.x;held.y=hand.y;
        const basketIndex=BASKETS.findIndex(basket=>distance(hand,basket)<=basket.radius);
        if(basketIndex<0){this.deposits.delete(id);continue;}
        const progress=this.advance(this.deposits,id,`basket:${basketIndex}`,dt);
        held.progress=Math.min(1,progress/DEPOSIT_MS);
        if(progress>=DEPOSIT_MS){
          held.collected=true;held.heldBy=null;held.x=held.homeX;held.y=held.homeY;held.progress=0;
          this.collected++;this.deposits.delete(id);events.push({kind:'deposit',x:hand.x,y:hand.y});
        }
        continue;
      }
      this.deposits.delete(id);
      const item=items.filter(candidate=>!candidate.collected&&!candidate.heldBy&&distance(hand,candidate)<=candidate.radius).sort((a,b)=>distance(hand,a)-distance(hand,b)||a.id.localeCompare(b.id))[0];
      if(item){
        const progress=this.advance(this.hover,id,item.id,dt);
        if(progress>=GRAB_MS){
          this.hover.delete(id);
          if(item.kind==='box'){item.collected=true;this.bonus++;events.push({kind:'bonus',x:item.x,y:item.y});}
          else {item.heldBy=id;item.x=hand.x;item.y=hand.y;events.push({kind:'grab',x:item.x,y:item.y});}
        }
        continue;
      }
      const target=this.phase==='choose'?this.targets().find(candidate=>distance(hand,candidate)<=candidate.radius&&this.blockedPaths.get(id)!==candidate.id):undefined;
      if(target){
        const progress=this.advance(this.hover,id,target.id,dt);
        if(progress>=PATH_MS){
          this.travelDestination=target.destination as RoomId;this.travelDirection=target.direction;this.travelElapsed=0;this.phase='travel';
          this.releaseHands();events.push({kind:'travel',x:target.x,y:target.y});break;
        }
      }else this.hover.delete(id);
    }
    for(const item of items)if(!item.heldBy&&!item.collected){
      item.progress=Math.min(1,Math.max(0,...[...this.hover.values()].filter(dwell=>dwell.target===item.id).map(dwell=>dwell.elapsed/GRAB_MS)));
    }
    if(this.phase==='collect'&&items.every(item=>item.collected)){this.phase='choose';this.hover.clear();}
    return events;
  }

  snapshot():GameSnapshot {
    const items=this.items.get(this.room)!;
    return {
      room:this.room,roomName:ROOMS[this.room].name,phase:this.phase,collected:this.collected,goal:GOAL,bonus:this.bonus,
      items:items.map(item=>({...item})),targets:this.phase==='choose'?this.targets():[],baskets:BASKETS.map(basket=>({...basket})),
      hands:this.hands.map(hand=>{
        const holding=items.some(item=>item.heldBy===hand.id),dwell=holding?this.deposits.get(hand.id):this.hover.get(hand.id);
        const limit=holding?DEPOSIT_MS:dwell?.target.startsWith('path:')?PATH_MS:GRAB_MS;
        return {...hand,holding,progress:dwell?Math.min(1,dwell.elapsed/limit):0};
      }),
      travelProgress:Math.min(1,this.travelElapsed/TRAVEL_MS),travelDirection:this.travelDirection,message:this.message(),visited:[...this.visited],
    };
  }

  private advance(map:Map<string,Dwell>,id:string,target:string,dt:number):number {
    const previous=map.get(id),elapsed=(previous?.target===target?previous.elapsed:0)+dt;map.set(id,{target,elapsed});return elapsed;
  }

  private targets():GameTarget[] {
    return ROOMS[this.room].paths.filter(path=>path.destination!=='exit'||this.collected>=GOAL).map(path=>{
      const id=`path:${this.room}:${path.destination}`;
      return {id,x:path.direction==='right'?.78:.22,y:.43,radius:.075,label:path.label,destination:path.destination,direction:path.direction,progress:Math.min(1,Math.max(0,...[...this.hover.values()].filter(dwell=>dwell.target===id).map(dwell=>dwell.elapsed/PATH_MS)))};
    });
  }

  private message():string {
    if(this.phase==='won')return 'You found the way out! All 6 glowing corn cobs collected. Team magic!';
    if(this.phase==='travel')return `Run in place! Follow the ${this.travelDirection==='back'?'trail back':this.travelDirection+' path'}.`;
    if(this.phase==='choose')return this.room==='harvest'?'Six corn cobs! Reach for the glowing exit, or explore again.':this.room.startsWith('deadend')?'A secret surprise! Reach for BACK to return to the fork.':'Choose a path! Reach and hold a hand on a sign.';
    if(this.room.startsWith('deadend'))return 'A mystery box! Reach and hold to open your surprise.';
    return 'Reach and hold a glowing corn cob. Carry it down to any basket. Collect 6 together!';
  }
}
