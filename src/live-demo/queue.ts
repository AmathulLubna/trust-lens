export interface WindowMeta { sequence:number; mediaStartMs:number; durationMs:number; firstSampleAt:number }
export interface RemoteWindow extends WindowMeta { samples?:Float32Array; sampleRate?:number; reason?:string }
// One active + two pending PCM windows. Overflow retains only a compact ordered
// gap (adjacent gaps coalesce); no hidden unlimited audio backlog.
export class RemoteQueue {
  private pending:RemoteWindow[]=[];
  private active=false;
  private closed=false;
  private abort:AbortController|null=null;
  private current:RemoteWindow|null=null;
  private process:(item:RemoteWindow, signal:AbortSignal)=>Promise<void>;
  private failed:(item:RemoteWindow,error:unknown)=>void;
  readonly capacity:number;
  constructor(process:(item:RemoteWindow, signal:AbortSignal)=>Promise<void>, failed:(item:RemoteWindow,error:unknown)=>void, capacity=2) {this.process=process;this.failed=failed;this.capacity=capacity;}
  push(item:RemoteWindow) {
    if(this.closed)return;
    if(this.pending.filter(i=>i.samples).length>=this.capacity)item={...item,samples:undefined,sampleRate:undefined,reason:'queue_full'};
    const last=this.pending[this.pending.length-1];
    if(!item.samples&&!last?.samples&&last&&last.reason===item.reason&&Math.abs(last.mediaStartMs+last.durationMs-item.mediaStartMs)<20) {
      // Use the first sequence: the backend also detects skipped sequence ids.
      last.durationMs+=item.durationMs;
    } else if(this.pending.length<8)this.pending.push(item);
    else {
      // At most 8 compact entries. Collapse the pending tail into explicit loss.
      const tail=this.pending.pop()!;
      this.pending.push({...tail,samples:undefined,reason:'queue_full',durationMs:item.mediaStartMs+item.durationMs-tail.mediaStartMs});
    }
    void this.drain();
  }
  private async drain() {
    if(this.active||this.closed)return;
    this.active=true;
    while(this.pending.length&&!this.closed){
      const item=this.pending.shift()!;this.current=item;this.abort=new AbortController();
      const timer=setTimeout(()=>this.abort?.abort(),65000);
      try{await this.process(item,this.abort.signal);}catch(error){this.current=null;if(!this.closed)this.failed(item,error);}
      finally{clearTimeout(timer);this.current=null;}
    }
    this.abort=null;this.active=false;
  }
  cancel(){if(this.closed)return [];this.closed=true;const lost=[...(this.current?[this.current]:[]),...this.pending];this.pending=[];this.abort?.abort();return lost;}
  get pendingAudio(){return this.pending.filter(i=>i.samples).length;}
}
