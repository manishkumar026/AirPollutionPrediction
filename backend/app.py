# ================================================
# FLASK SERVER - AIRWATCH PRO (MONGODB VERSION)
# ================================================

from flask import Flask, jsonify, request, send_from_directory, session, redirect, url_for, make_response
from flask_cors import CORS
from flask_pymongo import PyMongo
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from bson.objectid import ObjectId
from datetime import datetime
import traceback
import sys
import os
import io
import csv
import certifi

# Add backend folder to path
sys.path.insert(0, os.path.dirname(__file__))

from api.config     import DEBUG, HOST, PORT, DEFAULT_LAT, DEFAULT_LON
from api.fetch_data import PollutionDataFetcher
from model.predict  import AQIPredictor

# ---- CREATE APP ----
app = Flask(
    __name__,
    static_folder="../frontend",
    template_folder="../frontend"
)
app.config['SECRET_KEY'] = 'airwatch-pro-secret-key-123'
CORS(app)

# ---- DATABASE CONFIG (MongoDB) ----
mongo_uri = os.environ.get("MONGO_URI")
if not mongo_uri:
    print("⚠️ Warning: MONGO_URI not found. Falling back to local MongoDB.")
    mongo_uri = "mongodb://localhost:27017/airwatch"

app.config["MONGO_URI"] = mongo_uri

# Using certifi to fix SSL handshake errors common with MongoDB Atlas
try:
    mongo = PyMongo(app, tlsCAFile=certifi.where())
    # If the user forgot to put a database name in the URI (e.g. /airwatch), mongo.db will be None.
    if mongo.db is None:
        mongo.db = mongo.cx["airwatch"]
    print("✅ Successfully connected to MongoDB!")
except Exception as e:
    print(f"❌ MongoDB connection error: {e}")
    mongo = None

# ---- MODELS (MongoDB wrappers) ----
class User(UserMixin):
    def __init__(self, user_data):
        self.id = str(user_data["_id"])
        self.username = user_data["username"]
        self.password = user_data["password"]
        self.is_admin = user_data.get("is_admin", False)

# ---- AUTH SETUP ----
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'

@login_manager.user_loader
def load_user(user_id):
    if mongo:
        u = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if u: return User(u)
    return None

# Create default admin if it doesn't exist
with app.app_context():
    if mongo:
        admin_exists = mongo.db.users.find_one({"username": "admin"})
        if not admin_exists:
            mongo.db.users.insert_one({
                "username": "admin",
                "password": generate_password_hash("admin123"),
                "is_admin": True,
                "created_at": datetime.utcnow()
            })
            print("👤 Default admin user created.")

# ---- CREATE INSTANCES ----
fetcher   = PollutionDataFetcher()
predictor = AQIPredictor()

# ================================================
# AUTH & LOGGING ROUTES
# ================================================

@app.route("/api/register", methods=["POST"])
def register():
    if not mongo: return jsonify({"status": "error", "message": "Database not connected"}), 500
    
    data = request.json
    if mongo.db.users.find_one({"username": data['username']}):
        return jsonify({"status": "error", "message": "Username already exists"}), 400
    
    mongo.db.users.insert_one({
        "username": data['username'],
        "password": generate_password_hash(data['password']),
        "is_admin": False,
        "created_at": datetime.utcnow()
    })
    return jsonify({"status": "success", "message": "User registered"})

@app.route("/api/login", methods=["POST"])
def login():
    if not mongo: return jsonify({"status": "error", "message": "Database not connected"}), 500
    
    data = request.json
    u_data = mongo.db.users.find_one({"username": data['username']})
    if u_data and check_password_hash(u_data['password'], data['password']):
        user = User(u_data)
        login_user(user)
        return jsonify({"status": "success", "user": {"username": user.username, "is_admin": user.is_admin}})
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
    if not mongo: return jsonify({"status": "error", "message": "Database not connected"}), 500
    
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
    if not mongo: return jsonify({"status": "error", "message": "Database not connected"}), 500
    
    logs = mongo.db.search_logs.find()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Username', 'City', 'Lat', 'Lon', 'Timestamp'])
    
    for log in logs:
        writer.writerow([str(log.get('_id')), log.get('username'), log.get('city'), log.get('lat'), log.get('lon'), log.get('timestamp')])
    
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=search_logs_mongo.csv"
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
        pollution = all_data.get("pollution", {})
        weather   = all_data.get("weather", {})
        forecast  = all_data.get("forecast", {})

        # Prepare prediction inputs with real data
        pred_input = {
            "hour": datetime.now().hour, 
            "month": datetime.now().month, 
            "day_of_week": datetime.now().weekday(),
            "temperature": weather.get("temp", 25),
            "humidity": weather.get("humidity", 60),
            "wind_speed": weather.get("wind", {}).get("speed", 5),
            "pressure": weather.get("pressure", 1013),
            "prev_pm25": 50, "prev_pm10": 80, "prev_no2": 30, "prev_o3": 40, "prev_co": 800, "prev_so2": 15
        }

        # Extract pollution components if available
        if pollution.get("status") == "success" and "list" in pollution:
            comp = pollution["list"][0].get("components", {})
            pred_input["prev_pm25"] = comp.get("pm2_5", 50)
            pred_input["prev_pm10"] = comp.get("pm10", 80)
            pred_input["prev_no2"]  = comp.get("no2", 30)
            pred_input["prev_o3"]   = comp.get("o3", 40)
            pred_input["prev_co"]   = comp.get("co", 800)
            pred_input["prev_so2"]  = comp.get("so2", 15)
        
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