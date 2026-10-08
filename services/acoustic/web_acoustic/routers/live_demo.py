"""Opt-in two-party WebRTC signaling + received-audio analysis. Single process."""
import asyncio, hashlib, hmac, json, os, secrets, tempfile, time, uuid
from dataclasses import dataclass, field
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from web_acoustic.security import user_tokens
from web_acoustic import live_policy
from web_acoustic.live_worker import worker
from web_acoustic.detector_config import digest, CONFIG_HASH
from web_acoustic import live_spool
from web_acoustic.live_context import ConversationContext
from web_acoustic import ice_config
from starlette.responses import JSONResponse

router=APIRouter(prefix='/demo',tags=['controlled-live-demo'])
TTL=900
sessions={}

def enabled():
    if os.environ.get('TRUSTLENS_WEB_LIVE_DEMO')!='true':raise HTTPException(404,'Controlled demo disabled')

def demo_owner(authorization: str = Header('')):
    enabled()
    if not authorization.isascii() or not authorization.startswith('Bearer ') or not 1<=len(authorization[7:])<=512:
        raise HTTPException(401,'Personal demo credential required')
    hashed=hashlib.sha256(authorization[7:].encode()).hexdigest()
    for owner, expected in user_tokens().items():
        if hmac.compare_digest(hashed,expected):return owner
    raise HTTPException(401,'Personal demo credential required')

def verifier(owner):
    if owner not in {s.strip() for s in os.environ.get('TRUSTLENS_WEB_DEMO_VERIFIERS','').split(',') if s.strip()}:
        raise HTTPException(403,'Independent verifier role required')

@dataclass
class Session:
    id:str
    caller:str
    invite:str
    created:float=field(default_factory=time.monotonic)
    recipient:str|None=None
    closed:bool=False
    peers:dict=field(default_factory=dict)
    state:dict=field(default_factory=live_policy.initial)
    segments:dict=field(default_factory=dict)
    last_sequence:int=-1
    last_end:float=0
    analyzing:bool=False
    approvals:dict=field(default_factory=dict)
    faults:int=0
    context:ConversationContext=field(default_factory=ConversationContext,repr=False)

def prune():
    live_spool.cleanup()
    for key, session in list(sessions.items()):
        if session.closed and not session.peers and not session.analyzing:
            sessions.pop(key,None);continue
        if time.monotonic()-session.created>TTL:
            close(session);sessions.pop(key,None)

def get(session_id,owner,recipient=False):
    prune();session=sessions.get(session_id)
    if not session or owner not in {session.caller,session.recipient}:raise HTTPException(404,'Session not found')
    if session.closed:raise HTTPException(410,'Session ended; create a new call')
    if recipient and owner!=session.recipient:raise HTTPException(403,'Only the recipient may analyze received audio')
    return session

def publish(session,message):
    for channel in list(session.peers.values()):
        try:channel.put_nowait(message)
        except asyncio.QueueFull:
            # Slow signaling consumers cannot accumulate SDP/results indefinitely.
            close(session);break

def close(session):
    worker.cancel(session.id)
    session.context.clear()
    session.closed=True;session.approvals.clear();session.segments.clear()
    for channel in list(session.peers.values()):
        while not channel.empty():channel.get_nowait()
        channel.put_nowait({'type':'ended','reason':'call_ended_or_signaling_gap'})

def state(session):
    return {**session.state,'configHash':CONFIG_HASH,'sessionId':session.id,'closed':session.closed}

class Strict(BaseModel):
    model_config=ConfigDict(extra='forbid')
class Consent(Strict):
    consent:bool
class Join(Consent):
    invite:str=Field(min_length=20,max_length=128)
class Gap(Strict):
    sequence:int=Field(ge=0,le=255)
    mediaStartMs:float=Field(ge=0,le=TTL*1000,allow_inf_nan=False)
    durationMs:float=Field(gt=0,le=TTL*1000,allow_inf_nan=False)
    reason:str=Field(pattern='^(queue_full|render_gap|network_failure|analysis_failure|silence|capture_stopped|track_interrupted)$')
class Approval(Strict):
    beneficiary:str=Field(min_length=1,max_length=80)
    amount:int=Field(gt=0,le=1000000)
class Confirmation(Strict):
    independentChannel:str=Field(pattern='^(saved_contact_callback|authenticated_approval_portal)$')
    requestDigest:str=Field(pattern='^[0-9a-f]{64}$')
    confirmed:bool

@router.get('/ready')
async def ready(owner:str=Depends(demo_owner)):
    _, turns, _, _ = ice_config.configuration()
    info=await run_in_threadpool(worker.ready)
    return {**info,'ready':bool(info['acoustic']['loaded'] and info['asrLoaded']),'supportedTransport':'controlled_webrtc','singleProcessRequired':True,'accuracyValidated':False,
            'turnConfigured':bool(turns),'policyVersion':live_policy.POLICY}

@router.get('/sessions/{sid}/ice')
async def ice(sid:str,owner:str=Depends(demo_owner)):
    get(sid,owner)
    return JSONResponse(ice_config.client_configuration(),headers={'Cache-Control':'no-store'})

@router.post('/sessions')
async def create(body:Consent,owner:str=Depends(demo_owner)):
    if not body.consent:raise HTTPException(400,'Both participants must consent to local-server analysis')
    prune()
    if len(sessions)>=8 or any(owner in {s.caller,s.recipient} and not s.closed for s in sessions.values()):
        raise HTTPException(429,'End the existing demo session first; capacity is bounded')
    sid=str(uuid.uuid4());session=Session(sid,owner,secrets.token_urlsafe(24));sessions[sid]=session
    return {'sessionId':sid,'invite':session.invite,'role':'caller','expiresInSec':TTL,'policyVersion':live_policy.POLICY}

@router.post('/sessions/{sid}/join')
async def join(sid:str,body:Join,owner:str=Depends(demo_owner)):
    prune();session=sessions.get(sid)
    if not session or session.closed or not secrets.compare_digest(session.invite,body.invite):raise HTTPException(404,'Invite not found')
    if not body.consent or owner==session.caller:raise HTTPException(400,'A separate consenting recipient is required')
    if session.recipient and session.recipient!=owner:raise HTTPException(409,'Recipient already joined')
    if any(s.id!=sid and not s.closed and owner in {s.caller,s.recipient} for s in sessions.values()):raise HTTPException(429,'End existing call first')
    session.recipient=owner
    return {'sessionId':sid,'role':'recipient','policyVersion':live_policy.POLICY}

@router.get('/sessions/{sid}')
async def snapshot(sid:str,owner:str=Depends(demo_owner)):
    session=get(sid,owner);return {'state':state(session),'segments':list(session.segments.values())}

@router.delete('/sessions/{sid}')
async def end(sid:str,owner:str=Depends(demo_owner)):
    session=get(sid,owner);close(session);return {'deleted':True,'audioRetained':False,'cleanupPending':session.analyzing}

def record_gap(session, body):
    if body.sequence in session.segments:
        cached=session.segments[body.sequence]
        if cached['mediaStartMs']!=body.mediaStartMs or cached['durationMs']!=body.durationMs:raise HTTPException(409,'Retry metadata changed')
        return cached
    if body.sequence<=session.last_sequence:raise HTTPException(409,'Sequence already passed')
    session.context.clear()
    live_policy.gap(session.state);session.last_sequence=body.sequence
    session.last_end=max(session.last_end,body.mediaStartMs+body.durationMs)
    entry={'sequence':body.sequence,'mediaStartMs':body.mediaStartMs,'durationMs':body.durationMs,'status':'gap','reason':body.reason}
    session.segments[body.sequence]=entry;publish(session,{'type':'state','state':state(session)})
    return entry

@router.post('/sessions/{sid}/gaps')
async def report_gap(sid:str,body:Gap,owner:str=Depends(demo_owner)):
    session=get(sid,owner,recipient=True)
    if session.analyzing:raise HTTPException(409,'Wait for the active window before reporting an ordered gap')
    return {'segment':record_gap(session,body),'state':state(session)}

@router.post('/sessions/{sid}/segments')
async def segment(sid:str,audio:UploadFile=File(...),sequence:int=Form(...),mediaStartMs:float=Form(...),durationMs:float=Form(...),language:str=Form('auto'),owner:str=Depends(demo_owner)):
    session=get(sid,owner,recipient=True)
    if not 0<=sequence<=255 or not 0<=mediaStartMs<=TTL*1000 or not 0<durationMs<=4500 or language not in {'auto','en','hi'}:
        raise HTTPException(400,'Invalid remote-media window metadata')
    import math
    if not math.isfinite(mediaStartMs+durationMs):raise HTTPException(400,'Invalid media timestamp')
    if sequence in session.segments:
        cached=session.segments[sequence]
        if cached['mediaStartMs']!=mediaStartMs or cached['durationMs']!=durationMs:raise HTTPException(409,'Retry metadata changed')
        return {'segment':cached,'state':state(session)}
    if session.analyzing:raise HTTPException(429,'Session window already active')
    if sequence<=session.last_sequence or mediaStartMs<session.last_end-20:raise HTTPException(409,'Out-of-order remote media')
    # Missing windows stay explicit even when the client never delivered a gap.
    if sequence!=session.last_sequence+1 or mediaStartMs>session.last_end+250:
        session.context.clear()
        live_policy.gap(session.state)
    session.analyzing=True;started=time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix='window-',dir=live_spool.root()) as tmp:
            raw=Path(tmp)/'remote.wav';clean=Path(tmp)/'clean.wav';size=0
            with raw.open('xb') as stream:
                while chunk:=await audio.read(65536):
                    size+=len(chunk)
                    if size>1024*1024:raise HTTPException(413,'Remote PCM window exceeds one MiB')
                    stream.write(chunk)
            if session.faults:
                session.faults-=1;raise HTTPException(503,'Operator-injected analysis failure; no conclusion')
            if session.closed:raise HTTPException(410,'Call ended before inference; audio discarded')
            def run():
                if session.closed:raise HTTPException(410,'Call ended before inference')
                return worker.analyze(raw,clean,language,session.id)
            result=await run_in_threadpool(run)
            if abs(result['reliability']['durationSec']*1000-durationMs)>100:raise HTTPException(400,'Media duration does not match PCM')
        if session.closed:raise HTTPException(410,'Call ended during inference; result discarded')
        live_policy.update(session.state,result,session.context.warnings(result,language))
        # Raw transcript/PCM never retained in session ledger or export.
        result={**result,'transcript':None}
        entry={'sequence':sequence,'mediaStartMs':mediaStartMs,'durationMs':durationMs,'status':'analyzed','result':result,
               'serverWallMs':(time.perf_counter()-started)*1000}
        session.last_sequence=sequence;session.last_end=mediaStartMs+durationMs;session.segments[sequence]=entry
        publish(session,{'type':'state','state':state(session)})
        return {'segment':entry,'state':state(session)}
    except HTTPException as error:
        if not session.closed:
            # Failure is an explicit ordered gap; retry returns this same outcome.
            record_gap(session,Gap(sequence=sequence,mediaStartMs=mediaStartMs,durationMs=durationMs,reason='analysis_failure'))
        raise error
    except Exception:
        if not session.closed:
            record_gap(session,Gap(sequence=sequence,mediaStartMs=mediaStartMs,durationMs=durationMs,reason='analysis_failure'))
        raise HTTPException(503,'Live analysis failed; evidence is incomplete')
    finally:
        session.analyzing=False;await audio.close()

@router.post('/sessions/{sid}/approvals')
async def request_approval(sid:str,body:Approval,owner:str=Depends(demo_owner)):
    session=get(sid,owner,recipient=True)
    if len(session.approvals)>=8:raise HTTPException(429,'Approval demo capacity reached')
    aid=str(uuid.uuid4());details={'sessionId':sid,'approvalId':aid,'beneficiary':body.beneficiary,'amount':body.amount,'policyVersion':live_policy.POLICY,
                              'warningRevision':session.state['revision'],'nonce':secrets.token_hex(16),'simulation':True}
    item={'details':details,'requestDigest':digest(details),'status':'independent_confirmation_required','receipt':None,'created':time.monotonic()}
    session.approvals[aid]=item
    return public_approval(item)

def public_approval(item):
    return {k:item[k] for k in ['details','requestDigest','status']}

def get_approval(sid,aid,owner):
    prune();session=sessions.get(sid)
    if not session or session.closed or aid not in session.approvals:raise HTTPException(404,'Approval not found')
    verifier(owner)
    if owner in {session.caller,session.recipient}:raise HTTPException(403,'Call participants cannot independently confirm')
    item=session.approvals[aid]
    if time.monotonic()-item['created']>300:raise HTTPException(410,'Approval request expired')
    return session,item

@router.get('/sessions/{sid}/approvals/{aid}/verification')
async def review_approval(sid:str,aid:str,owner:str=Depends(demo_owner)):
    session,item=get_approval(sid,aid,owner)
    return {**public_approval(item),'state':state(session)}

@router.post('/sessions/{sid}/approvals/{aid}/verification')
async def confirm(sid:str,aid:str,body:Confirmation,owner:str=Depends(demo_owner)):
    session,item=get_approval(sid,aid,owner)
    if not body.confirmed or not secrets.compare_digest(body.requestDigest,item['requestDigest']):raise HTTPException(400,'Exact independent confirmation is required')
    if item['status']!='independent_confirmation_required':raise HTTPException(409,'Confirmation already issued')
    if session.analyzing or session.state['revision']!=item['details']['warningRevision']:raise HTTPException(409,'Evidence changed; recipient must request a new approval')
    receipt=secrets.token_urlsafe(32);item['receipt']=receipt;item['expires']=time.monotonic()+60;item['status']='independently_confirmed_simulation'
    return {**public_approval(item),'receipt':receipt,'expiresInSec':60,'confirmedBy':owner}

class Completion(Strict):
    receipt:str=Field(min_length=20,max_length=128)

@router.post('/sessions/{sid}/approvals/{aid}/complete')
async def complete(sid:str,aid:str,body:Completion,owner:str=Depends(demo_owner)):
    session=get(sid,owner,recipient=True);item=session.approvals.get(aid)
    if not item or item['status']!='independently_confirmed_simulation' or not secrets.compare_digest(body.receipt,item['receipt'] or ''):
        raise HTTPException(403,'Independent one-use receipt required')
    if session.analyzing or time.monotonic()>item['expires'] or session.state['revision']!=item['details']['warningRevision']:
        raise HTTPException(409,'Receipt stale; independently confirm a new request')
    item['receipt']=None;item['status']='simulated_approval_completed'
    return {**public_approval(item),'simulation':True,'fundsTransferred':False}

@router.post('/sessions/{sid}/fault')
async def fault(sid:str,owner:str=Depends(demo_owner)):
    verifier(owner)
    if os.environ.get('TRUSTLENS_WEB_DEMO_FAULTS')!='true':raise HTTPException(404,'Failure injection disabled')
    prune();session=sessions.get(sid)
    if not session or session.closed:raise HTTPException(404,'Session not found')
    session.faults=1;return {'nextAnalysis':'explicit_failure','simulation':True}

@router.websocket('/sessions/{sid}/signal')
async def signal(ws:WebSocket,sid:str):
    # Auth in the first bounded message, never a query-string bearer token.
    host=(ws.client.host if ws.client else '')
    origins={o.strip() for o in os.environ.get('TRUSTLENS_WEB_ORIGINS','http://localhost:5173,http://127.0.0.1:5175').split(',')}
    if os.environ.get('TRUSTLENS_WEB_LIVE_DEMO')!='true' or ws.headers.get('origin') not in origins or (ws.url.scheme!='wss' and host not in {'127.0.0.1','::1'} and os.environ.get('TRUSTLENS_WEB_ALLOW_HTTP_DEV')!='true'):
        await ws.close(code=1008);return
    await ws.accept();session=None;channel=None
    try:
        raw=await asyncio.wait_for(ws.receive_text(),5)
        if len(raw)>1024:raise ValueError()
        auth=json.loads(raw)
        if set(auth)!={'type','token'} or auth['type']!='authenticate':raise ValueError()
        owner=demo_owner('Bearer '+auth['token']);session=get(sid,owner)
        if owner in session.peers:raise ValueError('One signaling connection per role')
        channel=asyncio.Queue(maxsize=8);session.peers[owner]=channel
        role='caller' if owner==session.caller else 'recipient'
        await ws.send_json({'type':'joined','role':role,'state':state(session)})
        if len(session.peers)==2:publish(session,{'type':'paired'})
        async def send():
            while True:
                message=await asyncio.wait_for(channel.get(),TTL)
                await asyncio.wait_for(ws.send_json(message),5)
                if message.get('type')=='ended':return
        async def receive():
            count=0;started=time.monotonic()
            while not session.closed:
                raw=await asyncio.wait_for(ws.receive_text(),min(60,max(.1,TTL-(time.monotonic()-session.created))))
                if len(raw)>65536:raise ValueError()
                count+=1
                if count>256 or count/(time.monotonic()-started+1)>40:raise ValueError()
                message=json.loads(raw)
                if message.get('type')=='ping':continue
                if set(message)!= {'type','payload'} or message['type'] not in {'offer','answer','ice'}:raise ValueError()
                if (message['type']=='offer' and role!='caller') or (message['type']=='answer' and role!='recipient'):raise ValueError()
                other=session.recipient if role=='caller' else session.caller
                target=session.peers.get(other)
                if not target:raise ValueError('Peer signaling unavailable')
                target.put_nowait(message)
        sending=asyncio.create_task(send());receiving=asyncio.create_task(receive())
        try:
            done,pending=await asyncio.wait([sending,receiving],timeout=max(.1,TTL-(time.monotonic()-session.created)),return_when=asyncio.FIRST_COMPLETED)
            for task in done:task.result()
        finally:
            for task in [sending,receiving]:task.cancel()
            await asyncio.gather(sending,receiving,return_exceptions=True)
    except (WebSocketDisconnect,HTTPException,ValueError,KeyError,TypeError,asyncio.TimeoutError,asyncio.QueueFull):pass
    finally:
        if session and session.peers.get(owner)==channel:
            session.peers.pop(owner,None);live_policy.gap(session.state);close(session)
        try:await ws.close()
        except RuntimeError:pass
