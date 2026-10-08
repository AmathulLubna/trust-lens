"""Reserved private spool; bounded orphan cleanup never scans case recordings."""
import os,re,time
from pathlib import Path
from web_acoustic.config import STORAGE_DIR

def root():
    value=(STORAGE_DIR/'live-demo-spool').resolve()
    value.mkdir(parents=True,exist_ok=True)
    return value

def cleanup():
    base=root()
    for path in base.iterdir():
        if not re.fullmatch(r'window-[a-z0-9_]+',path.name) or path.is_symlink() or not path.is_dir():continue
        resolved=path.resolve()
        if not resolved.is_relative_to(base) or time.time()-resolved.stat().st_mtime<120:continue
        # Only our exact files are deletable; unexpected content is never removed.
        children=list(resolved.iterdir())
        if any(p.name not in {'remote.wav','clean.wav'} or p.is_symlink() or not p.is_file() for p in children):continue
        for child in children:
            if not child.resolve().is_relative_to(base):raise ValueError('Unsafe live spool')
            child.unlink(missing_ok=True)
        resolved.rmdir()
