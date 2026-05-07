# ================================================
# FLASK SERVER - AIRWATCH PRO (SQLITE VERSION)
# ================================================

from flask import Flask, jsonify, request, send_from_directory, session, redirect, url_for, make_response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import traceback
import sys
import os
import io
import csv

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

# ---- DATABASE CONFIG (SQLite) ----
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///airwatch.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# ---- MODELS ----
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class SearchLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    city = db.Column(db.String(100), nullable=False)
    lat = db.Column(db.Float)
    lon = db.Column(db.Float)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))

# ---- AUTH SETUP ----
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Create tables and default admin
with app.app_context():
    db.create_all()
    if not User.query.filter_by(username='admin').first():
        admin = User(
            username='admin',
            password=generate_password_hash('admin123'),
            is_admin=True
        )
        db.session.add(admin)
        db.session.commit()

# ---- CREATE INSTANCES ----
fetcher   = PollutionDataFetcher()
predictor = AQIPredictor()

# ================================================
# AUTH & LOGGING ROUTES
# ================================================

@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    if User.query.filter_by(username=data['username']).first():
        return jsonify({"status": "error", "message": "Username already exists"}), 400
    
    new_user = User(
        username=data['username'],
        password=generate_password_hash(data['password']),
        is_admin=False
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"status": "success", "message": "User registered"})

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    user = User.query.filter_by(username=data['username']).first()
    if user and check_password_hash(user.password, data['password']):
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
    data = request.json
    new_log = SearchLog(
        user_id=current_user.id,
        username=current_user.username,
        city=data.get('city', 'Unknown'),
        lat=data.get('lat'),
        lon=data.get('lon')
    )
    db.session.add(new_log)
    db.session.commit()
    return jsonify({"status": "success"})

@app.route("/api/admin/logs")
@login_required
def export_logs():
    if not current_user.is_admin:
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    
    logs = SearchLog.query.all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Username', 'City', 'Lat', 'Lon', 'Timestamp'])
    
    for log in logs:
        writer.writerow([log.id, log.username, log.city, log.lat, log.lon, log.timestamp])
    
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=search_logs_sqlite.csv"
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