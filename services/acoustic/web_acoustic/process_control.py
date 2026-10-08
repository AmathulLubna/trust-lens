"""Terminate only a subprocess tree created by this service."""
import os,signal,subprocess

def terminate_tree(process):
    if process.poll() is not None:return
    if os.name=='nt':
        # Decoder descendants must also release private temporary files.
        try:subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
        except (OSError,subprocess.TimeoutExpired):pass
    else:
        try:os.killpg(process.pid,signal.SIGKILL)
        except ProcessLookupError:pass
    if process.poll() is None:process.kill()
    process.wait(timeout=5)
