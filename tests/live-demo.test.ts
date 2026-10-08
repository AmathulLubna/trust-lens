import {describe,it,expect,vi} from 'vitest';
import {RemoteQueue,type RemoteWindow} from '../src/live-demo/queue';
import {assertWebsiteService,safeEndpoint,liveStateSchema,latencySummary,iceConfigurationSchema,languageSchema} from '../src/live-demo/contract';
const window=(sequence:number):RemoteWindow=>({sequence,mediaStartMs:sequence*4000,durationMs:4000,firstSampleAt:0,samples:new Float32Array(10),sampleRate:16000});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
describe('controlled remote-audio contract',()=>{
  it('accepts configured authenticated relays and rejects incomplete transport settings',()=>{
    expect(iceConfigurationSchema.safeParse({iceServers:[],iceTransportPolicy:'all',turnConfigured:false,expiresAt:null}).success).toBe(true);
    const relay={iceServers:[{urls:['turns:relay.example.org:5349?transport=tcp'],username:'time:random',credential:'temporary'}],iceTransportPolicy:'relay',turnConfigured:true,expiresAt:2000};
    expect(iceConfigurationSchema.safeParse(relay).success).toBe(true);
    expect(iceConfigurationSchema.safeParse({...relay,iceServers:[{urls:'turn:relay.example.org'}]}).success).toBe(false);
    expect(iceConfigurationSchema.safeParse({...relay,iceServers:[]}).success).toBe(false);
    expect(iceConfigurationSchema.safeParse({...relay,iceServers:[{urls:'https://bad.example.org'}]}).success).toBe(false);
  });
  it('supports automatic, Hindi and English transcription without silently accepting unsupported languages',()=>{
    for(const language of ['auto','hi','en'])expect(languageSchema.parse(language)).toBe(language);
    expect(languageSchema.safeParse('xx').success).toBe(false);
  });
  it('bounds PCM and retains ordered explicit gaps',async()=>{
    let release:()=>void=()=>{};const gate=new Promise<void>(r=>release=r);const seen:RemoteWindow[]=[];
    const queue=new RemoteQueue(async item=>{seen.push(item);if(item.sequence===0)await gate;},()=>{});
    for(let sequence=0;sequence<20;sequence++)queue.push(window(sequence));
    expect(queue.pendingAudio).toBe(2);release();await tick();await tick();
    expect(seen.slice(0,3).map(s=>s.sequence)).toEqual([0,1,2]);
    expect(seen[3].reason).toBe('queue_full');expect(seen[3].durationMs).toBe(17*4000);expect(seen[3].samples).toBeUndefined();
  });
  it('cancels active fetch and never processes queued audio after stopping',async()=>{
    const seen:number[]=[];let aborted=false;
    const queue=new RemoteQueue(async(item,signal)=>{seen.push(item.sequence);await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();}));},()=>{});
    queue.push(window(0));queue.push(window(1));const lost=queue.cancel();await tick();expect(aborted).toBe(true);expect(seen).toEqual([0]);expect(lost.map(r=>r.sequence)).toEqual([0,1]);
  });
  it('rejects insecure remote origins and URL credentials',()=>{
    expect(safeEndpoint('http://127.0.0.1:8766')).toBe('http://127.0.0.1:8766');
    for(const origin of ['http://example.com','https://secret@example.com','https://example.com?token=a','https://example.com/path'])expect(()=>safeEndpoint(origin)).toThrow();
  });
  it('does not report an already failed window twice when failure ends the call',async()=>{
    const failures:number[]=[];let lost:RemoteWindow[]=[];
    const queue=new RemoteQueue(async()=>{throw new Error('network unavailable');},item=>{failures.push(item.sequence);lost=queue.cancel();});
    queue.push(window(0));queue.push(window(1));await tick();expect(failures).toEqual([0]);expect(lost.map(r=>r.sequence)).toEqual([1]);
  });
  it('does not permit safe/identity/authorized synthetic verdicts',()=>{
    expect(liveStateSchema.safeParse({acousticFinding:'safe',verification:'authorized'}).success).toBe(false);
  });
  it('does not make silence or missing coverage improve inference latency statistics',()=>{
    const report=latencySummary([{sequence:0,mediaStartMs:0,durationMs:4000,status:'analyzed',acousticStatus:'available',qualityStatus:'usable',receiverLatencyMs:7000,queueMs:0},
      {sequence:1,mediaStartMs:4000,durationMs:4000,status:'analyzed',acousticStatus:'insufficient_audio',qualityStatus:'insufficient',receiverLatencyMs:4100,queueMs:0}]);
    expect(report.n).toBe(1);expect(report.p95).toBe(7000);expect(latencySummary([]).p50).toBeNull();
  });
});

it('checks website identity without sending credentials to an unrelated service', async()=>{
  const fetchFixture=vi.fn(async()=>Response.json({project:'app-backend'}));
  vi.stubGlobal('fetch',fetchFixture);
  try {
    await expect(assertWebsiteService('http://127.0.0.1:8876')).rejects.toThrow('separate website service');
    expect(fetchFixture.mock.calls[0]).toHaveLength(2);
    expect((fetchFixture.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toBeUndefined();
  } finally {vi.unstubAllGlobals();}
});
