export type GamePhase = 'collect' | 'choose' | 'travel' | 'won';
export interface GameHand {id:string;x:number;y:number;confidence:number;}
export interface GameItem {id:string;kind:'corn'|'box';x:number;y:number;homeX:number;homeY:number;radius:number;heldBy:string|null;progress:number;collected:boolean;}
export interface GameTarget {id:string;x:number;y:number;radius:number;label:string;destination:string;progress:number;direction:'left'|'right'|'back';}
export interface GameBasket {x:number;y:number;radius:number;}
export interface GameCursor extends GameHand {progress:number;holding:boolean;}
export interface GameSnapshot {room:string;roomName:string;phase:GamePhase;collected:number;goal:number;bonus:number;items:GameItem[];targets:GameTarget[];baskets:GameBasket[];hands:GameCursor[];travelProgress:number;travelDirection:'left'|'right'|'back';message:string;visited:string[];}
export interface GameEvent {kind:'grab'|'drop'|'deposit'|'bonus'|'travel'|'arrive'|'win';x:number;y:number;}
export interface GameStatus {room:string;phase:GamePhase;collected:number;goal:number;bonus:number;practice:boolean;message:string;}
