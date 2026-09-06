"""Explicit stock/company mention extraction.

Two match classes only (per spec -- no indirect references):
  1. Cashtags / bare tickers: $TSLA always; bare AAPL only if in ticker set
     AND not a common English word (whitelist approach for bare tickers).
  2. Company names from SEC's public company_tickers.json, normalized
     (strip Inc/Corp/Co/Ltd suffixes), matched on word boundaries.
"""
import json, os, re, urllib.request

SEC_URL = "https://www.sec.gov/files/company_tickers.json"
CACHE = os.path.join(os.path.dirname(__file__), "sec_tickers.json")
UA = {"User-Agent": "signal-dash research tool (contact: you@example.com)"}

# Bare tickers that collide with English words -- require $ prefix for these.
AMBIGUOUS = {"A","ALL","AN","ANY","ARE","BE","BIG","BY","CAN","CAR","CAT","DD",
             "FOR","FUN","GO","GOOD","HAS","HE","IT","LOVE","LOW","MAIN","MAN",
             "NEXT","NICE","NOW","ON","ONE","OPEN","OR","OUT","PLAY","REAL",
             "RUN","SEE","SO","SAFE","TELL","TWO","UP","WELL","YOU","EAT","BEST",
             "TRUE","LIFE","EVER","FAST","FREE","HUGE","JOB","PAY","BIG"}

# Minimal fallback if SEC fetch fails (offline dev).
FALLBACK = {
    "TSLA": "Tesla", "AAPL": "Apple", "MSFT": "Microsoft", "NVDA": "NVIDIA",
    "AMZN": "Amazon", "GOOGL": "Alphabet", "META": "Meta Platforms",
    "F": "Ford Motor", "GM": "General Motors", "BA": "Boeing",
    "XOM": "Exxon Mobil", "CVX": "Chevron", "JPM": "JPMorgan Chase",
    "DJT": "Trump Media & Technology", "INTC": "Intel", "PLTR": "Palantir",
    "LMT": "Lockheed Martin", "RTX": "RTX", "PFE": "Pfizer", "WMT": "Walmart",
}

_SUFFIX = re.compile(r"\b(inc|corp|corporation|company|co|ltd|plc|holdings?|group|technologies|technology)\b\.?", re.I)

def _normalize_name(name: str) -> str:
    name = re.sub(r"[^\w\s&]", " ", name)
    name = _SUFFIX.sub(" ", name)
    return re.sub(r"\s+", " ", name).strip().lower()

_universe = None  # {ticker: company}, {normalized_name: (ticker, company)}

def load_universe():
    global _universe
    if _universe:
        return _universe
    data = None
    if os.path.exists(CACHE):
        data = json.load(open(CACHE))
    else:
        try:
            req = urllib.request.Request(SEC_URL, headers=UA)
            data = json.loads(urllib.request.urlopen(req, timeout=15).read())
            json.dump(data, open(CACHE, "w"))
        except Exception:
            data = None
    tickers, names = {}, {}
    if data:
        for row in data.values():
            t, n = row["ticker"].upper(), row["title"]
            tickers[t] = n
            norm = _normalize_name(n)
            if len(norm) >= 4:  # skip ultra-short normalized names
                names[norm] = (t, n)
    else:
        for t, n in FALLBACK.items():
            tickers[t] = n
            names[_normalize_name(n)] = (t, n)
    _universe = (tickers, names)
    return _universe

_CASHTAG = re.compile(r"\$([A-Za-z]{1,5})\b")
_BAREWORD = re.compile(r"\b([A-Z]{2,5})\b")

def extract(text: str):
    """Return list of {ticker, company, match_text}. Explicit mentions only."""
    tickers, names = load_universe()
    found, seen = [], set()

    def add(t, c, m):
        if t not in seen:
            seen.add(t)
            found.append({"ticker": t, "company": c, "match_text": m})

    for m in _CASHTAG.finditer(text):
        t = m.group(1).upper()
        if t in tickers:
            add(t, tickers[t], m.group(0))

    for m in _BAREWORD.finditer(text):
        t = m.group(1)
        if t in tickers and t not in AMBIGUOUS:
            add(t, tickers[t], t)

    low = " " + _normalize_name(text) + " "
    for norm, (t, c) in names.items():
        if f" {norm} " in low:
            add(t, c, norm)
    return found
