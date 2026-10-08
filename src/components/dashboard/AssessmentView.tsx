import type { Assessment } from "@/lib/assessment";
import { VerdictStamp } from "./shared";

export default function AssessmentView({ result }: { result: Assessment }) {
  return (
    <div className="space-y-3 rounded-xl border p-4" aria-live="polite">
      <VerdictStamp verdict={result.outcome} />
      <p>{result.summary}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-semibold">Acoustic detection</dt>
          <dd>{result.acoustic.status.replace(/_/g, " ")}</dd>
          <dd>
            {result.acoustic.score !== null
              ? `Model output: ${result.acoustic.score.toFixed(3)} (uncalibrated)`
              : "No acoustic score"}
          </dd>
          <dd>{result.acoustic.models.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-semibold">Context</dt>
          <dd>{result.contextStatus.replace(/_/g, " ")}</dd>
          <dd>{result.flags.length} request / pressure warnings</dd>
        </div>
        <div>
          <dt className="font-semibold">Input reliability</dt>
          <dd>{result.reliability.status}</dd>
          <dd>{result.reliability.durationSec.toFixed(1)} seconds decoded</dd>
        </div>
      </dl>
      {result.flags.length > 0 && (
        <ul className="list-disc pl-5">
          {result.flags.map((f) => (
            <li key={f.id}>{f.label}</li>
          ))}
        </ul>
      )}
      {result.segments && (
        <details>
          <summary>
            Timestamped segment evidence ({result.segments.length})
          </summary>
          <ul>
            {result.segments.map((segment) => (
              <li key={segment.sequence}>
                Segment {segment.sequence} at {segment.offsetSec.toFixed(1)}s:
                acoustic {segment.acoustic.status}, output{" "}
                {segment.acoustic.score?.toFixed(3) ?? "unavailable"}; context{" "}
                {segment.contextStatus}; input {segment.reliability.status}.
              </li>
            ))}
          </ul>
        </details>
      )}
      {result.transcript && (
        <details>
          <summary>Transcript · speakers not identified</summary>
          <p className="whitespace-pre-wrap">{result.transcript}</p>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        {result.policyVersion}. This detector has not been validated for Indian
        telephony. A low output does not verify caller identity.
      </p>
    </div>
  );
}
