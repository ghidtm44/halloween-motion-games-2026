import {DEFAULT_SETTINGS, type ServerState, type EffectEvent, type Settings, type PlayerStatus, type HostMessage} from './types';
export class SyncClient {
  private socket:WebSocket|null=null;
  private stopped=false;
  private retry=300;
  private timer=0;
  state:ServerState={revision:0,settings:{...DEFAULT_SETTINGS},playerConnected:false,status:null};
  connected=false;
  active=false;
  onState:(state:ServerState)=>void=()=>{};
  onStatus:(status:PlayerStatus)=>void=()=>{};
  onEffect:(event:EffectEvent)=>void=()=>{};
  onConnection:(connected:boolean)=>void=()=>{};
  onRole:(active:boolean)=>void=()=>{};
  onError:(message:string)=>void=()=>{};
  onHost:(message:HostMessage)=>void=()=>{};
  constructor(private role:'admin'|'player'){}
  connect(){
    if(this.stopped)return;
    const socket=this.socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/sync`);
    socket.onopen=()=>{this.retry=300;this.connected=true;this.onConnection(true);this.send({type:'hello',role:this.role,clientId:crypto.randomUUID()});};
    socket.onmessage=({data})=>{try{
      const message=JSON.parse(data);
      if(message.type==='state'){this.state=message.state;this.onState(this.state);}
      if(message.type==='status'){this.state.status=message.status;this.onStatus(message.status);}
      if(message.type==='effect')this.onEffect(message.event);
      if(message.type==='role'){this.active=message.active;this.onRole(message.active);}
      if(message.type==='error')this.onError(String(message.message));
      if(['host-cue','host-result','host-rejected'].includes(message.type))this.onHost(message);
    }catch(error){console.warn('Local sync message could not be read',error);}};
    socket.onclose=()=>{this.connected=false;this.active=false;this.onConnection(false);this.onRole(false);if(!this.stopped)this.timer=window.setTimeout(()=>this.connect(),this.retry=Math.min(this.retry*1.6,5000));};
    socket.onerror=()=>socket.close();
  }
  send(message:unknown){if(this.socket?.readyState===WebSocket.OPEN){this.socket.send(JSON.stringify(message));return true;}return false;}
  patch(patch:Partial<Settings>){return this.send({type:'patch',patch});}
  effect(kind:EffectEvent['kind']){return this.send({type:'effect',kind});}
  status(status:PlayerStatus){if(this.active)this.send({type:'status',status});}
  close(){this.stopped=true;clearTimeout(this.timer);this.socket?.close();}
}
