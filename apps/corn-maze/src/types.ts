import type {GameStatus} from './game-types';
export type SceneId = 'pumpkin' | 'enchanted' | 'midnight' | 'cornmaze';
export type EffectKind = 'candy' | 'bats' | 'magic';
export type CompositeMode = 'cutout' | 'camera' | 'silhouette';
export interface Settings { scene: SceneId; deviceId: string; cameraOn: boolean; demo: boolean; mirror: boolean; motion: boolean; mode: CompositeMode; quality: 'balanced' | 'performance'; sensitivity: number; paused: boolean; gameRound:number; gamePractice:boolean; }
export const DEFAULT_SETTINGS: Settings = {scene:'pumpkin',deviceId:'',cameraOn:false,demo:true,mirror:true,motion:true,mode:'cutout',quality:'balanced',sensitivity:1,paused:false,gameRound:0,gamePractice:false};
export interface Landmark {x:number;y:number;z?:number;visibility?:number;}
export interface Pose {id:number; landmarks:Landmark[];}
export interface VisionFrame { image?: ImageBitmap; poses: Pose[]; mask: ImageData | null; inferenceMs:number; timestamp:number; }
export interface EffectEvent {id:string;kind:EffectKind;x?:number;y?:number;at:number;}
export interface PlayerStatus {camera:string;model:string;people:number;fps:number;inferenceMs:number;fullscreen:boolean;fallback:string;devices:{deviceId:string;label:string}[];error:string;preview?:string;game?:GameStatus;}
export interface ServerState {revision:number;settings:Settings;playerConnected:boolean;status:PlayerStatus|null;}
