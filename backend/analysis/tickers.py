"""Explicit stock/company mention extraction.

Two match classes only (per spec -- no indirect references):
  1. Cashtags / bare tickers: $TSLA always; bare AAPL only if in ticker set
     AND not a common English word or abbreviation (AMBIGUOUS). Two-letter
     bare tickers only for a short list (BARE_TWO_LETTER).
  2. Company names from SEC's public company_tickers.json, normalized
     (strip Inc/Corp/Co/Ltd suffixes), matched on word boundaries.
     Names are proper nouns, so a one-word name must appear capitalized
     ("Tesla", "TESLA"), and one-word names that are everyday words
     ("bullish" -> Bullish, "team" -> Team Inc.) never match on the name
     alone -- they need a cashtag or bare ticker.
"""
import json, os, re, urllib.request

SEC_URL = "https://www.sec.gov/files/company_tickers.json"
CACHE = os.path.join(os.path.dirname(__file__), "sec_tickers.json")
UA = {"User-Agent": "signal-dash research tool (contact: you@example.com)"}

# Bare tickers that are also everyday words or abbreviations need a $ prefix:
# "HELP IS ON THE WAY" (WAY), "ICE agents" (ICE), "the DOW" (DOW), "NOV 5"
# (NOV). Reviewed by hand from the SEC tickers that appear in a common-English
# word list, plus government and news abbreviations and the all-caps words of
# political posts. Brands whose ticker mostly means the company (EBAY, IBM,
# CVS, META, FOX, NYT) are left matchable, and company names still match.
AMBIGUOUS = frozenset("""
    ACA ACM ACRE ACT ADAM AERO AGO AIM AIR AKA ALL ALLY ALPS ALT ALTO AMP ANNA ANY
    API APP APPS APT ARE ARM ASH ATI ATOM AURA BALL BAND BAR BARK BEAM BEAT BEN BEST
    BETA BID BIG BILL BIO BIRD BIT BMI BOC BOIL BOLD BOLT BON BOOM BOOT BOT BOW BOX
    BRO BROS BUD BULL CAKE CAL CALM CAMP CAN CANE CAPS CAR CARD CARE CARL CARS CART
    CASH CAST CAT CCD CDNA CDT CENT CERT CET CFR CHAD CHAR CHEF CHI CHOW CIA CMS
    CNET COCO COIN COKE COLD COMP CON COO COOK COP CORN COST CPA CPS CSV CUB CUBE
    CUE CURB CYAN DAN DARE DASH DAVE DBA DEA DEC DECK DEI DINO DNA DOC DOCS DOUG DOW
    DRUG DSC DSL DULL DUO EARN EAT ECHO ECO EDIT EDU EGG EGO ELF ELLA EMMA EMO
    ENT EOS ERIC ERIE ESQ EVER EXE EXP EXPO EYE EZRA FACT FAST FATE FAX FEED FIG
    FIGS FINS FIT FIVE FIX FLEX FLUX FLY FOIL FOR FORM FORTY FOUR FREE FROG FUN FUND
    FURY FUSE GAIN GAME GAP GEL GEN GEO GIFT GIS GLAD GLUE GOLD GOLF GOOD GRAB GROW
    GSM GUT GUTS HALO HAS HAWK HELP HERE HHS HIT HOG HON HOOD HOPE HOST HOUR HUGE
    HUM HUT ICE ICON IDE III INN IONS IRON IRS IVF JACK JAN JAZZ JILL JOB JOE KAI
    KEN KEY KEYS KIDS KIM LAB LAKE LAND LAW LEE LEGO LEN LEO LEU LIEN LIFE LIME LINE
    LINK LION LITE LIVE LNG LOAN LOOP LOT LOVE LOW LUCK LUCY LUNG LUV LYNX MAC MAIN
    MAMA MAN MAPS MAR MAS MASK MASS MAT MATH MAX MAZE MED MENS MESH MET MFG MIN MIND
    MINE MIST MOB MOD MOVE MSM MSN MTA MUZE NANO NAT NATL NEO NEON NET NEXT NHS NICE
    NINE NOAH NOTE NOV NOW NRC NWS NYC OCC ODD ONE ONTO OPAL OPEN OUT OWL OWLS PAC
    PACK PAL PAM PAR PARA PARK PATH PAY PAYS PCT PDT PEG PEN PENN PEP PETS PGP PHD
    PHI PHYS PICS PINE PINS PLAY PLUG PLUS POET POLE PONY POOL POR POST PPC PRE PROF
    PROP PSA PTY PUMP PURE QUAD RACE RAIL RAIN RAMP RAND RARE RAVE REAL REED REF REG
    RELY RENT RES REX RICK RIG RIO RIOT RNA ROAD ROCK ROMA ROOT RPM RUM RUN RYAN
    SAFE SAIL SAM SAN SAT SAY SCI SEAT SEE SEED SELF SER SHIP SHOE SHOP SHOT SIG SIM
    SITE SKIN SKY SNAP SNOW SOAR SOC SON SONG SOS SOUL SPOT SPY SRI SSL STAG STE
    STEM STEP STEW STUB SUCH SUN SUNS SWIM TACO TAGS TAP TASK TEAM TECH TEL TELL TEN
    TEX TIL TILE TMP TOON TOP TOPS TOUR TREE TREO TRI TRIP TRUE TWIN TWO TXT UNIT
    UPC URI USA USB VAL VAT VEST VET VIA VIDA VII VIP WAL WASH WATT WAVE WAY WELL
    WEST WING WIT WOLF WRAP WTF WWW YOU YUM ZION ZIP ZONE
""".split())

# Two capital letters are nearly always an abbreviation (AM, PM, US, UK, TX,
# AI, TV), so a two-letter ticker needs a cashtag unless it is one of these.
BARE_TWO_LETTER = frozenset({"BA", "GE", "GM"})

# One-word company names (after suffix stripping) that are everyday words,
# or common first names / place names, in posts by officials. Matching them
# on the name alone produces far more false positives than real mentions,
# so they need a cashtag or bare ticker instead ($BLSH, $TISI). Reviewed by
# hand from the SEC names that appear in a common-English word list; brands
# whose name mostly means the company (Apple, Intel, Oracle, Target, Shell)
# are left matchable.
COMMON_WORD_NAMES = {
    "align", "alpha", "amaze", "angle", "authentic", "awareness", "ball", "bandwidth",
    "banner", "beta", "bill", "block", "booking", "brunswick", "bullish",
    "cheer", "citizens", "city", "click", "cluster", "coffee", "crown",
    "crypto", "dana", "decent", "dover", "eastern", "emerging", "employers",
    "enhanced", "flex", "fold", "forge", "fort", "fossil", "founder",
    "freedom", "freight", "frequency", "frontier", "genius", "global", "glow",
    "grab", "graham", "gravity", "hammer", "happen", "harmonic", "hello",
    "here", "highway", "honest", "icon", "innovate", "integer",
    "intelligent", "interface", "joint", "lindsay", "lion", "lotus",
    "madison", "maiden", "marcus", "match", "mind", "minerals", "mint",
    "morgan", "nasdaq", "navigator", "news", "next", "nice", "noble", "nova",
    "opera", "orange", "outdoor", "paid", "pattern", "people", "perfect",
    "poet", "pool", "popular", "post", "priority", "reliability",
    "reliance", "rogers", "root", "seek", "senior", "snap", "sound",
    "southern", "star", "stem", "strategy", "team", "tiny", "track", "tyler",
    "vertex", "viking", "visa", "visionary", "weed", "winners", "wise",
    "wrap",
}

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
    rows = [(r["ticker"], r["title"]) for r in data.values()] if data else list(FALLBACK.items())
    _universe = build_universe(rows)
    return _universe

def _is_share_class(ticker: str) -> bool:
    """Preferred shares, notes and share classes: BA-PA, F-PD, BRK.B."""
    return "-" in ticker or "." in ticker

def build_universe(rows):
    """rows: (ticker, title) pairs in SEC file order.

    Several SEC rows can share an issuer's title (BOEING CO is both BA and
    BA-PA). The file lists rows by market value, so the first row for a name
    is normally the common stock; a plain ticker also always wins over a
    share-class one, in case the order ever differs.
    """
    tickers, names = {}, {}
    for t, n in rows:
        t = t.upper()
        tickers.setdefault(t, n)
        norm = _normalize_name(n)
        if len(norm) < 4:  # skip ultra-short normalized names
            continue
        prev = names.get(norm)
        if prev is None or (_is_share_class(prev[0]) and not _is_share_class(t)):
            names[norm] = (t, n)
    return tickers, names

_CASHTAG = re.compile(r"\$([A-Za-z]{1,5})\b")
_BAREWORD = re.compile(r"\b([A-Z]{2,5})\b")
_WORD = re.compile(r"[\w&]+")

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
        if t in tickers and t not in AMBIGUOUS and (len(t) > 2 or t in BARE_TWO_LETTER):
            add(t, tickers[t], t)

    low = " " + _normalize_name(text) + " "
    # Words written as proper nouns: "Tesla", "TESLA" (not "tesla").
    capitalized = {w.lower() for w in _WORD.findall(text) if w[0].isupper()}
    for norm, (t, c) in names.items():
        if " " in norm:
            if f" {norm} " in low:
                add(t, c, norm)
        elif norm in capitalized and norm not in COMMON_WORD_NAMES:
            add(t, c, norm)
    return found
