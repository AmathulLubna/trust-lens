"""Streaming findings are separate from authorization. Sticky for this call."""
from web_acoustic.pipeline.local_scam_detector import score_transcript
from web_acoustic.detector_config import ACTIVE

POLICY = 'trustlens-live-26104-v2'

def initial():
    return {'policyVersion':POLICY,'revision':0,'acousticFinding':'not_yet_available','contentWarnings':[],
            'coverage':'not_yet_available','highRun':0,'gapCount':0,'verification':'independent_confirmation_required',
            'speakerComparison':'not_implemented'}

def gap(state):
    state['highRun']=0
    if state['acousticFinding']!='possible_synthetic_characteristics':state['acousticFinding']='incomplete_evidence'
    state['gapCount']+=1
    state['revision']+=1
    state['coverage']='incomplete'

def update(state, result, context_warnings=None):
    previous=(state['acousticFinding'],tuple(state['contentWarnings']),state['coverage'])
    acoustic=result['acoustic']
    if acoustic['status']=='available' and result['reliability']['status']=='usable' and acoustic['score'] is not None:
        state['highRun']=state['highRun']+1 if acoustic['score']>=ACTIVE['threshold'] else 0
        if state['highRun']>=2:
            state['acousticFinding']='possible_synthetic_characteristics'
        elif state['acousticFinding']!='possible_synthetic_characteristics':
            state['acousticFinding']='no_persistent_acoustic_indicator'
    else:
        state['highRun']=0
        if state['acousticFinding']!='possible_synthetic_characteristics':state['acousticFinding']='incomplete_evidence'
    if result['contextStatus']=='available':
        warnings=list(score_transcript(result['transcript'] or '')[1]) if context_warnings is None else context_warnings
        state['contentWarnings']=sorted(set(state['contentWarnings'])|set(warnings))
    complete=acoustic['status']=='available' and result['reliability']['status']=='usable' and result['contextStatus']=='available'
    # Gaps and poor/incomplete evidence stay visible. Silence never clears a warning.
    if not complete or state['gapCount']:state['coverage']='incomplete'
    elif state['coverage']!='incomplete':state['coverage']='analyzed_received_windows'
    current=(state['acousticFinding'],tuple(state['contentWarnings']),state['coverage'])
    if current!=previous:state['revision']+=1
    return state
