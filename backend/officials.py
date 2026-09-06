"""Tracked officials registry.

Fill in real handles before running live ingestion. Verify each handle
manually -- impersonation accounts are common. `truth` = Truth Social
username, `x` = X username. None = don't poll that platform.
"""

OFFICIALS = [
    # role is informational only; polling keys off handles.
    {"name": "President",              "role": "President",             "truth": "realDonaldTrump", "x": None},
    {"name": "Vice President",         "role": "Vice President",        "truth": None,              "x": "VP"},
    {"name": "Secretary of State",     "role": "State",                 "truth": None,              "x": "SecRubio"},
    {"name": "Secretary of Treasury",  "role": "Treasury",              "truth": None,              "x": None},
    {"name": "Secretary of Defense",   "role": "Defense",               "truth": None,              "x": None},
    {"name": "Attorney General",       "role": "Justice",               "truth": None,              "x": None},
    {"name": "Secretary of Commerce",  "role": "Commerce",              "truth": None,              "x": None},
    # ... add remaining Cabinet members. Keep list current -- Cabinet
    # composition changes; re-verify quarterly.
]

def by_platform(platform: str):
    key = "truth" if platform == "truth_social" else "x"
    return [(o["name"], o[key]) for o in OFFICIALS if o.get(key)]
