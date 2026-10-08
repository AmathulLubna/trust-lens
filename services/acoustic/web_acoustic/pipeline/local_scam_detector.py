"""Offline clause rules. No trained intent or confidence claim."""
import re
import unicodedata
SCAM_KEYWORDS = {}
CATEGORY_WEIGHTS = {"otp_credential":3,"payment_request":3,"approval":3,"isolation_secrecy":2,"emotional_manipulation":1}
def normalize_text(text):
    # Python \\w excludes Indic combining marks; preserve category M explicitly.
    return " ".join("".join(c if c.isalnum() or c.isspace() or unicodedata.category(c).startswith("M") else " " for c in unicodedata.normalize("NFC",text).lower()).split())
def score_transcript(transcript):
    categories={}
    for clause in re.split(r"[.!?।;\n]+|\b(?:but|however|and)\b",unicodedata.normalize("NFC",transcript).lower()):
        if re.search(r"\b(scam|scammer|example|warning|beware|education|lesson)\b|उदाहरण|सावधान|चेतावनी",clause):
            clause=re.sub(r'[“"]([^”"]*)[”"]'," ",clause)
        advice=re.search(r"(?:साझा|बताओ|भेजो)\s+(?:मत|नहीं)\s+(?:करें|करना)|\b(never|do not|don['’]?t|should not|must not)\s+(share|send|give|disclose|transfer|pay|provide)|\b(no need to|not asking (you )?to)\b|(?:ओटीपी|पासवर्ड|पैसे).{0,32}(?:मत|नहीं).{0,16}(?:बताओ|देना|दें|भेज|साझा)|(?:कभी|मत).{0,32}(?:ओटीपी|पासवर्ड).{0,32}(?:साझा|बताओ|बताएं|दें)",clause)
        rules={
          "payment_request":r"\b(send|transfer|pay|wire|deposit)\b.{0,50}(?:\b(money|rupees|payment|funds|upi|rs)\b|₹|\d)|\b(paise|paisa)\b.{0,20}\b(bhejo|bhejiye|transfer)\b|(?:पैसे|पैसा|रुपये|रुपए|राशि).{0,24}(?:भेजो|भेजिए|भेजें|ट्रांसफर|जमा)",
          "otp_credential":r"\b(share|tell|give|send|provide|disclose|enter)\b.{0,40}\b(otp|pin|password|code|card number|bank details|aadhaar)\b|(?:ओटीपी|पिन|पासवर्ड|बैंक विवरण|आधार).{0,24}(?:बताओ|भेजो|दो|दें|साझा)",
          "approval":r"\b(authorize|approve|change)\b.{0,40}\b(beneficiary|payment|transfer|bank account)\b",
        }
        if not advice:
            for category,pattern in rules.items():
                if re.search(pattern,clause):categories[category]=[category.replace("_"," ")]
        if re.search(r"\b(do not|don['’]?t) tell (anyone|them|papa|mom)|\b(keep (it|this) secret|just between us|mat batana)\b|किसी को (?:मत|नहीं) बता|मत बताना|गुप्त रखना",clause):categories["isolation_secrecy"]=["secrecy request"]
        if not advice and re.search(r"\b(urgent|immediately|jaldi|asap|right now|right away)\b|जल्दी|तुरंत|फौरन",clause):categories["emotional_manipulation"]=["urgency pressure"]
    return sum(CATEGORY_WEIGHTS[c] for c in categories),categories,["Contextual warning: "+c for c in categories]
