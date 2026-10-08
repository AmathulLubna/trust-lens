import { z } from 'zod';
export const liveStateSchema=z.object({policyVersion:z.literal('trustlens-live-26104-v2'),revision:z.number().int().nonnegative(),
  acousticFinding:z.enum(['not_yet_available','no_persistent_acoustic_indicator','possible_synthetic_characteristics','incomplete_evidence']),
  contentWarnings:z.array(z.enum(['payment_request','otp_credential','approval','isolation_secrecy','emotional_manipulation'])),
  coverage:z.enum(['not_yet_available','incomplete','analyzed_received_windows']),highRun:z.number().int().nonnegative(),gapCount:z.number().int().nonnegative(),
  verification:z.literal('independent_confirmation_required'),speakerComparison:z.literal('not_implemented'),configHash:z.string(),sessionId:z.string(),closed:z.boolean()});
export type LiveState=z.infer<typeof liveStateSchema>;
export const languageSchema=z.enum(['auto','en','hi']);
export type DemoLanguage=z.infer<typeof languageSchema>;
const iceUrl=z.string().max(256).regex(/^(stun|stuns|turn|turns):[^\s/@#?]+(?:\?transport=(udp|tcp))?$/);
export const iceConfigurationSchema=z.object({
  iceServers:z.array(z.object({urls:z.union([iceUrl,z.array(iceUrl).min(1).max(8)]),username:z.string().max(256).optional(),credential:z.string().max(256).optional()})).max(8),
  iceTransportPolicy:z.enum(['all','relay']),turnConfigured:z.boolean(),expiresAt:z.number().nullable(),
}).superRefine((value,ctx)=>{
  const turn=value.iceServers.filter(server=>(Array.isArray(server.urls)?server.urls:[server.urls]).some(url=>url.startsWith('turn:')||url.startsWith('turns:')));
  if(turn.some(server=>!server.username||!server.credential)||value.turnConfigured!==!!turn.length||(value.iceTransportPolicy==='relay'&&!turn.length))
    ctx.addIssue({code:'custom',message:'Relay configuration incomplete'});
});
export const resultSchema=z.object({state:liveStateSchema,segment:z.object({sequence:z.number().int().min(0).max(255),mediaStartMs:z.number().nonnegative(),durationMs:z.number().positive(),
  status:z.enum(['analyzed','gap']),reason:z.string().optional(),serverWallMs:z.number().optional(),result:z.object({
    acoustic:z.object({status:z.enum(['available','analysis_unavailable','insufficient_audio','inconclusive']),score:z.number().min(0).max(1).nullable(),models:z.array(z.string()),windows:z.number().int()}),
    reliability:z.object({status:z.enum(['usable','reduced','insufficient']),durationSec:z.number(),rms:z.number(),clippedFraction:z.number()}),
    contextStatus:z.enum(['available','analysis_unavailable','insufficient_audio']),timingsMs:z.record(z.string(),z.number()).optional()
  }).optional()})}).superRefine((value,ctx)=>{
  const segment=value.segment;
  if(segment.status==='analyzed'&&!segment.result)ctx.addIssue({code:'custom',message:'Analyzed window needs detector availability',path:['segment']});
  const acoustic=segment.result?.acoustic;
  if(acoustic?.status==='available'&&(acoustic.score===null||!acoustic.models.length||acoustic.windows<1))ctx.addIssue({code:'custom',message:'Available acoustic finding needs raw score/model/windows',path:['segment','result','acoustic']});
  if(acoustic&&acoustic.status!=='available'&&acoustic.score!==null)ctx.addIssue({code:'custom',message:'Unavailable acoustic finding cannot expose a safety score',path:['segment','result','acoustic']});
});
export type LiveResponse=z.infer<typeof resultSchema>;
export interface Measurement {sequence:number;mediaStartMs:number;durationMs:number;status:string;reason?:string;acousticStatus?:string;rawScore?:number|null;qualityStatus?:string;contextStatus?:string;receiverLatencyMs:number;queueMs:number;serverWallMs?:number;timingsMs?:Record<string,number>}
export function latencySummary(measurements:Measurement[]) {
  const samples=measurements.filter(m=>m.status==='analyzed'&&m.acousticStatus==='available'&&m.qualityStatus==='usable').map(m=>m.receiverLatencyMs).sort((a,b)=>a-b);
  const nearestRank=(p:number)=>samples.length?samples[Math.max(0,Math.ceil(p*samples.length)-1)]:null;
  return {n:samples.length,p50:nearestRank(.5),p95:nearestRank(.95),method:'nearest_rank',scope:'available usable acoustic windows only; silence and gaps excluded'};
}
export function safeEndpoint(value:string):string {
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Use an origin without credentials, path or query');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('HTTPS is required except on this computer');
  return url.origin;
}

export async function assertWebsiteService(endpoint: string): Promise<void> {
  const response = await fetch(`${safeEndpoint(endpoint)}/health`, { signal: AbortSignal.timeout(5000) });
  const health = response.ok ? await response.json() : null;
  if (health?.project !== "trustlens-web" || health?.service !== "trustlens-web-acoustic-v1")
    throw new Error("Use the separate website service from D:\\trust-lens-main; credentials were not sent.");
}
