"""Start the local companion, or reopen it when it is already running."""
import threading
import time
import webbrowser

import httpx

URL = "http://127.0.0.1:8765"


def service_running():
    try:
        response = httpx.get(URL + "/api/voice/health", timeout=2, trust_env=False)
        return response.status_code == 200 and response.json().get("service") == "trustlens-local-voice"
    except (httpx.HTTPError, ValueError):
        return False


def main():
    if service_running():
        webbrowser.open(URL + "/pair")
        return
    def open_when_ready():
        for _ in range(30):
            if service_running():
                webbrowser.open(URL + "/pair")
                return
            time.sleep(1)
    threading.Thread(target=open_when_ready, daemon=True).start()
    import uvicorn
    print("VoiceSentinel pairing page: " + URL + "/pair", flush=True)
    print("Copy the pairing key from that page into TrustLens on port 5173.", flush=True)
    print("Keep this window open. Press Ctrl+C to stop. First model load may take a few minutes.")
    uvicorn.run("local_service:app", host="127.0.0.1", port=8765, access_log=False)


if __name__ == "__main__":
    main()
