"""Security, limits and cancellation tests; no neural model downloads required."""
import threading
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from local_service import create_app, decode_audio


class FakeEngine:
    def __init__(self):
        self.state, self.error = "ready", None
        self.models = {"v4": (), "v5": ()}
        self.gate = threading.Event()
        self.gate.set()
        self.started = threading.Event()

    def load(self):
        pass

    def cleanup(self):
        pass

    def analyze(self, raw, model, progress, cancelled):
        self.started.set()
        self.gate.wait(5)
        if cancelled.is_set():
            return None
        if raw == b"bad":
            raise ValueError("Cannot decode this recording.")
        progress(1, 1)
        return {"model": model, "vote": "human-like", "assessment": "Inconclusive"}


class LocalServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = FakeEngine()
        self.client = TestClient(create_app(self.engine), base_url="http://127.0.0.1:8765")
        self.client.__enter__()
        token = self.client.get("/api/voice/pairing", headers={"Sec-Fetch-Site": "same-origin"}).json()["key"]
        self.headers = {"X-TrustLens-Key": token}

    def tearDown(self):
        self.engine.gate.set()
        self.client.__exit__(None, None, None)

    def submit(self, body=b"audio", model="v4"):
        return self.client.post("/api/voice/jobs?model=" + model, headers=self.headers, content=body)

    def poll(self, job_id):
        for _ in range(100):
            job = self.client.get("/api/voice/jobs/" + job_id, headers=self.headers).json()
            if job["status"] in ("done", "error", "cancelled"):
                return job
            time.sleep(.01)
        self.fail("Job did not finish")

    def test_key_required_before_reading_body(self):
        self.assertEqual(self.client.post("/api/voice/jobs", content=b"audio").status_code, 401)
        self.assertEqual(self.client.get("/api/voice/session", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get("/api/voice/jobs/missing").status_code, 401)

    def test_standalone_pairing_page_does_not_require_frontend_or_sign_in(self):
        for path in ("/", "/pair"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertIn("Copy pairing key", response.text)
            self.assertIn("5173", response.text)
            self.assertNotIn(self.headers["X-TrustLens-Key"], response.text)
            self.assertEqual(response.headers["x-frame-options"], "DENY")

    def test_hosted_origin_can_use_key_but_cannot_read_it(self):
        origin = "https://trustlens-vmeg.vercel.app"
        response = self.client.options("/api/voice/jobs", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-trustlens-key,content-type",
            "Access-Control-Request-Private-Network": "true"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], origin)
        self.assertEqual(response.headers["access-control-allow-private-network"], "true")
        response = self.client.get("/api/voice/pairing", headers={"Origin": origin, "Sec-Fetch-Site": "cross-site"})
        self.assertEqual(response.status_code, 403)
        response = self.client.get("/api/voice/session", headers={**self.headers, "Origin": origin})
        self.assertEqual(response.status_code, 200)

    def test_untrusted_origins_and_hosts_rejected(self):
        self.assertEqual(self.client.get("/api/voice/health", headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.client.get("/api/voice/health", headers={"Host": "evil.example"}).status_code, 400)
        self.assertEqual(self.client.get("/api/voice/pairing").status_code, 403)

    def test_limits_and_readiness(self):
        self.assertEqual(self.submit(b"").status_code, 400)
        self.assertEqual(self.submit(model="v9").status_code, 400)
        with patch("local_service.MAX_BYTES", 4):
            self.assertEqual(self.submit(b"12345").status_code, 413)
        self.engine.state = "warming"
        self.assertEqual(self.submit().status_code, 503)

    def test_result_and_decode_error(self):
        response = self.submit()
        self.assertEqual(response.status_code, 202)
        result = self.poll(response.json()["id"])
        self.assertEqual(result["result"]["assessment"], "Inconclusive")
        self.assertNotIn("raw", result)
        bad = self.poll(self.submit(b"bad").json()["id"])
        self.assertEqual(bad["status"], "error")

    def test_bounded_queue_and_cancellation(self):
        self.engine.gate.clear()
        first = self.submit().json()["id"]
        self.assertTrue(self.engine.started.wait(2))
        second = self.submit().json()["id"]
        self.assertEqual(self.submit().status_code, 429)
        self.client.delete("/api/voice/jobs/" + second, headers=self.headers)
        # Cancellation cannot turn the executor into an unbounded queue.
        self.assertEqual(self.submit().status_code, 429)
        self.client.delete("/api/voice/jobs/" + first, headers=self.headers)
        self.engine.gate.set()
        self.assertEqual(self.poll(first)["status"], "cancelled")
        self.assertEqual(self.poll(second)["status"], "cancelled")

    def test_real_decoder_rejects_non_audio(self):
        with self.assertRaisesRegex(ValueError, "Cannot decode"):
            decode_audio(b"This is not an audio recording.")


if __name__ == "__main__":
    unittest.main()
