import sys
import os

# Add the backend directory to Python path so absolute imports work
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from backend.app import app

if __name__ == "__main__":
    app.run(debug=True, port=5000)