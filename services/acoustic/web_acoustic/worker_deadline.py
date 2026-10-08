"""Self-expiry also bounds an inference worker orphaned by a parent crash."""
import os
import threading

def arm_deadline(seconds):
    deadline = threading.Timer(seconds, lambda: os._exit(124))
    deadline.daemon = True
    deadline.start()
    return deadline

def guard(seconds, callback):
    deadline = threading.Timer(seconds, lambda: os._exit(124))
    deadline.daemon = True
    deadline.start()
    try:
        return callback()
    finally:
        deadline.cancel()
