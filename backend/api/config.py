# ================================================
# CONFIGURATION FILE
# ================================================

# OPENWEATHER API KEY
OPENWEATHER_API_KEY = "1cc153b8da9c132a0ede08d220b59a60"

# IQAIR API KEY (AirVisual)
IQAIR_API_KEY = "27636e29-836f-490f-bc7f-01b3871d8b8e"

# WAQI TOKEN (optional)
WAQI_API_TOKEN = ""

# API URLS
OPENWEATHER_POLLUTION_URL = "http://api.openweathermap.org/data/2.5/air_pollution"
OPENWEATHER_FORECAST_URL  = "http://api.openweathermap.org/data/2.5/air_pollution/forecast"
OPENWEATHER_WEATHER_URL   = "https://api.openweathermap.org/data/2.5/weather"
OPENWEATHER_GEOCODING_URL = "https://api.openweathermap.org/geo/1.0/direct"
IQAIR_URL                 = "https://api.airvisual.com/v2/nearest_city"
WAQI_URL                  = "https://api.waqi.info/feed"

# DEFAULT LOCATION - New Delhi
DEFAULT_LAT = 28.6139
DEFAULT_LON = 77.2090

# FLASK SETTINGS
DEBUG = True
PORT  = 5000
HOST  = "0.0.0.0"

# MONGODB SETTINGS (Change this to your local or Atlas URI)
MONGO_URI = "mongodb://localhost:27017/airwatch_db"

# AQI CATEGORIES
AQI_CATEGORIES = {
    1: {"label": "Good",      "color": "#00e400"},
    2: {"label": "Fair",      "color": "#ffff00"},
    3: {"label": "Moderate",  "color": "#ff7e00"},
    4: {"label": "Poor",      "color": "#ff0000"},
    5: {"label": "Very Poor", "color": "#8f3f97"},
}

# WHO SAFE LIMITS
SAFE_LIMITS = {
    "pm2_5": 15,
    "pm10":  45,
    "no2":   25,
    "o3":    100,
    "so2":   40,
    "co":    4000,
}