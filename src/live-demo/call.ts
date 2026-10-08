import { pcmWav } from '../lib/audio-upload';
import { RemoteQueue, type RemoteWindow } from './queue';
import { resultSchema,liveStateSchema,safeEndpoint,iceConfigurationSchema,languageSchema,type DemoLanguage,type LiveState,type Measurement } from './contract';
type CallRole='caller'|'recipient';
interface Events {state:(state:LiveState)=>void;measurement:(measurement:Measurement)=>void;message:(message:string)=>void;tracks:(local:string[],remote:string[])=>void;ended:()=>void}
export class ControlledCall {
  private endpoint:string;
  private ws:WebSocket|null=null;
  private pc:RTCPeerConnection|null=null;
  private context:AudioContext|null=null;
  private local:MediaStream|null=null;
  private worklet:AudioWorkletNode|null=null;
  private queue:RemoteQueue|null=null;
  private ping:ReturnType<typeof setInterval>|null=null;
  private source:AudioBufferSourceNode|null=null;
  private stopped=false;
  private sequence=0;
  private ice:RTCIceCandidateInit[]=[];
  private remoteIds:string[]=[];
  private remoteAudio:HTMLAudioElement|null=null;
  private originContextSec:number|null=null;
  private lastMediaEnd=0;
  private token:string;
  readonly sessionId:string;
  private role:CallRole;
  private events:Events;
  private language:DemoLanguage;
  private onPageHide=()=>{void this.end();};
  constructor(endpoint:string,token:string,sessionId:string,role:CallRole,events:Events,language:DemoLanguage='auto'){this.endpoint=safeEndpoint(endpoint);this.token=token;this.sessionId=sessionId;this.role=role;this.events=events;this.language=languageSchema.parse(language);}
  private async request(path:string,init:RequestInit={},signal?:AbortSignal){
    const response=await fetch(this.endpoint+path,{...init,headers:{Authorization:`Bearer ${this.token}`,...init.headers},signal:signal??AbortSignal.timeout(65000)});
    if(!response.ok)throw new Error(`Request failed (${response.status}); evidence unavailable`);
    return response.json();
  }
  async start(file:File|null,audioElement:HTMLAudioElement){
    if(!isSecureContext)throw new Error('A secure browser context is required');
    const iceConfiguration=iceConfigurationSchema.parse(await this.request(`/demo/sessions/${this.sessionId}/ice`));
    if(this.stopped)return;
    this.context=new AudioContext();await this.context.resume();
    if(file){
      if(file.size>18*1024*1024)throw new Error('Use a consented file smaller than 18 MiB');
      const buffer=await this.context.decodeAudioData(await file.arrayBuffer());
      if(buffer.duration>300)throw new Error('Demo audio must be at most five minutes');
      const destination=this.context.createMediaStreamDestination();this.source=this.context.createBufferSource();this.source.buffer=buffer;this.source.loop=true;this.source.connect(destination);this.source.start();this.local=destination.stream;
    } else this.local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    if(this.stopped){this.stop();return;}
    this.remoteAudio=audioElement;
    this.pc=new RTCPeerConnection({iceServers:iceConfiguration.iceServers,iceTransportPolicy:iceConfiguration.iceTransportPolicy});
    window.addEventListener('pagehide',this.onPageHide);
    this.context.onstatechange=()=>{if(!this.stopped&&this.context?.state==='suspended'){this.events.message('Audio capture paused. Call ended because coverage is interrupted.');void this.end();}};
    for(const track of this.local.getAudioTracks())this.pc.addTrack(track,this.local);
    this.events.tracks(this.local.getAudioTracks().map(t=>t.id),[]);
    this.pc.onicecandidate=event=>{if(event.candidate)this.send('ice',event.candidate.toJSON());};
    this.pc.onconnectionstatechange=()=>{
      const status=this.pc?.connectionState;this.events.message(`Peer connection: ${status}`);
      if(status==='failed'||status==='disconnected'||status==='closed')void this.end();
    };
    this.pc.ontrack=event=>{
      if(event.track.kind!=='audio'||this.remoteIds.length)return;
      this.remoteIds=[event.track.id];this.events.tracks(this.local!.getAudioTracks().map(t=>t.id),this.remoteIds);
      const remote=new MediaStream([event.track]);audioElement.srcObject=remote;void audioElement.play().catch(()=>this.events.message('Press the audio play button to hear the remote caller'));
      event.track.onended=()=>void this.end();
      // Crucial boundary: analysis subscribes to incoming RTCPeerConnection audio,
      // never the local microphone stream used for sending.
      if(this.role==='recipient')void this.captureRemote(remote).catch(error=>{this.events.message(String(error));void this.end();});
    };
    this.ws=new WebSocket(this.endpoint.replace(/^http/,'ws')+`/demo/sessions/${this.sessionId}/signal`);
    this.ws.onopen=()=>{this.ws!.send(JSON.stringify({type:'authenticate',token:this.token}));this.ping=setInterval(()=>this.ws?.readyState===WebSocket.OPEN&&this.ws.send(JSON.stringify({type:'ping'})),20000);};
    this.ws.onmessage=event=>void this.signal(JSON.parse(event.data)).catch(error=>{this.events.message(String(error));void this.end();});
    this.ws.onerror=()=>this.events.message('Signaling failure; create a new session');
    this.ws.onclose=()=>{if(!this.stopped){this.events.message('Call ended or signaling disconnected. Coverage is incomplete.');this.stop();this.events.ended();}};
  }
  private send(type:string,payload:unknown){if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type,payload}));else throw new Error('Signaling unavailable');}
  private async signal(message:{type:string;payload?:RTCSessionDescriptionInit&RTCIceCandidateInit;state?:unknown}){
    if(this.stopped||!this.pc)return;
    if(message.state)this.events.state(liveStateSchema.parse(message.state));
    if(message.type==='ended'){this.stop();this.events.ended();return;}
    if(message.type==='paired'&&this.role==='caller'){const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);this.send('offer',offer);}
    if(message.type==='offer') {await this.pc.setRemoteDescription(message.payload!);for(const candidate of this.ice)await this.pc.addIceCandidate(candidate);this.ice=[];const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);this.send('answer',answer);}
    if(message.type==='answer'){await this.pc.setRemoteDescription(message.payload!);for(const candidate of this.ice)await this.pc.addIceCandidate(candidate);this.ice=[];}
    if(message.type==='ice'){if(this.pc.remoteDescription)await this.pc.addIceCandidate(message.payload!);else if(this.ice.length<64)this.ice.push(message.payload!);else throw new Error('Too many pending ICE candidates');}
  }
  private async captureRemote(remote:MediaStream){
    const context=this.context!;await context.audioWorklet.addModule('/remote-capture.worklet.js');
    if(this.stopped)return;
    const source=context.createMediaStreamSource(remote);this.worklet=new AudioWorkletNode(context,'trustlens-remote-capture');
    const mute=context.createGain();mute.gain.value=0;source.connect(this.worklet).connect(mute).connect(context.destination);
    this.queue=new RemoteQueue(async(item,signal)=>{
      const sent=performance.now();let response:unknown;
      try {
        if(item.samples){const data=new FormData();data.set('audio',pcmWav(item.samples,item.sampleRate!),`remote-${item.sequence}.wav`);
          for(const [key,value] of Object.entries({sequence:item.sequence,mediaStartMs:item.mediaStartMs,durationMs:item.durationMs,language:this.language}))data.set(key,String(value));
          response=await this.request(`/demo/sessions/${this.sessionId}/segments`,{method:'POST',body:data},signal);
        }else response=await this.request(`/demo/sessions/${this.sessionId}/gaps`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sequence:item.sequence,mediaStartMs:item.mediaStartMs,durationMs:item.durationMs,reason:item.reason??'render_gap'})},signal);
      } catch(error){
        // Server may have accepted a failed window. Read its ordered ledger;
        // after a network failure, explicitly close the call rather than imply coverage.
        if(signal.aborted)throw error;
        const ledger=await this.request(`/demo/sessions/${this.sessionId}`,{},AbortSignal.timeout(5000));
        const segment=ledger.segments.find((s:{sequence:number})=>s.sequence===item.sequence);
        if(segment)response={segment,state:ledger.state};
        else {response=await this.request(`/demo/sessions/${this.sessionId}/gaps`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sequence:item.sequence,mediaStartMs:item.mediaStartMs,durationMs:item.durationMs,reason:'network_failure'})},AbortSignal.timeout(5000));}
      }
      if(this.stopped)return;
      const result=resultSchema.parse(response);this.events.state(result.state);
      this.events.measurement({sequence:item.sequence,mediaStartMs:item.mediaStartMs,durationMs:item.durationMs,status:result.segment.status,reason:result.segment.reason,
        acousticStatus:result.segment.result?.acoustic.status,rawScore:result.segment.result?.acoustic.score,qualityStatus:result.segment.result?.reliability.status,contextStatus:result.segment.result?.contextStatus,
        receiverLatencyMs:performance.now()-item.firstSampleAt,queueMs:Math.max(0,sent-item.firstSampleAt-item.durationMs),serverWallMs:result.segment.serverWallMs,timingsMs:result.segment.result?.timingsMs});
    },(item,error)=>{this.events.measurement({sequence:item.sequence,mediaStartMs:item.mediaStartMs,durationMs:item.durationMs,status:'gap',reason:'network_or_contract_failure',receiverLatencyMs:performance.now()-item.firstSampleAt,queueMs:0});this.events.message(String(error));void this.end();});
    this.worklet.port.onmessage=({data})=>{
      if(this.stopped)return;
      if(data.type==='started'){this.originContextSec=data.originContextSec;return;}
      this.lastMediaEnd=Math.max(this.lastMediaEnd,data.mediaStartMs+data.durationMs);
      const item:RemoteWindow={sequence:this.sequence++,mediaStartMs:data.mediaStartMs,durationMs:data.durationMs,
        firstSampleAt:performance.now()-(context.currentTime-(data.contextStartSec??context.currentTime))*1000,
        samples:data.type==='pcm'?data.samples:undefined,sampleRate:data.sampleRate,reason:data.reason};
      this.queue!.push(item);if(data.type==='pcm')this.worklet?.port.postMessage({type:'ack'});
    };
  }
  muteOutgoing(muted:boolean){for(const track of this.local?.getAudioTracks()??[])track.enabled=!muted;}
  async end(){if(this.stopped)return;this.stop();try{await this.request(`/demo/sessions/${this.sessionId}`,{method:'DELETE'},AbortSignal.timeout(5000));}catch{/* TTL and peer disconnection also close the session */}this.events.ended();}
  stop(){
    const alreadyStopped=this.stopped;this.stopped=true;
    if(!alreadyStopped){
      for(const item of this.queue?.cancel()??[])this.events.measurement({sequence:item.sequence,mediaStartMs:item.mediaStartMs,durationMs:item.durationMs,status:'gap',reason:'capture_stopped',receiverLatencyMs:performance.now()-item.firstSampleAt,queueMs:0});
      if(this.originContextSec!==null&&this.context){
        const end=(this.context.currentTime-this.originContextSec)*1000;
        if(end>this.lastMediaEnd+1)this.events.measurement({sequence:this.sequence++,mediaStartMs:this.lastMediaEnd,durationMs:end-this.lastMediaEnd,status:'gap',reason:'capture_stopped',receiverLatencyMs:end-this.lastMediaEnd,queueMs:0});
      }
    }
    window.removeEventListener('pagehide',this.onPageHide);
    this.worklet?.port.postMessage({type:'stop'});this.worklet?.disconnect();
    if(this.source){try{this.source.stop();}catch{/* already ended */}this.source=null;}
    for(const track of this.local?.getTracks()??[])track.stop();this.ws?.close();this.pc?.close();if(this.context&&this.context.state!=='closed')void this.context.close().catch(()=>{});if(this.ping)clearInterval(this.ping);
    if(this.remoteAudio){this.remoteAudio.pause();this.remoteAudio.srcObject=null;}}
}
