# ================================================
# FLASK SERVER - MAIN FILE
# ================================================

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
import traceback
import sys
import os

# Add backend folder to path
sys.path.insert(0, os.path.dirname(__file__))

from api.config     import DEBUG, HOST, PORT, DEFAULT_LAT, DEFAULT_LON
from api.fetch_data import PollutionDataFetcher
from model.predict  import AQIPredictor

# ---- CREATE APP ----
app       = Flask(__name__)
CORS(app)

# ---- CREATE INSTANCES ----
fetcher   = PollutionDataFetcher()
predictor = AQIPredictor()


# ================================================
# HELPER
# ================================================
def err(msg, code=500):
    return jsonify({"status": "error", "message": msg}), code


# ================================================
# ROUTES
# ================================================

@app.route("/")
def home():
    return jsonify({
        "app":     "Air Pollution Prediction API",
        "version": "2.0",
        "status":  "running",
        "time":    datetime.now().isoformat(),
    })


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "time":   datetime.now().isoformat(),
    })


@app.route("/api/current-pollution")
def current_pollution():
    try:
        lat  = float(request.args.get("lat", DEFAULT_LAT))
        lon  = float(request.args.get("lon", DEFAULT_LON))
        data = fetcher.get_current_pollution_enhanced(lat, lon)
        return jsonify(data)
    except Exception as e:
        return err(str(e))


@app.route("/api/forecast")
def forecast():
    try:
        lat   = float(request.args.get("lat",   DEFAULT_LAT))
        lon   = float(request.args.get("lon",   DEFAULT_LON))
        hours = int(  request.args.get("hours", 24))
        data  = fetcher.get_pollution_forecast(lat, lon, hours)
        return jsonify(data)
    except Exception as e:
        return err(str(e))


@app.route("/api/weather")
def weather():
    try:
        lat  = float(request.args.get("lat", DEFAULT_LAT))
        lon  = float(request.args.get("lon", DEFAULT_LON))
        data = fetcher.get_weather_data(lat, lon)
        return jsonify(data)
    except Exception as e:
        return err(str(e))


@app.route("/api/geocode")
def geocode():
    try:
        city = request.args.get("city", "Delhi")
        data = fetcher.geocode_city(city)
        return jsonify(data)
    except Exception as e:
        return err(str(e))


@app.route("/api/dashboard-data")
def dashboard_data():
    try:
        lat = float(request.args.get("lat", DEFAULT_LAT))
        lon = float(request.args.get("lon", DEFAULT_LON))

        # Fetch live data
        pollution = fetcher.get_current_pollution_enhanced(lat, lon)
        weather   = fetcher.get_weather_data(lat, lon)
        forecast  = fetcher.get_pollution_forecast(lat, lon, 24)

        # Build prediction input
        pred_input = {
            "hour":        datetime.now().hour,
            "month":       datetime.now().month,
            "day_of_week": datetime.now().weekday(),
            "temperature": 25,
            "humidity":    60,
            "wind_speed":  5,
            "pressure":    1013,
            "prev_pm25":   50,
            "prev_pm10":   80,
            "prev_no2":    30,
            "prev_o3":     40,
            "prev_co":     800,
        }

        # Update from live pollution data
        if pollution.get("status") == "success":
            pred_input["prev_pm25"] = pollution.get("pm2_5", 50)
            pred_input["prev_pm10"] = pollution.get("pm10",  80)
            pred_input["prev_no2"]  = pollution.get("no2",   30)
            pred_input["prev_o3"]   = pollution.get("o3",    40)
            pred_input["prev_co"]   = pollution.get("co",   800)

        # Update from live weather data
        if weather.get("status") == "success":
            pred_input["temperature"] = weather.get("temp",       25)
            pred_input["humidity"]    = weather.get("humidity",   60)
            pred_input["wind_speed"]  = weather.get("wind_speed",  5)
            pred_input["pressure"]    = weather.get("pressure", 1013)

        # Get ML predictions
        ml_pred     = predictor.predict(pred_input)
        hourly_pred = predictor.predict_next_hours(pred_input, 12)

        return jsonify({
            "status":            "success",
            "pollution":         pollution,
            "weather":           weather,
            "forecast":          forecast,
            "ml_prediction":     ml_pred,
            "hourly_prediction": hourly_pred,
            "timestamp":         datetime.now().isoformat(),
            "location":          {"lat": lat, "lon": lon},
        })

    except Exception as e:
        traceback.print_exc()
        return err(str(e))


@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data   = request.get_json() or {}
        result = predictor.predict(data)
        return jsonify(result)
    except Exception as e:
        return err(str(e), 400)


@app.route("/api/predict-hours", methods=["POST"])
def predict_hours():
    try:
        body  = request.get_json() or {}
        hours = int(body.get("hours", 12))
        data  = body.get("data", {})
        result = predictor.predict_next_hours(data, hours)
        return jsonify(result)
    except Exception as e:
        return err(str(e), 400)


@app.route("/api/train-model", methods=["POST"])
def train_model():
    try:
        from model.train_model import ModelTrainer
        trainer = ModelTrainer()
        metrics = trainer.train()
        return jsonify({
            "status":  "success",
            "message": "Model trained successfully!",
            "metrics": metrics,
        })
    except Exception as e:
        return err(str(e))


# ================================================
# RUN SERVER
# ================================================
if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("  AIR POLLUTION PREDICTION SERVER")
    print("=" * 50)
    print(f"  URL : http://localhost:{PORT}")
    print(f"  Test: http://localhost:{PORT}/api/health")
    print("=" * 50 + "\n")
    app.run(debug=DEBUG, host=HOST, port=PORT)