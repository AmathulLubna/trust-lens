import { useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import {
  assess,
  unavailableAssessment,
  retainedAssessment,
} from "../../src/lib/assessment";
type Ref = Parameters<typeof getFunctionName>[0];
const settings = {
  bannerAlert: true,
  vibrationAlert: false,
  autoNotifyCircle: false,
  fullscreenAlert: false,
  sensitivity: 2,
  channelPhone: false,
  channelWhatsapp: false,
};
const logs: Array<Record<string, unknown>> = [];
const listeners = new Set<() => void>();
let version = 0;
function notify() {
  version++;
  listeners.forEach((l) => l());
}
const empty: never[] = [];
export function useQuery(ref: Ref) {
  useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => version,
  );
  const name = getFunctionName(ref);
  if (name === "calls:list") return logs;
  if (name === "settings:get") return settings;
  return empty;
}
export function useAction(ref: Ref) {
  return async (args: Record<string, unknown>) => {
    const name = getFunctionName(ref);
    if (name === "acoustic:analyze") {
      const mode = (
        document.getElementById("fixture-mode") as HTMLSelectElement
      ).value;
      const result =
        mode === "unavailable"
          ? unavailableAssessment()
          : assess({
              acoustic: {
                status: "available",
                score: 0.12,
                models: ["UI fixture only"],
                windows: 1,
              },
              reliability: {
                status: "usable",
                durationSec: 6,
                rms: 0.1,
                clippedFraction: 0,
              },
              transcript:
                mode === "request" ? "मुझे पैसे भेजो" : "Hello, how are you?",
              contextStatus: "available",
            });
      logs.unshift({
        _id: crypto.randomUUID(),
        callerName: "Local fixture recording",
        channel: "unknown",
        startedAt: Date.now(),
        durationSec: 6,
        verdict: result.outcome,
        flags: result.flags,
        assessmentJson: JSON.stringify(
          retainedAssessment(result, args.retainTranscript === true),
        ),
        notificationStatus: "disabled_or_unverified",
        source: args.source,
        eventId: args.eventId,
      });
      notify();
      return { result, cleanupPending: false };
    }
    if (name === "messageCheck:check") {
      const result = assess({
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
        transcript: String(args.text),
        contextStatus: "available",
      });
      return {
        ok: true,
        verdict: result.flags.length ? "suspicious" : "no_strong_indicators",
        reasons: result.flags.map((f) => f.label),
        summary: "Local UI fixture: request-rule behavior only",
      };
    }
    if (name === "numberLookup:lookup")
      return {
        ok: true,
        verdict: "inconclusive",
        counts: {},
        truncated: false,
      };
    throw new Error("Unsupported harness action");
  };
}
export function useMutation(ref: Ref) {
  return async (args: Record<string, unknown>) => {
    const name = getFunctionName(ref);
    if (name === "settings:update") {
      Object.assign(settings, args);
      notify();
    }
    if (name === "calls:clear") {
      logs.length = 0;
      notify();
    }
    return "local-fixture-record";
  };
}
