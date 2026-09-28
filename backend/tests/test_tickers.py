import os

import pytest

from analysis import tickers

# A slice of SEC company_tickers.json, in the file's order (by market value):
# an issuer's common stock comes before its preferreds and notes.
SEC_ROWS = [
    ("TSLA", "Tesla, Inc."),
    ("PLTR", "Palantir Technologies Inc."),
    ("BA", "BOEING CO"),
    ("LMT", "LOCKHEED MARTIN CORP"),
    ("F", "FORD MOTOR CO"),
    ("BLSH", "Bullish"),
    ("TISI", "TEAM INC"),
    ("BA-PA", "BOEING CO"),
    ("F-PB", "FORD MOTOR CO"),
    ("F-PD", "FORD MOTOR CO"),
]


@pytest.fixture
def universe(monkeypatch):
    monkeypatch.setattr(tickers, "_universe", tickers.build_universe(SEC_ROWS))


def found(text):
    return [m["ticker"] for m in tickers.extract(text)]


def test_cashtag(universe):
    assert found("$PLTR") == ["PLTR"]


def test_company_name(universe):
    assert found("Palantir") == ["PLTR"]


def test_common_words_do_not_match(universe):
    text = "Met with the Tesla team today -- bullish on what they're building for America."
    assert found(text) == ["TSLA"]


def test_common_words_do_not_match_in_caps(universe):
    assert found("GREAT TEAM! BULLISH ON AMERICA!") == []


def test_ambiguous_bare_tickers_need_a_cashtag(monkeypatch):
    rows = SEC_ROWS + [("TEAM", "Atlassian Corp"), ("USA", "Liberty All Star Equity Fund"), ("GOLD", "Barrick Mining Corp")]
    monkeypatch.setattr(tickers, "_universe", tickers.build_universe(rows))
    assert found("GREAT TEAM! GOD BLESS THE USA! GOLD STANDARD!") == []
    assert found("$TEAM and $GOLD") == ["TEAM", "GOLD"]


def test_everyday_word_tickers_need_a_cashtag(monkeypatch):
    rows = SEC_ROWS + [
        ("WAY", "Waystar Holding Corp."),
        ("ICE", "Intercontinental Exchange, Inc."),
        ("DOW", "DOW INC."),
        ("NOV", "NOV Inc."),
    ]
    monkeypatch.setattr(tickers, "_universe", tickers.build_universe(rows))
    assert found("HELP IS ON THE WAY!") == []
    assert found("THANK YOU ICE! THE DOW IS AT A RECORD HIGH. SEE YOU NOV 5!") == []
    assert found("$WAY and $ICE") == ["WAY", "ICE"]


def test_two_letter_tickers_need_a_cashtag(monkeypatch):
    rows = SEC_ROWS + [
        ("AI", "C3.ai, Inc."),
        ("UK", "Ucommune International Ltd"),
        ("TX", "Ternium S.A."),
        ("PM", "Philip Morris International Inc."),
        ("GM", "General Motors Co"),
    ]
    monkeypatch.setattr(tickers, "_universe", tickers.build_universe(rows))
    assert found("AI jobs are coming to TX, not the UK. Rally at 7 PM!") == []
    assert found("$AI") == ["AI"]
    # A short list of well-known two-letter tickers still match bare.
    assert found("GM and BA are hiring") == ["GM", "BA"]


def test_brand_tickers_still_match_bare(monkeypatch):
    rows = SEC_ROWS + [("IBM", "INTERNATIONAL BUSINESS MACHINES CORP"), ("CVS", "CVS HEALTH Corp")]
    monkeypatch.setattr(tickers, "_universe", tickers.build_universe(rows))
    assert found("IBM and CVS") == ["IBM", "CVS"]


def test_common_word_names_still_match_by_cashtag(universe):
    assert found("$BLSH and $TISI") == ["BLSH", "TISI"]


def test_name_prefers_common_stock(universe):
    assert found("Boeing") == ["BA"]


def test_ford_motor_is_common_stock_only(universe):
    assert found("Ford Motor") == ["F"]


def test_share_class_never_beats_common_stock():
    # Even if a preferred row came first, the plain ticker wins the name.
    _, names = tickers.build_universe([("BA-PA", "BOEING CO"), ("BA", "BOEING CO")])
    assert names["boeing"][0] == "BA"


def test_single_word_names_must_be_capitalized(universe):
    assert found("TESLA is great") == ["TSLA"]
    assert found("just bought a tesla") == []


def test_multi_word_names_unchanged(universe):
    assert found("lockheed martin wins the contract") == ["LMT"]


@pytest.mark.skipif(not os.path.exists(tickers.CACHE), reason="SEC ticker list not cached")
def test_real_sec_list(monkeypatch):
    monkeypatch.setattr(tickers, "_universe", None)
    assert found("Boeing") == ["BA"]
    assert found("Ford Motor") == ["F"]
    assert found("Met with the Tesla team today -- bullish on what they're building for America.") == ["TSLA"]
    assert found("HELP IS ON THE WAY!") == []
    assert found("THANK YOU ICE! THE DOW IS AT A RECORD HIGH. NO MORE DEI AT THE IRS!") == []
    assert found("AI jobs are coming to TX. Rally in Phoenix, AZ at 7 PM ET!") == []
    assert found("Big meeting at 2 PM with the CEO of GM.") == ["GM"]
