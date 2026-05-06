# ================================================
# FLASK SERVER - AIRWATCH PRO (MONGODB VERSION)
# ================================================

from flask import Flask, jsonify, request, send_from_directory, session, redirect, url_for, make_response
from flask_cors import CORS
from flask_pymongo import PyMongo
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from bson.objectid import ObjectId
import traceback
import sys
import os
import csv
import io

# Add backend folder to path
sys.path.insert(0, os.path.dirname(__file__))

from api.config     import DEBUG, HOST, PORT, DEFAULT_LAT, DEFAULT_LON, MONGO_URI
from api.fetch_data import PollutionDataFetcher
from model.predict  import AQIPredictor

# ---- CREATE APP ----
app = Flask(
    __name__,
    static_folder="../frontend",
    template_folder="../frontend"
)
app.config['SECRET_KEY'] = 'airwatch-pro-secret-key-123'
app.config['MONGO_URI'] = MONGO_URI

CORS(app)

# ---- MONGODB & AUTH ----
mongo = PyMongo(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'

class User(UserMixin):
    def __init__(self, user_data):
        self.id = str(user_data['_id'])
        self.username = user_data['username']
        self.password = user_data['password']
        self.is_admin = user_data.get('is_admin', False)

@login_manager.user_loader
def load_user(user_id):
    user_data = mongo.db.users.find_one({"_id": ObjectId(user_id)})
    if user_data:
        return User(user_data)
    return None

# Create default admin if not exists (Safe check)
with app.app_context():
    try:
        if mongo.db is not None:
            if not mongo.db.users.find_one({"username": "admin"}):
                mongo.db.users.insert_one({
                    "username": "admin",
                    "password": generate_password_hash("admin123"),
                    "is_admin": True,
                    "created_at": datetime.now()
                })
    except Exception as e:
        print(f"⚠️ Warning: MongoDB not connected yet. (Error: {e})")
        print("   Dashboard will work in Demo Mode until MONGO_URI is set in Render.")

# ---- CREATE INSTANCES ----
fetcher   = PollutionDataFetcher()
predictor = AQIPredictor()

# ================================================
# AUTH & LOGGING ROUTES
# ================================================

@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    if mongo.db.users.find_one({"username": data['username']}):
        return jsonify({"status": "error", "message": "Username already exists"}), 400
    
    mongo.db.users.insert_one({
        "username": data['username'],
        "password": generate_password_hash(data['password']),
        "is_admin": False
    })
    return jsonify({"status": "success", "message": "User registered"})

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    user_data = mongo.db.users.find_one({"username": data['username']})
    if user_data and check_password_hash(user_data['password'], data['password']):
        user_obj = User(user_data)
        login_user(user_obj)
        return jsonify({"status": "success", "user": {"username": user_obj.username, "is_admin": user_obj.is_admin}})
    return jsonify({"status": "error", "message": "Invalid credentials"}), 401

@app.route("/api/logout")
@login_required
def logout():
    logout_user()
    return jsonify({"status": "success", "message": "Logged out"})

@app.route("/api/user_status")
def user_status():
    if current_user.is_authenticated:
        return jsonify({"is_authenticated": True, "username": current_user.username, "is_admin": current_user.is_admin})
    return jsonify({"is_authenticated": False})

@app.route("/api/log_search", methods=["POST"])
@login_required
def log_search():
    data = request.json
    mongo.db.search_logs.insert_one({
        "user_id": current_user.id,
        "username": current_user.username,
        "city": data.get('city', 'Unknown'),
        "lat": data.get('lat'),
        "lon": data.get('lon'),
        "timestamp": datetime.utcnow()
    })
    return jsonify({"status": "success"})

@app.route("/api/admin/logs")
@login_required
def export_logs():
    if not current_user.is_admin:
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    
    logs = mongo.db.search_logs.find()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Username', 'City', 'Lat', 'Lon', 'Timestamp'])
    
    for log in logs:
        writer.writerow([str(log['_id']), log.get('username', 'N/A'), log['city'], log['lat'], log['lon'], log['timestamp']])
    
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=search_logs_mongodb.csv"
    response.headers["Content-type"] = "text/csv"
    return response

# ================================================
# STATIC & DASHBOARD ROUTES
# ================================================

@app.route("/")
def index():
    return send_from_directory("../frontend", "index.html")

@app.route("/login")
def login_page():
    return send_from_directory("../frontend", "login.html")

@app.route("/api/dashboard-data")
def dashboard_data():
    try:
        lat = float(request.args.get("lat", DEFAULT_LAT))
        lon = float(request.args.get("lon", DEFAULT_LON))
        # Fetch live data using the combined high-accuracy method
        all_data  = fetcher.get_all_data(lat, lon)
        pollution = all_data.get("p", {})
        weather   = all_data.get("w", {})
        forecast  = all_data.get("f", {})

        pred_input = {
            "hour": datetime.now().hour, "month": datetime.now().month, "day_of_week": datetime.now().weekday(),
            "temperature": 25, "humidity": 60, "wind_speed": 5, "pressure": 1013,
            "prev_pm25": 50, "prev_pm10": 80, "prev_no2": 30, "prev_o3": 40, "prev_prev_co": 800,
        }
        if pollution.get("status") == "success":
            for k in ["pm2_5", "pm10", "no2", "o3", "co"]:
                pred_input[f"prev_{k}"] = pollution.get(k, pred_input[f"prev_pm25" if k=="pm2_5" else f"prev_{k}"])
        
        return jsonify({
            "status": "success", "pollution": pollution, "weather": weather, "forecast": forecast,
            "ml_prediction": predictor.predict(pred_input),
            "hourly_prediction": predictor.predict_next_hours(pred_input, 12),
            "waqi_available": pollution.get("use_official", False),
            "waqi_station": pollution.get("waqi_station", ""),
            "timestamp": datetime.now().isoformat(), "location": {"lat": lat, "lon": lon},
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/js/<path:filename>")
def js_files(filename): return send_from_directory("../frontend/js", filename)

@app.route("/css/<path:filename>")
def css_files(filename): return send_from_directory("../frontend/css", filename)

# ================================================
# RUN SERVER
# ================================================
if __name__ == "__main__":
    app.run(debug=DEBUG, host=HOST, port=PORT)