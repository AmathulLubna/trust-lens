"""Start the gateway and a no-account tunnel; optionally configure Convex.

This never deploys code, publishes the frontend, or downloads model files.
"""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlparse

import httpx

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LOCAL_URL = "http://127.0.0.1:8766"


def service_secret():
    value = os.environ.get("TL_MODEL_SERVICE_SECRET")
    if value:
        return value
    runtime = HERE / "runtime"
    runtime.mkdir(exist_ok=True)
    config = runtime / "service.json"
    if config.exists():
        return json.loads(config.read_text())["secret"]
    value = secrets.token_urlsafe(48)
    config.write_text(json.dumps({"secret": value}) + "\n", encoding="utf-8")
    return value


def sync_convex(url, secret, production=False, deployment=None):
    cli = ROOT / "node_modules/convex/bin/main.js"
    node = shutil.which("node")
    if not node or not cli.is_file():
        raise RuntimeError("Run npm ci in the project root and install Node before syncing Convex.")
    runtime = HERE / "runtime"
    runtime.mkdir(exist_ok=True)
    # A file keeps the credential out of process arguments and console output.
    filename = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".env", dir=runtime, delete=False, encoding="utf-8") as stream:
            filename = Path(stream.name)
            stream.write(f"TL_MODEL_URL={url}\nTL_MODEL_SERVICE_SECRET={secret}\n")
        command = [node, str(cli), "env", "set", "--from-file", str(filename)]
        if deployment:
            command.extend(["--deployment", deployment])
        elif production:
            command.append("--prod")
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=90)
        if result.returncode:
            raise RuntimeError("Convex environment sync failed. Check CLI sign-in and access to the selected deployment.")
    finally:
        if filename:
            filename.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sync = parser.add_mutually_exclusive_group()
    sync.add_argument("--sync-prod", action="store_true", help="Update the two model variables on production Convex")
    sync.add_argument("--sync-dev", action="store_true", help="Update the two model variables on development Convex")
    sync.add_argument("--deployment", help="Sync an explicit deployment, e.g. team:project:production, without changing .env.local")
    parser.add_argument("--url", help="Use an existing HTTPS tunnel instead of starting a temporary Quick Tunnel")
    args = parser.parse_args()
    if args.url:
        parsed = urlparse(args.url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
            parser.error("--url must be an HTTPS origin without a path or credentials")
    cloudflared = shutil.which("cloudflared")
    if not args.url and not cloudflared:
        parser.error("Install cloudflared first: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
    model = ROOT / "ml/voice_sentinel/downloads/v4-augmented/VoiceSentinel_Model/model.safetensors"
    if not model.is_file():
        parser.error("The existing v4 model is missing; see ../ml/voice_sentinel/LOCAL_WEB_DEMO.md. No model files are copied here.")
    secret = service_secret()
    if len(secret) < 32 or not secret.isascii() or any(c.isspace() for c in secret):
        parser.error("The service credential must be at least 32 ASCII characters without whitespace.")
    children = []
    gateway = None
    try:
        # Refuse to reuse an unknown or older process on our dedicated port.
        import socket
        with socket.socket() as probe:
            if probe.connect_ex(("127.0.0.1", 8766)) == 0:
                raise RuntimeError("Port 8766 is already in use. Stop the previous gateway first.")
        env = {**os.environ, "TL_MODEL_SERVICE_SECRET": secret}
        gateway = subprocess.Popen([
            sys.executable, "-m", "uvicorn", "gateway:create_gateway", "--factory",
            "--app-dir", str(HERE), "--host", "127.0.0.1", "--port", "8766", "--no-access-log",
        ], cwd=ROOT, env=env)
        children.append(gateway)
        headers = {"Authorization": "Bearer " + secret, "X-TrustLens-User": "launcher"}
        for _ in range(60):
            if gateway.poll() is not None:
                raise RuntimeError("Gateway failed to start. Check the error above.")
            try:
                with httpx.Client(trust_env=False, timeout=2) as client:
                    response = client.get(LOCAL_URL + "/api/voice/health", headers=headers)
                    if response.status_code == 200:
                        break
            except httpx.HTTPError:
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Gateway did not become reachable in time.")
        url = args.url
        tunnel = None
        if not url:
            discovered = []
            ready = threading.Event()
            tunnel = subprocess.Popen([
                cloudflared, "tunnel", "--url", LOCAL_URL,
            ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
            children.append(tunnel)

            def read_tunnel():
                for line in tunnel.stdout:
                    match = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
                    if match and not discovered:
                        discovered.append(match[0])
                        ready.set()
                ready.set()

            threading.Thread(target=read_tunnel, daemon=True).start()
            if not ready.wait(45) or not discovered:
                raise RuntimeError("Could not establish a Quick Tunnel. Check the network and cloudflared installation.")
            url = discovered[0]
        print("Shared detector endpoint: " + url, flush=True)
        if args.sync_prod or args.sync_dev or args.deployment:
            sync_convex(url, secret, args.sync_prod, args.deployment)
            print("Model connection configured on " + (args.deployment or ("production" if args.sync_prod else "development")) + " Convex.", flush=True)
        else:
            print("Convex was not changed. Restart with --sync-dev or --sync-prod to configure its connection.", flush=True)
        print("Keep this process running and the laptop awake. No user pairing key is required.", flush=True)
        print("A Quick Tunnel is for testing and has a changing URL and no uptime guarantee.", flush=True)
        while gateway.poll() is None and (tunnel is None or tunnel.poll() is None):
            time.sleep(1)
        raise RuntimeError("The gateway or tunnel stopped. Restart the launcher to reconnect.")
    except KeyboardInterrupt:
        print("Stopping the shared detector.")
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
