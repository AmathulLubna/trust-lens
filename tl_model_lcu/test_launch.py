"""Check configuration sync without contacting Convex or starting a tunnel."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import launch


class LauncherTests(unittest.TestCase):
    def test_generated_service_secret_is_reused_without_copying_models(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(launch, "HERE", Path(directory)), patch.dict("os.environ", {"TL_MODEL_SERVICE_SECRET": ""}):
                first = launch.service_secret()
                self.assertGreaterEqual(len(first), 32)
                self.assertEqual(launch.service_secret(), first)
                self.assertEqual([p.name for p in Path(directory).iterdir()], ["runtime"])

    def test_production_sync_uses_temporary_env_file_and_removes_it(self):
        secret = "private-test-secret-" + "x" * 32
        files = []

        def fake_run(command, **kwargs):
            self.assertIn("--prod", command)
            self.assertNotIn(secret, " ".join(command))
            path = Path(command[command.index("--from-file") + 1])
            files.append(path)
            self.assertIn("TL_MODEL_URL=https://test.trycloudflare.com", path.read_text())
            self.assertIn("TL_MODEL_SERVICE_SECRET=" + secret, path.read_text())
            return subprocess.CompletedProcess(command, 0)

        with tempfile.TemporaryDirectory() as directory:
            with patch.object(launch, "HERE", Path(directory)), patch.object(launch.subprocess, "run", side_effect=fake_run):
                launch.sync_convex("https://test.trycloudflare.com", secret, True)
                self.assertTrue(files)
                self.assertFalse(files[0].exists())

    def test_failed_sync_also_removes_the_credential_file(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(launch, "HERE", Path(directory)), patch.object(launch.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)):
                with self.assertRaisesRegex(RuntimeError, "sync failed"):
                    launch.sync_convex("https://test.trycloudflare.com", "x" * 48, False)
                self.assertEqual(list((Path(directory) / "runtime").iterdir()), [])


if __name__ == "__main__":
    unittest.main()
