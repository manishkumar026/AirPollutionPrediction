import sys
import os

# Add the backend directory to the path so we can find app.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import app

if __name__ == "__main__":
    app.run()