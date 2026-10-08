"""Bounded, volatile transcript context; never part of the session ledger/export."""
from collections import deque
import re
from web_acoustic.pipeline.local_scam_detector import score_transcript


class ConversationContext:
    def __init__(self):
        self._parts = deque(maxlen=2)
        self._language = None

    def clear(self):
        self._parts.clear()
        self._language = None

    def warnings(self, result, language):
        text = (result.get('transcript') or '').strip()
        if (result.get('contextStatus') != 'available' or not text
                or result['reliability']['status'] != 'usable'):
            self.clear()
            return []
        if language != self._language:
            self.clear()
        self._language = language
        # Up to two preceding 4-second chunks plus this chunk; <= 1202 chars.
        # Joining chunk-edge punctuation allows ASR fragments such as
        # "Please send." + "money now" to trigger a verification warning.
        text = text[:400]
        context = ' '.join([part.rstrip('.!?।; ') for part in self._parts] + [text])
        warnings = set(score_transcript(context)[1])
        # A standalone current request still matters after a completed piece of
        # safety advice. Only an unfinished negator at the boundary can negate
        # a self-contained new request ("Never." + "share your OTP").
        previous = self._parts[-1].rstrip('.!?।; ').lower() if self._parts else ''
        pending_negation = re.search(r"(?:\bnever|\bdo not|\bdon['’]?t|\bmust not|\bshould not|\bnot asking you to|मत|नहीं)$", previous)
        if not pending_negation:
            warnings.update(score_transcript(text)[1])
        self._parts.append(text)
        return sorted(warnings)
