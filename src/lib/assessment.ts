import { z } from "zod";
import { scamFlagsFromText, type ScamFlag, type Verdict } from "./trustlens";

export const POLICY_VERSION = "trustlens-2026-10-08-v1";
export const MAX_AUDIO_BYTES = 18 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 300;
export const verdictValues = [
  "safe",
  "flagged",
  "suspicious",
  "no_strong_indicators",
  "inconclusive",
  "analysis_unavailable",
  "insufficient_audio",
] as const;
const acousticSchema = z.object({
  status: z.enum([
    "available",
    "analysis_unavailable",
    "insufficient_audio",
    "inconclusive",
  ]),
  score: z.number().min(0).max(1).nullable(),
  revision: z.string().nullable().optional(),
  aggregation: z.string().optional(),
  models: z.array(z.string()).max(8),
  windows: z.number().int().nonnegative(),
});
export const serviceResultSchema = z
  .object({
    acoustic: acousticSchema,
    reliability: z.object({
      status: z.enum(["usable", "reduced", "insufficient"]),
      durationSec: z.number().min(0).max(MAX_AUDIO_SECONDS),
      rms: z.number().nonnegative(),
      clippedFraction: z.number().min(0).max(1),
    }),
    transcript: z.string().max(24000).nullable(),
    contextStatus: z.enum([
      "available",
      "analysis_unavailable",
      "insufficient_audio",
    ]),
  })
  .refine(
    (r) =>
      r.acoustic.status !== "available" ||
      (r.acoustic.score !== null &&
        r.acoustic.models.length > 0 &&
        r.acoustic.windows > 0),
    "Available acoustic result requires score, model, and windows",
  )
  .refine(
    (r) => r.contextStatus !== "available" || !!r.transcript?.trim(),
    "Available context requires a nonempty transcript",
  );
export type ServiceResult = z.infer<typeof serviceResultSchema>;
export interface Assessment extends ServiceResult {
  outcome: Verdict;
  action: "verify_before_proceeding" | "remain_cautious";
  flags: ScamFlag[];
  summary: string;
  policyVersion: string;
  sequence?: number;
  offsetSec?: number;
  segments?: Array<{
    sequence: number;
    offsetSec: number;
    acoustic: ServiceResult["acoustic"];
    reliability: ServiceResult["reliability"];
    contextStatus: ServiceResult["contextStatus"];
    outcome: Verdict;
  }>;
}
export function assess(input: ServiceResult): Assessment {
  const flags = scamFlagsFromText(input.transcript ?? "");
  // Raw model output is uncalibrated. It may suggest verification; it cannot
  // establish identity or be combined with language into a probability.
  let outcome: Verdict = "no_strong_indicators";
  if (
    flags.length ||
    (input.acoustic.status === "available" &&
      (input.acoustic.score ?? 0) >= 0.7)
  )
    outcome = "suspicious";
  else if (
    input.reliability.status === "insufficient" ||
    input.acoustic.status === "insufficient_audio"
  )
    outcome = "insufficient_audio";
  else if (
    input.acoustic.status === "analysis_unavailable" &&
    input.contextStatus !== "available"
  )
    outcome = "analysis_unavailable";
  else if (
    input.acoustic.status !== "available" ||
    input.contextStatus !== "available" ||
    input.reliability.status === "reduced"
  )
    outcome = "inconclusive";
  const summary =
    outcome === "suspicious"
      ? "Pause sensitive requests and verify through a previously saved contact or authenticated approval channel."
      : outcome === "no_strong_indicators"
        ? "No strong indicators found in this sample. Caller identity and authorization remain unverified."
        : "The available evidence is incomplete. Verify sensitive requests independently.";
  return {
    ...input,
    outcome,
    flags,
    summary,
    action:
      outcome === "no_strong_indicators"
        ? "remain_cautious"
        : "verify_before_proceeding",
    policyVersion: POLICY_VERSION,
  };
}
export function unavailableAssessment(): Assessment {
  return assess({
    acoustic: {
      status: "analysis_unavailable",
      score: null,
      models: [],
      windows: 0,
    },
    reliability: {
      status: "reduced",
      durationSec: 0,
      rms: 0,
      clippedFraction: 0,
    },
    transcript: null,
    contextStatus: "analysis_unavailable",
  });
}
export function retainedAssessment(
  result: Assessment,
  consent: boolean,
): Assessment {
  return { ...result, transcript: consent ? result.transcript : null };
}
export function summarizeSession(
  results: Assessment[],
  gaps: number,
): Assessment {
  if (!results.length) return unavailableAssessment();
  const suspicious = results.find((r) => r.outcome === "suspicious");
  const incomplete = results.find((r) => r.outcome !== "no_strong_indicators");
  const base = suspicious ?? incomplete ?? results[results.length - 1];
  const flags = [
    ...new Map(results.flatMap((r) => r.flags).map((f) => [f.id, f])).values(),
  ];
  return {
    ...base,
    flags,
    outcome: suspicious ? "suspicious" : gaps ? "inconclusive" : base.outcome,
    acoustic: {
      status:
        results.every((r) => r.acoustic.status === "available") && !gaps
          ? "available"
          : "inconclusive",
      score: null,
      models: [...new Set(results.flatMap((r) => r.acoustic.models))],
      windows: results.reduce((sum, r) => sum + r.acoustic.windows, 0),
      aggregation: "individual-segment-outputs-no-session-probability",
    },
    segments: results.map((r, index) => ({
      sequence: r.sequence ?? index,
      offsetSec: r.offsetSec ?? index * 6,
      acoustic: r.acoustic,
      reliability: r.reliability,
      contextStatus: r.contextStatus,
      outcome: r.outcome,
    })),
    transcript:
      results
        .map((r) => r.transcript)
        .filter(Boolean)
        .join(" ") || null,
    summary: gaps ? `${base.summary} Coverage gaps: ${gaps}.` : base.summary,
    reliability: {
      ...base.reliability,
      durationSec: results.reduce(
        (sum, r) => sum + r.reliability.durationSec,
        0,
      ),
      status: gaps ? "reduced" : base.reliability.status,
    },
  };
}
