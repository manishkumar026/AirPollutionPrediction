# ================================================
# MULTI-MODEL ENSEMBLE PREDICTOR
# ================================================

import numpy as np
import joblib
import os
from datetime import datetime


class AQIPredictor:
    """Uses 4 ML models weighted ensemble for accurate AQI"""

    FEATURES = [
        "temperature", "humidity", "wind_speed", "pressure",
        "hour", "month", "day_of_week",
        "prev_pm25", "prev_pm10", "prev_no2", "prev_o3", "prev_co", "prev_so2",
    ]

    AQI_SCALE = [
        (50,  "Good",                          "#00e400",
         "Air quality is satisfactory. No health risk."),
        (100, "Moderate",                       "#ffff00",
         "Acceptable. Sensitive people should take care."),
        (150, "Unhealthy for Sensitive Groups", "#ff7e00",
         "Sensitive groups should reduce outdoor activities."),
        (200, "Unhealthy",                      "#ff0000",
         "Everyone may experience health effects. Limit outdoor time."),
        (300, "Very Unhealthy",                 "#8f3f97",
         "Health alert! Avoid all outdoor activities."),
        (500, "Hazardous",                      "#7e0023",
         "Emergency! Everyone must stay indoors!"),
    ]

    def __init__(self):
        self.models  = None
        self.scaler  = None
        self.weights = None
        self.base    = os.path.dirname(__file__)
        self._load_or_train()

    def _load_or_train(self):
        models_path  = os.path.join(self.base, "multi_models.pkl")
        scaler_path  = os.path.join(self.base, "scaler.pkl")
        weights_path = os.path.join(self.base, "weights.pkl")

        if (
            os.path.exists(models_path)
            and os.path.exists(scaler_path)
            and os.path.exists(weights_path)
        ):
            try:
                self.models  = joblib.load(models_path)
                self.scaler  = joblib.load(scaler_path)
                self.weights = joblib.load(weights_path)
                model_count  = len(self.models)
                print(f"Loaded {model_count} ML models successfully!")
                for name, weight in self.weights.items():
                    print(f"   {name}: weight = {weight:.4f}")
                return
            except Exception as e:
                print(f"Load error: {e}")

        print("Training new multi-model ensemble...")
        self._train_new()

    def _train_new(self):
        from model.train_model import MultiModelTrainer
        trainer      = MultiModelTrainer()
        trainer.train()
        self.models  = trainer.models
        self.scaler  = trainer.scaler
        self.weights = trainer.weights

    def get_aqi_info(self, value):
        value = float(value)
        for threshold, label, color, advice in self.AQI_SCALE:
            if value <= threshold:
                return {
                    "category":      label,
                    "color":         color,
                    "health_advice": advice,
                }
        return {
            "category":      "Hazardous",
            "color":         "#7e0023",
            "health_advice": "Emergency! Stay indoors!",
        }

    def predict(self, input_data):
        now = datetime.now()

        features = [
            float(input_data.get("temperature", 25)),
            float(input_data.get("humidity",    60)),
            float(input_data.get("wind_speed",   5)),
            float(input_data.get("pressure",  1013)),
            int(  input_data.get("hour",       now.hour)),
            int(  input_data.get("month",      now.month)),
            int(  input_data.get("day_of_week",now.weekday())),
            float(input_data.get("prev_pm25",   50)),
            float(input_data.get("prev_pm10",   80)),
            float(input_data.get("prev_no2",    30)),
            float(input_data.get("prev_o3",     40)),
            float(input_data.get("prev_co",    800)),
            float(input_data.get("prev_so2",    20)),
        ]

        scaled = self.scaler.transform([features])

        # Get prediction from each model
        predictions = {}
        for name, model in self.models.items():
            pred = model.predict(scaled)[0]
            predictions[name] = round(float(pred), 1)

        # Weighted ensemble
        ensemble_aqi = 0
        for name, pred in predictions.items():
            weight = self.weights.get(name, 0.25)
            ensemble_aqi += pred * weight

        ensemble_aqi = round(float(np.clip(ensemble_aqi, 0, 500)), 0)
        info         = self.get_aqi_info(ensemble_aqi)

        # Emoji
        emoji = "😊"
        if ensemble_aqi > 300:   emoji = "☠️"
        elif ensemble_aqi > 200: emoji = "🤢"
        elif ensemble_aqi > 150: emoji = "😷"
        elif ensemble_aqi > 100: emoji = "😐"
        elif ensemble_aqi > 50:  emoji = "🙂"

        return {
            "status":           "success",
            "predicted_aqi":    ensemble_aqi,
            "emoji":            emoji,
            "category":         info["category"],
            "color":            info["color"],
            "health_advice":    info["health_advice"],
            "individual_models": predictions,
            "weights":          self.weights,
            "method":           "4-Model Weighted Ensemble",
            "models_used": [
                "Gradient Boosting",
                "Random Forest",
                "AdaBoost",
                "Ridge Regression",
            ],
            "predicted_at": now.isoformat(),
        }

    def predict_next_hours(self, current_data, hours=12):
        predictions = []
        data        = dict(current_data)

        for h in range(1, hours + 1):
            data["hour"] = (datetime.now().hour + h) % 24

            # Realistic pollution variation
            data["prev_pm25"] = max(
                0, float(data.get("prev_pm25", 50))
                + np.random.normal(0, 3)
            )
            data["prev_pm10"] = max(
                0, float(data.get("prev_pm10", 80))
                + np.random.normal(0, 4)
            )
            data["prev_no2"] = max(
                0, float(data.get("prev_no2", 30))
                + np.random.normal(0, 2)
            )
            data["prev_o3"] = max(
                0, float(data.get("prev_o3", 40))
                + np.random.normal(0, 2)
            )
            data["prev_so2"] = max(
                0, float(data.get("prev_so2", 20))
                + np.random.normal(0, 1)
            )

            result = self.predict(data)
            predictions.append({
                "hour":          h,
                "hour_label":    f"+{h}h",
                "predicted_aqi": result["predicted_aqi"],
                "emoji":         result["emoji"],
                "category":      result["category"],
                "color":         result["color"],
            })

        return {
            "status":      "success",
            "predictions": predictions,
            "hours":       hours,
            "method":      "4-Model Ensemble",
        }


# Singleton
predictor = AQIPredictor()