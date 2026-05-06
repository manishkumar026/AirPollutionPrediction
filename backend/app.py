from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
from api.fetch_data import PollutionDataFetcher
from api.config import PORT, HOST, DEBUG
import os

app = Flask(
    __name__,
    static_folder="../frontend",
    template_folder="../frontend"
)
CORS(app)

# Initialize data fetcher
fetcher = PollutionDataFetcher()

# ====== STATIC FILES ======
@app.route("/")
def index():
    return send_from_directory("../frontend", "index.html")

@app.route("/js/<path:filename>")
def js_files(filename):
    return send_from_directory("../frontend/js", filename)

@app.route("/css/<path:filename>")
def css_files(filename):
    return send_from_directory("../frontend/css", filename)

@app.route("/data/<path:filename>")
def data_files(filename):
    return send_from_directory("../frontend/data", filename)

# ====== API ENDPOINTS ======
@app.route("/api/pollution", methods=["GET"])
def get_pollution():
    """Get current pollution data"""
    try:
        lat = request.args.get('lat', 28.6139, type=float)
        lon = request.args.get('lon', 77.2090, type=float)
        data = fetcher.get_current_pollution_enhanced(lat, lon)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/forecast", methods=["GET"])
def get_forecast():
    """Get pollution forecast"""
    try:
        lat = request.args.get('lat', 28.6139, type=float)
        lon = request.args.get('lon', 77.2090, type=float)
        hours = request.args.get('hours', 24, type=int)
        data = fetcher.get_pollution_forecast(lat, lon, hours)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/weather", methods=["GET"])
def get_weather():
    """Get weather data"""
    try:
        lat = request.args.get('lat', 28.6139, type=float)
        lon = request.args.get('lon', 77.2090, type=float)
        data = fetcher.get_weather_data(lat, lon)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/all", methods=["GET"])
def get_all_data():
    """Get all data (pollution, weather, forecast)"""
    try:
        lat = request.args.get('lat', 28.6139, type=float)
        lon = request.args.get('lon', 77.2090, type=float)
        data = fetcher.get_all_data(lat, lon)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/geocode", methods=["GET"])
def geocode():
    """Geocode city name to coordinates"""
    try:
        city = request.args.get('city', '')
        if not city:
            return jsonify({"status": "error", "message": "City name required"}), 400
        data = fetcher.geocode_city(city)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "ok", "message": "Backend is running"})

# ====== ERROR HANDLERS ======
@app.errorhandler(404)
def not_found(e):
    return jsonify({"status": "error", "message": "Endpoint not found"}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"status": "error", "message": "Internal server error"}), 500

# ====== MAIN ======
if __name__ == "__main__":
    print(f"🌍 Starting AirWatch Pro Backend...")
    print(f"📍 HOST: {HOST} | PORT: {PORT} | DEBUG: {DEBUG}")
    app.run(host=HOST, port=PORT, debug=DEBUG)