"""Use the existing fake engine to test the actual gateway and reused job API."""
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from gateway import create_gateway
from test_local_service import FakeEngine  # Existing test fixture; no copied model.

SECRET = "test-service-secret-" + "x" * 40


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.engine = FakeEngine()
        self.client = TestClient(create_gateway(self.engine, SECRET))
        self.client.__enter__()
        self.headers = {"Authorization": "Bearer " + SECRET, "X-TrustLens-User": "alice"}

    def tearDown(self):
        self.engine.gate.set()
        self.client.__exit__(None, None, None)

    def submit(self):
        return self.client.post("/api/voice/jobs?model=v4", content=b"audio", headers=self.headers)

    def test_no_browser_pairing_or_frontend_is_exposed(self):
        for path in ("/", "/pair", "/api/voice/pairing", "/assets/index.js"):
            self.assertEqual(self.client.get(path, headers=self.headers).status_code, 404)
        session = self.client.get("/api/voice/session", headers=self.headers)
        self.assertEqual(session.json(), {"connected": True})
        self.assertNotIn("key", session.text)

    def test_authentication_precedes_upload_and_browser_access_is_rejected(self):
        self.assertEqual(self.client.post("/api/voice/jobs", content=b"audio").status_code, 401)
        self.assertEqual(self.client.get("/api/voice/health", headers={"Authorization": "Bearer " + SECRET}).status_code, 403)
        response = self.client.post("/api/voice/jobs", content=b"audio", headers={**self.headers, "Origin": "https://trustlens-vmeg.vercel.app"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_ownership_and_real_reused_job_processing(self):
        response = self.submit()
        self.assertEqual(response.status_code, 202)
        path = "/api/voice/jobs/" + response.json()["id"]
        other = {**self.headers, "X-TrustLens-User": "bob"}
        self.assertEqual(self.client.get(path, headers=other).status_code, 404)
        self.assertEqual(self.client.delete(path, headers=other).status_code, 404)
        for _ in range(100):
            job = self.client.get(path, headers=self.headers).json()
            if job["status"] == "done":
                break
            time.sleep(.01)
        self.assertEqual(job["result"]["vote"], "human-like")
        self.assertNotIn("raw", job)

    def test_limits_queue_readiness_and_cancellation_are_preserved(self):
        with patch("gateway.MAX_BYTES", 3):
            self.assertEqual(self.submit().status_code, 413)
        self.engine.state = "warming"
        self.assertEqual(self.submit().status_code, 503)
        self.engine.state = "ready"
        self.engine.gate.clear()
        first = self.submit().json()["id"]
        self.assertTrue(self.engine.started.wait(2))
        second = self.submit().json()["id"]
        self.assertEqual(self.submit().status_code, 429)
        for job_id in (first, second):
            response = self.client.delete("/api/voice/jobs/" + job_id, headers=self.headers)
            self.assertEqual(response.status_code, 200)

    def test_per_user_submit_limit(self):
        # Unavailable requests still count; repeated failures cannot hammer the worker.
        self.engine.state = "warming"
        for _ in range(12):
            self.assertEqual(self.submit().status_code, 503)
        self.assertEqual(self.submit().status_code, 429)

    def test_missing_service_secret_fails_closed(self):
        with patch.dict("os.environ", {"TL_MODEL_SERVICE_SECRET": ""}):
            with self.assertRaises(RuntimeError):
                create_gateway(self.engine)


if __name__ == "__main__":
    unittest.main()
