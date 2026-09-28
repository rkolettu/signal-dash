import os
import sys

# Tests import backend modules the way app.py does (import db, from analysis import ...).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
