# ================================================
# FLASK SERVER - AIRWATCH PRO (MYSQL / XAMPP VERSION)
# ================================================



from flask import Flask, jsonify, request, send_from_directory, session, redirect, url_for, make_response
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import random
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
socketio = SocketIO(app, cors_allowed_origins="*")

# ---- DATABASE CONFIG (PostgreSQL / MySQL with SQLite Fallback) ----
database_url = os.environ.get("DATABASE_URL")
mysql_uri = os.environ.get("MYSQL_URI", 'mysql+pymysql://root:@localhost/airwatch')

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Fix Render's postgres:// prefix issue for SQLAlchemy
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

def check_db_connection(uri):
    try:
        from sqlalchemy import create_engine
        engine = create_engine(uri, connect_args={'connect_timeout': 2})
        with engine.connect() as conn:
            return True
    except:
        return False

if database_url and check_db_connection(database_url):
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    print("✅ PostgreSQL Connection Verified")
elif check_db_connection(mysql_uri):
    app.config['SQLALCHEMY_DATABASE_URI'] = mysql_uri
    print("✅ MySQL Connection Verified")
else:
    print("⚠️ DB Connection Failed. Switching to SQLite fallback...")
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///airwatch_fallback.db'

db = SQLAlchemy(app)

# ---- MODELS ----
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
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
    try:
        db.create_all()
        # Perform dynamic database migration to add 'email' column if it doesn't exist
        try:
            from sqlalchemy import inspect
            inspector = inspect(db.engine)
            if 'user' in inspector.get_table_names():
                columns = [c['name'] for c in inspector.get_columns('user')]
                if 'email' not in columns:
                    print("🔧 Migrating database: Adding 'email' column to 'user' table...")
                    from sqlalchemy import text
                    with db.engine.connect() as conn:
                        conn.execute(text("ALTER TABLE user ADD COLUMN email VARCHAR(120) NULL"))
                        conn.commit()
                    print("✅ Database migration successful.")
        except Exception as mig_err:
            print(f"⚠️ Database migration info: {mig_err}")

        if not User.query.filter_by(username='admin').first():
            admin = User(
                username='admin',
                password=generate_password_hash('admin123'),
                is_admin=True
            )
            db.session.add(admin)
            db.session.commit()
            print("👤 Default admin user created in MySQL.")
    except Exception as e:
        print(f"❌ MySQL connection error: {e}")
        print("⚠️ Did you remember to start MySQL in XAMPP and create the 'airwatch' database in phpMyAdmin?")
        
# ---- CREATE INSTANCES ----
fetcher   = PollutionDataFetcher()
predictor = AQIPredictor()

# ================================================
# AUTH & LOGGING ROUTES
# ================================================

@app.route("/api/register", methods=["POST"])
def register():
    try:
        data = request.json
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        
        if User.query.filter_by(username=username).first():
            return jsonify({"status": "error", "message": "Username already exists"}), 400
        
        if email and User.query.filter_by(email=email).first():
            return jsonify({"status": "error", "message": "Email already exists"}), 400
        
        new_user = User(
            username=username,
            email=email,
            password=generate_password_hash(password),
            is_admin=False
        )
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"status": "success", "message": "User registered"})
    except Exception as e:
        return jsonify({"status": "error", "message": f"Database error: {e}"}), 500

@app.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.json
        identifier = data.get('username')
        password = data.get('password')
        
        user = User.query.filter((User.username == identifier) | (User.email == identifier)).first()
        if user and check_password_hash(user.password, password):
            login_user(user)
            return jsonify({"status": "success", "user": {"username": user.username, "email": user.email, "is_admin": user.is_admin}})
        return jsonify({"status": "error", "message": "Invalid username/email or password"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": f"Database error: {e}"}), 500

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
    try:
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
    except Exception as e:
        return jsonify({"status": "error", "message": f"Database error: {e}"}), 500

@app.route("/api/admin/logs")
@login_required
def export_logs():
    if not current_user.is_admin:
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    
    try:
        logs = SearchLog.query.all()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['ID', 'Username', 'City', 'Lat', 'Lon', 'Timestamp'])
        
        for log in logs:
            writer.writerow([log.id, log.username, log.city, log.lat, log.lon, log.timestamp])
        
        response = make_response(output.getvalue())
        response.headers["Content-Disposition"] = "attachment; filename=search_logs_mysql.csv"
        response.headers["Content-type"] = "text/csv"
        return response
    except Exception as e:
        return jsonify({"status": "error", "message": f"Database error: {e}"}), 500

@app.route("/api/admin/recent_searches")
@login_required
def recent_searches():
    if not current_user.is_admin:
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    
    try:
        logs = SearchLog.query.order_by(SearchLog.timestamp.desc()).limit(20).all()
        data = [{
            "username": log.username,
            "city": log.city,
            "timestamp": log.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        } for log in logs]
        return jsonify({"status": "success", "logs": data})
    except Exception as e:
        return jsonify({"status": "error", "message": f"Database error: {e}"}), 500

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

@app.route("/data/<path:filename>")
def data_files(filename): return send_from_directory("../frontend/data", filename)

# ================================================
# INDIVIDUAL API ROUTES (used by frontend fetchAll)
# ================================================

@app.route("/api/predict", methods=["POST"])
def api_predict():
    try:
        data = request.json or {}
        result = predictor.predict(data)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/pollution")
def api_pollution():
    try:
        lat = float(request.args.get("lat", DEFAULT_LAT))
        lon = float(request.args.get("lon", DEFAULT_LON))
        data = fetcher.get_current_pollution(lat, lon)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/weather")
def api_weather():
    try:
        lat = float(request.args.get("lat", DEFAULT_LAT))
        lon = float(request.args.get("lon", DEFAULT_LON))
        data = fetcher.get_weather_data(lat, lon)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/forecast")
def api_forecast():
    try:
        lat = float(request.args.get("lat", DEFAULT_LAT))
        lon = float(request.args.get("lon", DEFAULT_LON))
        data = fetcher.get_pollution_forecast(lat, lon)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/city-aqi")
def api_city_aqi():
    try:
        lat  = float(request.args.get("lat", DEFAULT_LAT))
        lon  = float(request.args.get("lon", DEFAULT_LON))

        # Try WAQI first for most accurate data
        waqi = fetcher.get_waqi_aqi(lat, lon)
        if waqi.get("status") == "success":
            return jsonify({
                "status":       "success",
                "aqi":          waqi["aqi"],
                "pm2_5":        waqi.get("pm2_5"),
                "pm10":         waqi.get("pm10"),
                "no2":          waqi.get("no2"),
                "o3":           waqi.get("o3"),
                "so2":          waqi.get("so2"),
                "co":           waqi.get("co"),
                "source":       "WAQI",
                "official_aqi": waqi["aqi"],
                "use_official": True,
            })

        # Fallback: OpenWeatherMap
        poll = fetcher.get_current_pollution(lat, lon)
        if poll.get("status") == "success":
            return jsonify({
                "status": "success",
                "pm2_5":  poll.get("pm2_5", 0),
                "pm10":   poll.get("pm10",  0),
                "no2":    poll.get("no2",   0),
                "o3":     poll.get("o3",    0),
                "so2":    poll.get("so2",   0),
                "co":     poll.get("co",    0),
                "source": "OWM",
                "use_official": False,
            })

        return jsonify({"status": "error", "message": "No data available"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/geocode")
def api_geocode():
    try:
        q = request.args.get("q", "")
        if not q:
            return jsonify([])
        data = fetcher.geocode_city(q)
        if data.get("status") == "success":
            return jsonify(data.get("results", []))
        return jsonify([])
    except Exception as e:
        return jsonify([]), 500

# ================================================
# RUN SERVER
# ================================================
if __name__ == "__main__":
    try:
        app.run(debug=DEBUG, host=HOST, port=PORT)
    except OSError as e:
        if "address already in use" in str(e).lower():
            print(f"⚠️ Port {PORT} is busy, trying {PORT + 1}...")
            app.run(debug=DEBUG, host=HOST, port=PORT + 1)
        else:
            raise e