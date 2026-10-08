"""Generated-fixture tests; no cloud, private audio, alerts or app database."""
import hashlib
import io
import json
import os
import shutil
import unittest
import wave
from pathlib import Path
from unittest.mock import patch
os.environ["TRUSTLENS_WEB_SERVICE_TOKEN"] = "website-regression-only-token"
os.environ["TRUSTLENS_WEB_LIVE_DEMO"] = "false"
# Credentials for the other project must have no effect.
os.environ["ACOUSTIC_SERVICE_TOKEN"] = "app-regression-only-token"
os.environ["TRUSTLENS_USER_TOKEN_HASHES"] = json.dumps({"app-owner": hashlib.sha256(b"app-personal-token").hexdigest()})
import numpy as np
from fastapi.testclient import TestClient
from web_acoustic.main import app, cleanup_expired
from web_acoustic.config import AUDIO_DIR, BASE_DIR, ACOUSTIC_SERVICE_TOKEN
from web_acoustic.routers.analyze import analyze_file
from web_acoustic.pipeline import voice_detection as voice
from web_acoustic.pipeline.local_scam_detector import score_transcript
from web_acoustic.storage_paths import resolve_audio_path
HEADERS = {"Authorization": "Bearer website-regression-only-token", "X-TrustLens-Owner": "web-owner"}

def wav(silence=False, seconds=2):
    y = np.zeros(16000 * seconds) if silence else .1 * np.sin(2 * np.pi * 220 * np.arange(16000 * seconds) / 16000)
    output = io.BytesIO()
    with wave.open(output, "wb") as target:
        target.setnchannels(1); target.setsampwidth(2); target.setframerate(16000)
        target.writeframes((y * 32767).astype("<i2").tobytes())
    return output.getvalue()

class Fixtures(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, base_url="https://testserver")
        self.before = set(AUDIO_DIR.iterdir())
    def tearDown(self):
        self.assertEqual(set(AUDIO_DIR.iterdir()), self.before, "Website temporary audio was not cleaned")
    def post(self, data, name="generated.wav", headers=HEADERS):
        return self.client.post("/analyze", headers=headers, files={"audio": (name, data, "audio/wav")})

class Isolation(Fixtures):
    def test_website_namespace_and_storage(self):
        self.assertTrue(AUDIO_DIR.resolve().is_relative_to(BASE_DIR / ".runtime"))
        self.assertEqual(ACOUSTIC_SERVICE_TOKEN, "website-regression-only-token")
        self.assertEqual(self.client.get("/health").json()["project"], "trustlens-web")
        self.assertFalse(any("cases" in route.path or "trusted-identities" in route.path for route in app.routes))
        self.assertEqual(self.client.get("/cases").status_code, 404)
    def test_other_project_credentials_are_rejected(self):
        self.assertEqual(self.post(b"fixture", headers={"Authorization": "Bearer app-regression-only-token", "X-TrustLens-Owner": "web-owner"}).status_code, 401)
        self.assertEqual(self.post(b"fixture", headers={"Authorization": "Bearer app-personal-token"}).status_code, 401)
        self.assertEqual(self.post(b"fixture", headers={}).status_code, 401)
    def test_unconfigured_readiness_is_explicit(self):
        response = self.client.get("/ready")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["ready"])
        self.assertFalse(response.json()["acoustic"]["calibrated"])
    def test_owner_required(self):
        self.assertEqual(self.post(b"fixture", headers={"Authorization": HEADERS["Authorization"]}).status_code, 400)
    def test_format_and_body_bounds(self):
        self.assertEqual(self.post(wav(), name="attack.exe").status_code, 415)
        with patch("web_acoustic.audio_ingress.MAX_AUDIO_BYTES", 1000):
            self.assertEqual(self.post(b"x" * 70000).status_code, 413)
    def test_storage_traversal_rejected(self):
        with self.assertRaises(ValueError):
            resolve_audio_path(BASE_DIR / "outside.wav")
    def test_demo_disabled_and_independent_credentials(self):
        self.assertEqual(self.client.get("/demo/ready", headers=HEADERS).status_code, 404)
        with patch.dict(os.environ, {"TRUSTLENS_WEB_LIVE_DEMO": "true"}):
            self.assertEqual(self.client.get("/demo/ready", headers={"Authorization": "Bearer app-personal-token"}).status_code, 401)
    def test_uncalibrated_labels_and_context(self):
        self.assertEqual(voice._score_to_synthetic_prob([{"label": "fake", "score": .2}, {"label": "real", "score": .8}]), (.2, None))
        with self.assertRaises(ValueError):
            voice._score_to_synthetic_prob([{"label": "LABEL_0", "score": .99}])
        self.assertFalse(score_transcript("shopping")[1])
        self.assertFalse(score_transcript("never share your OTP")[1])
        self.assertIn("payment_request", score_transcript("मुझे पैसे भेजो")[1])
    def test_worker_invocation_stays_in_website(self):
        from web_acoustic.live_worker import LiveWorker
        worker = LiveWorker()
        with patch("web_acoustic.live_worker.subprocess.Popen", side_effect=RuntimeError("fixture")) as spawn:
            with self.assertRaises(RuntimeError):
                worker._start()
        self.assertIn("web_acoustic.worker_live", spawn.call_args.args[0])
        self.assertEqual(spawn.call_args.kwargs["cwd"], BASE_DIR)

@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg/ffprobe required for real decoder tests")
class Decoder(Fixtures):
    # Only generated audio; normal tests keep model/ASR inference mocked.
    def test_silence_child_process_cleanup_and_identity(self):
        response = self.post(wav(silence=True))
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["service"], "trustlens-web-acoustic-v1")
        self.assertEqual(result["acoustic"]["status"], "insufficient_audio")
        self.assertIsNone(result["acoustic"]["score"])
    def test_invalid_container(self):
        with patch("web_acoustic.routers.analyze.bounded_analyze", side_effect=analyze_file):
            self.assertEqual(self.post(b"not audio").status_code, 422)
    def test_actual_duration_limit(self):
        with patch("web_acoustic.routers.analyze.bounded_analyze", side_effect=analyze_file):
            self.assertEqual(self.post(wav(silence=True, seconds=301)).status_code, 413)
    def test_separate_score_and_transcription_failure(self):
        with patch("web_acoustic.routers.analyze.bounded_analyze", side_effect=analyze_file), \
             patch("web_acoustic.routers.analyze.detect_synthetic_voice", return_value={"status": "available", "synthetic_probability": .17, "models_used": ["fixture"], "windows_analyzed": 1}), \
             patch("web_acoustic.routers.analyze.transcribe_audio", return_value=None):
            response = self.post(wav())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["acoustic"]["score"], .17)
        self.assertEqual(response.json()["contextStatus"], "analysis_unavailable")
    def test_failed_worker_cleans_recording(self):
        from fastapi import HTTPException
        with patch("web_acoustic.routers.analyze.bounded_analyze", side_effect=HTTPException(503, "fixture failure")):
            self.assertEqual(self.post(wav()).status_code, 503)

if __name__ == "__main__":
    unittest.main()
