export type SceneId = 'jungle' | 'depths' | 'space' | 'spooky';
export type EffectKind = 'candy' | 'bats' | 'magic';
export type CompositeMode = 'cutout' | 'camera' | 'silhouette';
export interface Settings { scene: SceneId; deviceId: string; cameraOn: boolean; demo: boolean; mirror: boolean; motion: boolean; mode: CompositeMode; quality: 'balanced' | 'performance'; sensitivity: number; playDensity:number; musicVolume:number; musicMuted:boolean; paused: boolean; hostAdultMode:boolean; hostEffects:number; hostEffectsBypass:boolean; hostVolume:number; hostMuted:boolean; hostCaptions:boolean; hostControlMode:'operator'|'auto'; hostTone:number; }
export const DEFAULT_SETTINGS: Settings = {scene:'jungle',deviceId:'',cameraOn:false,demo:true,mirror:true,motion:true,mode:'cutout',quality:'balanced',sensitivity:1,playDensity:.5,musicVolume:.3,musicMuted:false,paused:false,hostAdultMode:false,hostEffects:.4,hostEffectsBypass:false,hostVolume:.8,hostMuted:false,hostCaptions:true,hostControlMode:'auto',hostTone:0};
export interface Landmark {x:number;y:number;z?:number;visibility?:number;}
export interface Pose {id:number; landmarks:Landmark[];}
export interface VisionFrame { image?: ImageBitmap; poses: Pose[]; mask: ImageData | null; inferenceMs:number; timestamp:number; }
export interface EffectEvent {id:string;kind:EffectKind;x?:number;y?:number;at:number;}
export interface PlayerStatus {camera:string;model:string;people:number;fps:number;inferenceMs:number;fullscreen:boolean;fallback:string;devices:{deviceId:string;label:string}[];error:string;preview?:string;scene?:SceneId;hostCaption?:string;hostNotice?:string;hostVoiceEnabled?:boolean;musicReady?:boolean;}
export interface HostState {adultMode?:boolean;quiet?:boolean;wrapped?:boolean;continuation?:boolean;controlMode:'operator'|'auto';active:boolean;provider:'mock'|'openai';configured:boolean;phase:'off'|'ready'|'thinking'|'error';message:string;sessionId:string;requestCount:number;limit:number;tone:number;}
export interface HostResult {silentReason?:string;effectiveMode?:'adult'|'family';timings?:{visionMs:number;moderationMs:number;speechMs:number};latencyMs?:number;frameCount?:number;performance?:string;challenge?:{id:string;kind:'wave'|'pose'};type:'host-result';sessionId:string;requestId:string;cueId?:string;text:string;silent?:boolean;stale?:boolean;audio?:{base64:string;mime:string};}
export type HostMessage = HostResult | {type:'host-rejected';sessionId:string;requestId:string;cueId?:string;message:string} | {type:'host-cue';sessionId:string;cueId:string;delayMs?:number};
export interface ServerState {motionOnly?:boolean;revision:number;settings:Settings;playerConnected:boolean;status:PlayerStatus|null;host?:HostState;}
