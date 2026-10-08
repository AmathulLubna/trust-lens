import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import {
  MAX_AUDIO_BYTES,
  unavailableAssessment,
  type Assessment,
} from "@/lib/assessment";
import { uploadAudio } from "@/lib/audio-upload";
import { Button } from "@/components/ui/button";
import AssessmentView from "./AssessmentView";

export default function UploadCheck() {
  const token = useAuthToken();
  const analyze = useAction(api.acoustic.analyze);
  const recordFailure = useMutation(api.audio.recordFailure);
  const [file, setFile] = useState<File | null>(null);
  const [processingConsent, setProcessingConsent] = useState(false);
  const [retain, setRetain] = useState(false);
  const [language, setLanguage] = useState<"auto" | "hi" | "en">("auto");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Assessment | null>(null);
  const [message, setMessage] = useState("");
  async function run() {
    if (!file || !processingConsent || busy) return;
    setBusy(true);
    setMessage("");
    setResult(null);
    const eventId = crypto.randomUUID();
    const startedAt = Date.now();
    try {
      const storageId = await uploadAudio(file, file.name, token);
      const response = await analyze({
        storageId,
        eventId,
        source: "upload",
        retainTranscript: retain,
        language,
      });
      setResult(response.result);
      setMessage(
        response.message ??
          "Assessment saved to history. Temporary audio deleted.",
      );
    } catch (error) {
      setResult(unavailableAssessment());
      setMessage(
        error instanceof Error ? error.message : "Analysis unavailable",
      );
      try {
        await recordFailure({ eventId, startedAt });
      } catch {
        setMessage(
          "Analysis unavailable; history could not be saved. Retry when the connection returns.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-bold">Recording check</h1>
      <p>
        Analyze a consented recording with the acoustic service and transcript
        request rules. Maximum 18 MiB and five minutes; the server validates
        decoded audio.
      </p>
      <p className="rounded-xl border p-4 text-sm">
        Audio travels through authenticated temporary Convex storage to the
        configured Python service. Transcription runs on that service. Audio is
        deleted after processing, with a 15-minute expiry retry for abandoned
        uploads. Service operators must verify model and provider data policies.
      </p>
      <input
        aria-label="Audio recording"
        type="file"
        accept=".wav,.mp3,.m4a,.webm,.ogg,.aac,.flac,.opus"
        disabled={busy}
        onChange={(event) => {
          const picked = event.target.files?.[0] ?? null;
          if (picked && picked.size > MAX_AUDIO_BYTES) {
            setMessage("File exceeds 18 MiB");
            setFile(null);
            return;
          }
          setFile(picked);
          setResult(null);
          setMessage("");
        }}
      />
      <label className="block">
        <input
          type="checkbox"
          checked={processingConsent}
          disabled={busy}
          onChange={(e) => setProcessingConsent(e.target.checked)}
        />{" "}
        I have permission to process this recording through the configured
        service.
      </label>
      <label className="block">
        <input
          type="checkbox"
          checked={retain}
          disabled={busy}
          onChange={(e) => setRetain(e.target.checked)}
        />{" "}
        Save the transcript in my history (optional; off by default).
      </label>
      <label className="block">
        Transcription language{" "}
        <select
          value={language}
          disabled={busy}
          onChange={(e) => setLanguage(e.target.value as typeof language)}
        >
          <option value="auto">Auto</option>
          <option value="hi">Hindi</option>
          <option value="en">English</option>
        </select>
      </label>
      <Button
        disabled={!file || !processingConsent || busy}
        onClick={() => void run()}
      >
        {busy ? "Analyzing…" : "Analyze recording"}
      </Button>
      {message && <p role="status">{message}</p>}
      {result && <AssessmentView result={result} />}
    </div>
  );
}
