// Receives only the RTCPeerConnection's incoming track. Media clock, not wall time.
class RemoteCapture extends AudioWorkletProcessor {
  constructor() {
    super();this.size=Math.round(sampleRate*4);this.buffer=new Float32Array(this.size);
    this.used=0;this.start=null;this.origin=null;this.previous=null;this.inFlight=false;this.stopped=false;
    this.port.onmessage=({data})=>{if(data.type==='ack')this.inFlight=false;if(data.type==='stop')this.stopped=true;};
  }
  process(inputs) {
    if(this.stopped)return false;
    const channels=inputs[0];
    if(!channels?.length)return true;
    const length=channels[0].length;
    if(this.origin===null){this.origin=currentFrame;this.port.postMessage({type:'started',originContextSec:currentFrame/sampleRate});}
    if(this.previous!==null&&currentFrame>this.previous+length*2){
      if(this.used){this.port.postMessage({type:'gap',mediaStartMs:(this.start-this.origin)/sampleRate*1000,durationMs:this.used/sampleRate*1000,reason:'render_gap'});this.used=0;}
      this.port.postMessage({type:'gap',mediaStartMs:(this.previous-this.origin)/sampleRate*1000,durationMs:(currentFrame-this.previous)/sampleRate*1000,reason:'render_gap'});
    }
    this.previous=currentFrame+length;
    for(let i=0;i<length;i++) {
      if(!this.used)this.start=currentFrame+i;
      let value=0;for(const channel of channels)value+=channel[i]||0;
      this.buffer[this.used++]=value/channels.length;
      if(this.used===this.size){
        const meta={mediaStartMs:(this.start-this.origin)/sampleRate*1000,durationMs:this.size/sampleRate*1000,
          contextStartSec:this.start/sampleRate,sampleRate};
        if(this.inFlight)this.port.postMessage({type:'gap',...meta,reason:'queue_full'});
        else {this.inFlight=true;const samples=this.buffer;this.port.postMessage({type:'pcm',...meta,samples},[samples.buffer]);this.buffer=new Float32Array(this.size);}
        this.used=0;
      }
    }
    return true;
  }
}
registerProcessor('trustlens-remote-capture',RemoteCapture);
