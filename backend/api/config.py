# ================================================
# CONFIGURATION FILE
# ================================================

# GET FREE API KEY FROM: https://openweathermap.org/api
OPENWEATHER_API_KEY = "1cc153b8da9c132a0ede08d220b59a60"

# WAQI TOKEN (optional - can leave as empty string)
WAQI_API_TOKEN = "c12943ab88ad31947b8aaf9568a9633988c61ce7"

# API URLS
OPENWEATHER_POLLUTION_URL = "http://api.openweathermap.org/data/2.5/air_pollution"
OPENWEATHER_FORECAST_URL  = "http://api.openweathermap.org/data/2.5/air_pollution/forecast"
OPENWEATHER_WEATHER_URL   = "http://api.openweathermap.org/data/2.5/weather"
OPENWEATHER_GEOCODING_URL = "http://api.openweathermap.org/geo/1.0/direct"
WAQI_URL                  = "https://api.waqi.info/feed"

# DEFAULT LOCATION - New Delhi
DEFAULT_LAT = 28.6139
DEFAULT_LON = 77.2090

# FLASK SETTINGS
DEBUG = True
PORT  = 5000
HOST  = "0.0.0.0"

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