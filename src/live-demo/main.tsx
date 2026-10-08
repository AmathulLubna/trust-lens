import { StrictMode,useRef,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ControlledCall } from './call';
import { assertWebsiteService,safeEndpoint,latencySummary,type DemoLanguage,type LiveState,type Measurement } from './contract';
import './style.css';

interface ApprovalView {details:{approvalId:string;beneficiary:string;amount:number;warningRevision:number};requestDigest:string;status:string;receipt?:string}
function App(){
  const [endpoint,setEndpoint]=useState(import.meta.env.VITE_LIVE_ANALYSIS_ORIGIN || (['localhost','127.0.0.1','[::1]'].includes(location.hostname)?'http://127.0.0.1:8876':''));const [token,setToken]=useState('');
  const [role,setRole]=useState<'caller'|'recipient'|'verifier'>('caller');const [consent,setConsent]=useState(false);
  const [language,setLanguage]=useState<DemoLanguage>('auto');
  const [sid,setSid]=useState('');const [invite,setInvite]=useState('');const [file,setFile]=useState<File|null>(null);
  const [message,setMessage]=useState('Configure three separate operator-issued credentials: caller, recipient and independent verifier.');
  const [busy,setBusy]=useState(false);const [active,setActive]=useState(false);const [muted,setMuted]=useState(false);
  const [state,setState]=useState<LiveState|null>(null);const [measurements,setMeasurements]=useState<Measurement[]>([]);
  const [tracks,setTracks]=useState<{local:string[];remote:string[]}>({local:[],remote:[]});
  const [approvalId,setApprovalId]=useState('');const [beneficiary,setBeneficiary]=useState('Demo beneficiary');const [amount,setAmount]=useState(1000);
  const [approval,setApproval]=useState<ApprovalView|null>(null);const [receipt,setReceipt]=useState('');const [confirmed,setConfirmed]=useState(false);
  const call=useRef<ControlledCall|null>(null);const audio=useRef<HTMLAudioElement>(null);
  async function request(path:string,method='GET',body?:unknown){
    await assertWebsiteService(safeEndpoint(endpoint));
    const response=await fetch(safeEndpoint(endpoint)+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000)});
    if(!response.ok){const error=await response.json().catch(()=>({detail:'Request failed'}));throw new Error(`${error.detail} (${response.status})`);}
    return response.json();
  }
  async function perform(action:()=>Promise<void>){setBusy(true);try{await action();}catch(error){setMessage(String(error));}finally{setBusy(false);}}
  async function start(){
    if(!consent)throw new Error('Confirm consent before starting');
    let session=sid;
    if(role==='caller'){const result=await request('/demo/sessions','POST',{consent:true});session=result.sessionId;setSid(session);setInvite(result.invite);}
    else if(role==='recipient')await request(`/demo/sessions/${sid}/join`,'POST',{consent:true,invite});
    else throw new Error('Verifier does not join the voice call');
    setState(null);setMeasurements([]);setApproval(null);setApprovalId('');setReceipt('');
    const controlled=new ControlledCall(endpoint,token,session,role,{state:setState,measurement:m=>setMeasurements(previous=>[...previous,m].slice(-256)),message:setMessage,
      tracks:(local,remote)=>setTracks({local,remote}),ended:()=>{setActive(false);setState(previous=>previous?{...previous,closed:true,coverage:'incomplete',acousticFinding:previous.acousticFinding==='possible_synthetic_characteristics'?previous.acousticFinding:'incomplete_evidence'}:null);setMessage('Call ended. Create a new session to resume; previous coverage is incomplete.');}},language);
    call.current=controlled;
    try{await controlled.start(file,audio.current!);setMuted(false);setActive(true);setMessage(role==='caller'?'Share this session ID and invite with the consenting recipient.':'Waiting for remote audio. Only the caller’s received track is analyzed.');}
    catch(error){await controlled.end();throw error;}
  }
  function exportMeasurements(){
    const report={schemaVersion:1,sessionId:sid,policyVersion:state?.policyVersion,configHash:state?.configHash,source:file?'consented_file_sent_over_webrtc':'live_microphone_sent_over_webrtc',
      accuracyValidated:false,latencyDefinition:'recipient AudioContext first received PCM sample to UI result, including 4 s accumulation + bounded queue + HTTP + inference; excludes caller capture/encode/network before recipient PCM',
      measuredReceiverLatencyMs:latencySummary(measurements),state,measurements};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='trustlens-live-measurements.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <main>
    <header><span className="tag">TrustLens · SIH26104</span><h1>Controlled two-party call</h1><p>Call another consenting demo participant through this page. Analysis receives the remote caller’s audio in the recipient’s browser and sends short windows to the separate website acoustic service.</p></header>
    <aside>This demo supports WebRTC calls made here. Cellular and WhatsApp interception are unavailable. Acoustic output is uncalibrated; synthetic speech alone does not establish fraud. Speaker comparison is unimplemented and cannot authorize a request.</aside>
    <section><h2>Connect</h2><div className="grid">
      <label>Analysis server<input aria-label="Local analysis server" value={endpoint} onChange={e=>setEndpoint(e.target.value)} disabled={active||busy}/></label>
      <label>Caller language<select aria-label="Caller language" value={language} onChange={e=>setLanguage(e.target.value as DemoLanguage)} disabled={active||busy}><option value="auto">Auto-detect / Hinglish</option><option value="hi">Hindi</option><option value="en">English</option></select><small>Select on the recipient's page. Accuracy across languages is unvalidated.</small></label>
      <label>Personal demo credential<input aria-label="Personal demo credential" type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} disabled={active}/></label>
      <label>Role<select aria-label="Role" value={role} onChange={e=>setRole(e.target.value as typeof role)} disabled={active}><option value="caller">Caller</option><option value="recipient">Recipient</option><option value="verifier">Independent verifier</option></select></label>
      <label>Consented audio file (optional)<input aria-label="Consented audio file" type="file" accept="audio/*" onChange={e=>setFile(e.target.files?.[0]??null)} disabled={active}/><small>Empty uses your microphone. A selected file loops through the live outgoing WebRTC track.</small></label>
      <label>Session ID<input aria-label="Session ID" value={sid} onChange={e=>setSid(e.target.value)} disabled={active}/></label>
      <label>Recipient invite<input aria-label="Recipient invite" value={invite} onChange={e=>setInvite(e.target.value)} disabled={active}/></label>
    </div><label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={active}/>I consent to this controlled call and short-window processing on the configured server; I have permission to use any selected recording.</label>
    <div className="actions"><button disabled={busy||active||!token} onClick={()=>void perform(async()=>{const r=await request('/demo/ready');setMessage(`Worker: acoustic ${r.acoustic.loaded?'loaded':'unavailable'}, transcription ${r.asrLoaded?'loaded':'unavailable'}. ${r.turnConfigured?'Relay configured; cross-network calling still needs testing.':'No relay configured; connectivity may be limited to this computer or LAN.'} Accuracy remains unvalidated.`);})}>Check / warm analysis</button>
      <button disabled={busy||active||!consent||!token||role==='verifier'} onClick={()=>void perform(start)}>{role==='caller'?'Create call':'Join call'}</button>
      <button disabled={!active} onClick={()=>void call.current?.end()}>End and delete session</button>
      <button disabled={!active} onClick={()=>{call.current?.muteOutgoing(!muted);setMuted(!muted);}}> {muted?'Restore outgoing audio':'Mute outgoing audio (poor-audio test)'}</button></div>
    <p role="status">{message}</p><audio ref={audio} controls autoPlay aria-label="Remote caller audio"/><small>Use headphones. Sessions expire fifteen minutes after creation. A short transcript context is held temporarily in server memory to recognize requests across windows; it is cleared after gaps and at call end and is excluded from exports. Background tabs or device sleep may interrupt capture. Ending deletes the server session; local measurements remain until this page reloads.</small></section>
    <section><h2>Separate findings</h2><div className="grid findings">
      <article><h3>Acoustic evidence</h3><p>{state?.acousticFinding==='possible_synthetic_characteristics'?'Possible synthetic characteristics in consecutive available windows':state?.acousticFinding==='no_persistent_acoustic_indicator'?'No persistent acoustic indicator':state?.acousticFinding==='incomplete_evidence'?'Incomplete acoustic evidence':'Waiting for received audio'}</p><small>Current acoustic signal: {measurements.length?(measurements[measurements.length-1].acousticStatus??'analysis_unavailable'):'not_yet_available'}. Raw model output; caller identity and fraud are unverified.</small></article>
      <article><h3>Conversation warnings</h3><p>{state?.contentWarnings.length?state.contentWarnings.map(w=>w.split('_').join(' ')).join(', '):'No contextual warning recorded yet'}</p><small>Current language signal: {measurements.length?(measurements[measurements.length-1].contextStatus??'analysis_unavailable'):'not_yet_available'}. Offline rules on local transcription. Legitimate sensitive requests can trigger verification.</small></article>
      <article><h3>Coverage and verification</h3><p>{state?.coverage.split('_').join(' ')??'Not yet available'} · {state?.gapCount??0} explicit gaps</p><strong>Independent confirmation required for every sensitive approval</strong><small>Missing evidence never establishes safety.</small></article>
    </div><details><summary>Track separation and measured latency</summary><p>Outgoing track: {tracks.local.join(', ')||'none'}<br/>Incoming analyzed track (recipient only): {tracks.remote.join(', ')||'none'}</p><p>Latency below starts at the first PCM sample received in the recipient’s audio graph and ends at the displayed result. It includes four seconds of accumulation, waiting, upload and inference. Caller-to-recipient transport before that sample is unmeasured.</p>
      <table><thead><tr><th>Window / media time</th><th>Result</th><th>Receiver → result</th><th>Waiting</th><th>Server</th></tr></thead><tbody>{measurements.slice(-12).map(m=><tr key={m.sequence}><td>{m.sequence} / {(m.mediaStartMs/1000).toFixed(1)} s</td><td>{m.reason??m.acousticStatus??m.status}</td><td>{Math.round(m.receiverLatencyMs)} ms</td><td>{Math.round(m.queueMs)} ms</td><td>{m.serverWallMs===undefined?'—':`${Math.round(m.serverWallMs)} ms`}</td></tr>)}</tbody></table><button disabled={!measurements.length} onClick={exportMeasurements}>Export measured session metadata</button></details></section>
    <section><h2>Simulated sensitive approval</h2><p>No money moves. A separate operator must independently confirm the exact request through a saved contact callback or an authenticated approval portal. The call participants cannot confirm it themselves.</p>
      <div className="grid"><label>Beneficiary<input value={beneficiary} onChange={e=>setBeneficiary(e.target.value)}/></label><label>Demo amount<input type="number" min="1" max="1000000" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></label><label>Approval ID<input aria-label="Approval ID" value={approvalId} onChange={e=>setApprovalId(e.target.value)}/></label><label>One-use confirmation receipt<input aria-label="Confirmation receipt" value={receipt} onChange={e=>setReceipt(e.target.value)} autoComplete="off"/></label></div>
      {role==='recipient'&&<div className="actions"><button disabled={busy||!active} onClick={()=>void perform(async()=>{const r=await request(`/demo/sessions/${sid}/approvals`,'POST',{beneficiary,amount});setApproval(r);setApprovalId(r.details.approvalId);setReceipt('');setMessage('Share session and approval IDs with the independent verifier; do not rely on this call for confirmation.');})}>Request independent confirmation</button><button disabled={busy||!receipt||!active} onClick={()=>void perform(async()=>{const r=await request(`/demo/sessions/${sid}/approvals/${approvalId}/complete`,'POST',{receipt});setApproval(r);setReceipt('');setMessage('Simulation completed. No funds transferred.');})}>Complete simulated approval</button></div>}
      {role==='verifier'&&<><button disabled={busy||!sid||!approvalId} onClick={()=>void perform(async()=>{setApproval(await request(`/demo/sessions/${sid}/approvals/${approvalId}/verification`));setConfirmed(false);})}>Review exact request</button><label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I independently confirmed these exact details through the authenticated approval portal.</label><button disabled={busy||!approval||!confirmed} onClick={()=>void perform(async()=>{const r=await request(`/demo/sessions/${sid}/approvals/${approvalId}/verification`,'POST',{requestDigest:approval!.requestDigest,independentChannel:'authenticated_approval_portal',confirmed});setApproval(r);setReceipt(r.receipt);setMessage('Receipt expires in 60 seconds and becomes stale if warning evidence changes.');})}>Issue simulation receipt</button><button disabled={busy||!sid} onClick={()=>void perform(async()=>{await request(`/demo/sessions/${sid}/fault`,'POST');setMessage('Next live analysis will explicitly fail. This operator fault test produces no detection score.');})}>Inject one analysis failure (operator test)</button></>}
      {approval&&<pre aria-label="Approval details">{JSON.stringify({details:approval.details,requestDigest:approval.requestDigest,status:approval.status},null,2)}</pre>}
    </section>
    <section><h2>Reproducible scenarios</h2><ol><li><strong>Benign conversation:</strong> “We are meeting for lunch tomorrow.” Record what the model and rules actually return.</li><li><strong>Suspicious request:</strong> “Please send money now. Keep this secret.” Expect contextual verification warnings if transcription is available.</li><li><strong>Poor audio:</strong> mute the caller for at least eight seconds; the recipient must show incomplete evidence and keep prior warnings.</li><li><strong>Analysis failure:</strong> the independent operator injects one failure; the next received window must become an explicit gap.</li></ol><p>These exercise the integration; they do not establish detection accuracy. A live microphone benign call needs a consenting human participant.</p></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
