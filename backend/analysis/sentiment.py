"""VADER sentiment + promotional-language detection.

flag = has_mention AND (compound >= 0.25 OR promotional phrase present).
VADER handles caps/exclamation/emoji well for social text. Swap in a
fine-tuned DistilBERT later behind the same score() interface if accuracy
on your labeled sample dips below target.
"""
import re
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_analyzer = SentimentIntensityAnalyzer()

PROMO = re.compile(r"\b(" + "|".join([
    "buy(?:ing)?", "bullish", "great (?:product|company|stock)",
    "highly recommend", "recommend", "leading company", "best in class",
    "record (?:profits|earnings|high)", "soaring", "booming", "winner",
    "invest(?:ing)? in", "going up", "to the moon", "undervalued",
    "amazing (?:company|product)", "incredible (?:company|product)",
]) + r")\b", re.I)

POSITIVE_THRESHOLD = 0.25

def score(text: str) -> float:
    return _analyzer.polarity_scores(text)["compound"]

def is_promotional(text: str) -> bool:
    return bool(PROMO.search(text))

def should_flag(text: str, has_mention: bool, compound: float) -> bool:
    if not has_mention:
        return False
    return compound >= POSITIVE_THRESHOLD or is_promotional(text)
