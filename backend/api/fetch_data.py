# ================================================
# DATA FETCHER
# ================================================

import requests
from datetime import datetime
from api.config import (
    OPENWEATHER_API_KEY,
    IQAIR_API_KEY,
    WAQI_API_TOKEN,
    OPENWEATHER_POLLUTION_URL,
    OPENWEATHER_FORECAST_URL,
    OPENWEATHER_WEATHER_URL,
    OPENWEATHER_GEOCODING_URL,
    IQAIR_URL,
    WAQI_URL,
    DEFAULT_LAT,
    DEFAULT_LON,
    AQI_CATEGORIES,
    SAFE_LIMITS,
)


class PollutionDataFetcher:

    def __init__(self):
        self.api_key    = OPENWEATHER_API_KEY
        self.iqair_key  = IQAIR_API_KEY
        self.waqi_token = WAQI_API_TOKEN
        self.session    = requests.Session()

    # --------------------------------------------------
    # GET CURRENT POLLUTION
    # --------------------------------------------------
    def get_current_pollution(self, lat=DEFAULT_LAT, lon=DEFAULT_LON):
        try:
            url  = (
                f"{OPENWEATHER_POLLUTION_URL}"
                f"?lat={lat}&lon={lon}&appid={self.api_key}"
            )
            resp = self.session.get(url, timeout=10)
            data = resp.json()

            if resp.status_code == 200 and "list" in data:
                item = data["list"][0]
                comp = item["components"]
                aqi  = item["main"]["aqi"]

                return {
                    "status":      "success",
                    "aqi":         aqi,
                    "aqi_label":   AQI_CATEGORIES.get(aqi, {}).get("label", "Unknown"),
                    "aqi_color":   AQI_CATEGORIES.get(aqi, {}).get("color", "#ffffff"),
                    "timestamp":   item["dt"],
                    "co":          round(comp.get("co",    0), 2),
                    "no":          round(comp.get("no",    0), 2),
                    "no2":         round(comp.get("no2",   0), 2),
                    "o3":          round(comp.get("o3",    0), 2),
                    "so2":         round(comp.get("so2",   0), 2),
                    "pm2_5":       round(comp.get("pm2_5", 0), 2),
                    "pm10":        round(comp.get("pm10",  0), 2),
                    "nh3":         round(comp.get("nh3",   0), 2),
                    "safe_limits": SAFE_LIMITS,
                }

            return {
                "status":  "error",
                "message": data.get("message", "API error"),
            }

        except Exception as e:
            return {"status": "error", "message": str(e)}

    # --------------------------------------------------
    # GET FORECAST
    # --------------------------------------------------
    def get_pollution_forecast(self, lat=DEFAULT_LAT, lon=DEFAULT_LON, hours=24):
        try:
            url  = (
                f"{OPENWEATHER_FORECAST_URL}"
                f"?lat={lat}&lon={lon}&appid={self.api_key}"
            )
            resp = self.session.get(url, timeout=10)
            data = resp.json()

            if resp.status_code == 200 and "list" in data:
                forecasts = []
                for item in data["list"][:hours]:
                    comp = item["components"]
                    dt   = datetime.fromtimestamp(item["dt"])
                    forecasts.append({
                        "dt":         item["dt"],
                        "datetime":   dt.strftime("%Y-%m-%d %H:%M"),
                        "hour_label": dt.strftime("%H:%M"),
                        "date_label": dt.strftime("%d %b"),
                        "aqi":        item["main"]["aqi"],
                        "aqi_label":  AQI_CATEGORIES.get(
                                          item["main"]["aqi"], {}
                                      ).get("label", "Unknown"),
                        "aqi_color":  AQI_CATEGORIES.get(
                                          item["main"]["aqi"], {}
                                      ).get("color", "#fff"),
                        "pm2_5":      round(comp.get("pm2_5", 0), 2),
                        "pm10":       round(comp.get("pm10",  0), 2),
                        "no2":        round(comp.get("no2",   0), 2),
                        "o3":         round(comp.get("o3",    0), 2),
                        "co":         round(comp.get("co",    0), 2),
                        "so2":        round(comp.get("so2",   0), 2),
                    })

                return {
                    "status":    "success",
                    "forecasts": forecasts,
                    "count":     len(forecasts),
                }

            return {"status": "error", "message": "Forecast failed"}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    # --------------------------------------------------
    # GET WEATHER
    # --------------------------------------------------
    def get_weather_data(self, lat=DEFAULT_LAT, lon=DEFAULT_LON):
        try:
            url  = (
                f"{OPENWEATHER_WEATHER_URL}"
                f"?lat={lat}&lon={lon}&appid={self.api_key}&units=metric"
            )
            resp = self.session.get(url, timeout=10)
            data = resp.json()

            if resp.status_code == 200:
                wind = data.get("wind", {})
                sys  = data.get("sys", {})
                return {
                    "status":       "success",
                    "city":         data.get("name", "Unknown"),
                    "country":      sys.get("country", ""),
                    "temp":         round(data["main"]["temp"],       1),
                    "feels_like":   round(data["main"]["feels_like"], 1),
                    "temp_min":     round(data["main"]["temp_min"],   1),
                    "temp_max":     round(data["main"]["temp_max"],   1),
                    "humidity":     data["main"]["humidity"],
                    "pressure":     data["main"]["pressure"],
                    "visibility":   data.get("visibility", 0),
                    "wind_speed":   wind.get("speed", 0),
                    "wind_deg":     wind.get("deg",   0),
                    "wind_gust":    wind.get("gust",  0),
                    "clouds":       data["clouds"]["all"],
                    "weather":      data["weather"][0]["description"].title(),
                    "weather_icon": data["weather"][0]["icon"],
                    "sunrise": datetime.fromtimestamp(
                                   sys.get("sunrise", 0)
                               ).strftime("%H:%M"),
                    "sunset":  datetime.fromtimestamp(
                                   sys.get("sunset", 0)
                               ).strftime("%H:%M"),
                    "lat": lat,
                    "lon": lon,
                }

            return {
                "status":  "error",
                "message": data.get("message", "Weather failed"),
            }

        except Exception as e:
            return {"status": "error", "message": str(e)}

    # --------------------------------------------------
    # GEOCODE CITY
    # --------------------------------------------------
    def geocode_city(self, city_name):
        try:
            # Removed the India restriction. Allow global searches.
            search_query = city_name
            url  = (
                f"{OPENWEATHER_GEOCODING_URL}"
                f"?q={search_query}&limit=10&appid={self.api_key}"
            )
            resp = self.session.get(url, timeout=10)
            data = resp.json()

            if resp.status_code == 200 and len(data) > 0:
                results = []
                for loc in data:
                    results.append({
                        "name":    loc.get("name", ""),
                        "country": loc.get("country", ""),
                        "state":   loc.get("state", ""),
                        "lat":     round(loc["lat"], 4),
                        "lon":     round(loc["lon"], 4),
                        "isIndian": loc.get("country") == "IN" # Keep this flag for frontend UI categorization
                    })
                
                if results:
                    return {"status": "success", "results": results}

            return {"status": "error", "message": "City not found"}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    # --------------------------------------------------
    # GET REAL AQI FROM WAQI API
    # --------------------------------------------------
    def get_waqi_aqi(self, lat=DEFAULT_LAT, lon=DEFAULT_LON):
        """Fetch real measured AQI from WAQI (World Air Quality Index) API"""
        if not self.waqi_token:
            return {"status": "error", "message": "WAQI token not configured"}
        
        try:
            url = f"{WAQI_URL}/?token={self.waqi_token}&lat={lat}&lon={lon}"
            resp = self.session.get(url, timeout=10)
            
            if resp.status_code != 200:
                return {"status": "error", "message": f"HTTP {resp.status_code}"}
            
            data = resp.json()
            
            if data.get("status") != "ok":
                return {"status": "error", "message": data.get("data", "Unknown error")}
            
            result_data = data.get("data", {})
            aqi = result_data.get("aqi")
            
            if aqi is None:
                return {"status": "error", "message": "No AQI data in response"}
            
            # Extract individual pollutant values
            iaqi = result_data.get("iaqi", {})
            
            return {
                "status":        "success",
                "source":        "WAQI",
                "aqi":           aqi,
                "aqi_time":      result_data.get("time", {}).get("iso", ""),
                "city":          result_data.get("city", {}).get("name", ""),
                "dominentpol":   result_data.get("dominentpol", ""),
                "pm2_5":         iaqi.get("pm25", {}).get("v"),
                "pm10":          iaqi.get("pm10", {}).get("v"),
                "no2":           iaqi.get("no2", {}).get("v"),
                "o3":            iaqi.get("o3", {}).get("v"),
                "so2":           iaqi.get("so2", {}).get("v"),
                "co":            iaqi.get("co", {}).get("v"),
                "nh3":           iaqi.get("nh3", {}).get("v"),
                "h":             iaqi.get("h", {}).get("v"),
                "t":             iaqi.get("t", {}).get("v"),
            }

        except Exception as e:
            print(f"[WAQI Error] {str(e)}")
            return {"status": "error", "message": f"WAQI Error: {str(e)}"}

    # --------------------------------------------------
    # ENHANCED GET CURRENT POLLUTION WITH ACCURATE CALCULATION
    # --------------------------------------------------
    def get_current_pollution_enhanced(self, lat=DEFAULT_LAT, lon=DEFAULT_LON):
        """Get pollution data from OpenWeatherMap with enhanced AQI calculation"""
        
        # Get OWM data
        owm_data = self.get_current_pollution(lat, lon)
        
        if owm_data.get("status") != "success":
            return owm_data
        
        # The OWM returns AQI on 1-5 scale, we need to convert to 0-500 EPA scale
        # For now, map the OWM categories to reasonable AQI values
        owm_aqi = owm_data.get("aqi", 3)
        
        # Map OWM scale (1-5) to EPA scale (0-500)
        aqi_map = {
            1: 25,   # Good
            2: 75,   # Fair
            3: 125,  # Moderate
            4: 175,  # Poor
            5: 300,  # Very Poor
        }
        
        calculated_aqi = aqi_map.get(owm_aqi, 125)
        
        # Determine category based on EPA scale
        if calculated_aqi <= 50:
            category = 1  # Good
        elif calculated_aqi <= 100:
            category = 2  # Fair
        elif calculated_aqi <= 150:
            category = 3  # Moderate
        elif calculated_aqi <= 200:
            category = 4  # Poor
        else:
            category = 5  # Very Poor
        
        # Update response with calculated AQI
        owm_data["aqi"] = calculated_aqi
        owm_data["aqi_label"] = AQI_CATEGORIES.get(category, {}).get("label", "Unknown")
        owm_data["aqi_color"] = AQI_CATEGORIES.get(category, {}).get("color", "#ffffff")
        owm_data["source"] = "OpenWeatherMap (Real-time)"
        
        return owm_data

    # --------------------------------------------------
    # GET IQAIR DATA (AirVisual)
    # --------------------------------------------------
    def get_iqair_data(self, lat, lon):
        if not self.iqair_key or len(self.iqair_key) < 10:
            return None
        try:
            url = f"{IQAIR_URL}?lat={lat}&lon={lon}&key={self.iqair_key}"
            resp = self.session.get(url, timeout=10)
            data = resp.json()
            if data.get("status") == "success":
                return {
                    "official_aqi": data["data"]["current"]["pollution"]["aqius"],
                    "station": data["data"]["city"],
                    "source": "IQAir"
                }
        except Exception as e:
            print(f"[IQAir] Error: {e}")
        return None

    # --------------------------------------------------
    # GET ALL DATA (Combined)
    # --------------------------------------------------
    def get_all_data(self, lat=DEFAULT_LAT, lon=DEFAULT_LON):
        from concurrent.futures import ThreadPoolExecutor
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            p_task = executor.submit(self.get_current_pollution, lat, lon)
            f_task = executor.submit(self.get_pollution_forecast, lat, lon)
            w_task = executor.submit(self.get_weather_data, lat, lon)
            wa_task = executor.submit(self.get_waqi_aqi, lat, lon)
            iq_task = executor.submit(self.get_iqair_data, lat, lon)
            
            p = p_task.result()
            f = f_task.result()
            w = w_task.result()
            waqi = wa_task.result()
            iq = iq_task.result()
        
        # Priority 1: WAQI (Official CPCB for India)
        if waqi.get("status") == "success":
            p["official_aqi"] = waqi["aqi"]
            p["waqi_station"] = waqi["city"]
            p["source"] = "CPCB (Official)"
            p["use_official"] = True
            for k in ["pm2_5", "pm10", "no2", "o3", "so2", "co"]:
                if waqi.get(k) is not None:
                    p[k] = waqi[k]

        # Priority 2: IQAir (Global Official)
        elif iq:
            p["official_aqi"] = iq["official_aqi"]
            p["waqi_station"] = iq["station"]
            p["source"] = "IQAir (Official)"
            p["use_official"] = True

        return {
            "status": "success",
            "pollution": p,
            "forecast": f,
            "weather": w,
            "waqi": waqi,
            "iq": iq,
            "source": "backend"
        }