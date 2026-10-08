"""Isolated synchronous inference using server-created paths."""
import sys
from web_acoustic.worker_deadline import guard

def work():
    import json
    from web_acoustic.storage_paths import resolve_audio_path
    from web_acoustic.routers.analyze import analyze_file
    from fastapi import HTTPException
    raw, clean, output = (resolve_audio_path(p) for p in sys.argv[1:4])
    language = sys.argv[4]
    if language not in {'auto', 'hi', 'en'}:
        raise ValueError('Unsupported language')
    try:
        result = analyze_file(raw, clean, language)
    except HTTPException as error:
        result = {"error": {"status": error.status_code, "detail": error.detail}}
    with output.open('x', encoding='utf-8') as target:
        json.dump(result, target, ensure_ascii=False)

if __name__ == '__main__':
    guard(60, work)
