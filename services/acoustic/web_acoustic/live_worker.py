"""One process / one inference. Busy callers abstain instead of accumulating."""
import json, os, queue, subprocess, sys, threading, uuid
from fastapi import HTTPException
from web_acoustic.config import BASE_DIR
from web_acoustic.process_control import terminate_tree

class LiveWorker:
    def __init__(self):
        self.lock=threading.Lock();self.process=None;self.messages=None;self.info=None;self.owner=None;self.cancelled=threading.Event()
    def _stop(self):
        if self.process:
            if self.process.poll() is None:terminate_tree(self.process)
            self.process.wait(timeout=5)
            self.process.stdin.close();self.process.stdout.close()
        self.process=None;self.info=None
    def _start(self):
        if self.process and self.process.poll() is None:return
        self._stop()
        process=subprocess.Popen([sys.executable,'-m','web_acoustic.worker_live'],cwd=BASE_DIR,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0,start_new_session=os.name!='nt')
        self.process=process;messages=queue.Queue(maxsize=2);self.messages=messages
        def read():
            try:
                while True:
                    line=process.stdout.readline(262145)
                    if not line or len(line)>262144:break
                    messages.put_nowait(json.loads(line))
            except Exception:pass
            finally:
                try:messages.put_nowait({'error':503})
                except queue.Full:pass
        threading.Thread(target=read,daemon=True,name='live-result-reader').start()
        try:
            info=messages.get(timeout=60)
            if info.get('ready') is not True:raise ValueError()
            self.info=info
        except Exception:
            self._stop();raise HTTPException(503,'Live worker failed to start')
    def ready(self):
        if not self.lock.acquire(blocking=False):raise HTTPException(429,'Live inference busy')
        try:self._start();return self.info
        finally:self.lock.release()
    def analyze(self,raw,clean,language,session_id=None):
        if not self.lock.acquire(blocking=False):raise HTTPException(429,'Live inference busy; report an explicit gap')
        self.cancelled.clear();self.owner=session_id
        try:
            self._start();job=str(uuid.uuid4())
            if self.cancelled.is_set():self._stop();raise HTTPException(410,'Call ended before inference')
            self.process.stdin.write(json.dumps({'id':job,'raw':str(raw),'clean':str(clean),'language':language})+'\n');self.process.stdin.flush()
            try:message=self.messages.get(timeout=42)
            except queue.Empty:
                self._stop();raise HTTPException(503,'Live inference deadline exceeded')
            if message.get('id')!=job:
                self._stop();raise HTTPException(503,'Live worker interrupted')
            if 'error' in message:raise HTTPException(message['error'],'Live analysis unavailable for this window')
            return message['result']
        except (BrokenPipeError,OSError):
            self._stop();raise HTTPException(503,'Live worker unavailable')
        finally:self.owner=None;self.lock.release()
    def cancel(self,session_id):
        if self.owner==session_id:
            self.cancelled.set()
            process=self.process
            if process and process.poll() is None:
                try:terminate_tree(process)
                except OSError:pass
    def shutdown(self):
        with self.lock:self._stop()

worker=LiveWorker()
