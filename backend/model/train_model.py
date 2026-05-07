"""
train_model.py
Run locally, then commit multi_models.pkl, scaler.pkl, weights.pkl to GitHub
$ pip install -r ../../requirements.txt
$ python backend/model/train_model.py
"""
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor, AdaBoostRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, r2_score

class MultiModelTrainer:
    def __init__(self):
        self.models = {}
        self.scaler = StandardScaler()
        self.weights = {
            "gradient_boosting": 0.35,
            "random_forest": 0.35,
            "adaboost": 0.15,
            "ridge": 0.15
        }
        self.base_dir = os.path.dirname(__file__)
        self.random_state = 42
        self.n_samples = 10000
        
        self.FEATURES = [
            "temperature", "humidity", "wind_speed", "pressure",
            "hour", "month", "day_of_week",
            "prev_pm25", "prev_pm10", "prev_no2", "prev_o3", "prev_co", "prev_so2",
        ]

    def make_data(self):
        """Synthetic data matching /api/predict POST body fields"""
        np.random.seed(self.random_state)
        n = self.n_samples
        
        # Match order: temperature, humidity, wind_speed, pressure, hour, month, day_of_week, prev_pm25, prev_pm10, prev_no2, prev_o3, prev_co, prev_so2
        X = np.column_stack([
            np.random.uniform(0, 48, n),       # temperature
            np.random.uniform(15, 98, n),      # humidity
            np.random.uniform(0, 20, n),       # wind_speed
            np.random.uniform(970, 1040, n),   # pressure
            np.random.randint(0, 24, n),       # hour
            np.random.randint(1, 13, n),       # month
            np.random.randint(0, 7, n),        # day_of_week
            np.random.uniform(5, 350, n),      # prev_pm25
            np.random.uniform(10, 450, n),     # prev_pm10
            np.random.uniform(2, 120, n),      # prev_no2
            np.random.uniform(5, 200, n),      # prev_o3
            np.random.uniform(100, 25000, n),  # prev_co
            np.random.uniform(1, 80, n),       # prev_so2
        ])

        # Approximate EPA + meteorological logic (deterministic)
        # Using indices for the 13 features
        # 0: temp, 1: hum, 2: wind, 3: pres, 4: hour, 5: month, 6: dow
        # 7: pm25, 8: pm10, 9: no2, 10: o3, 11: co, 12: so2
        base = (
            0.55 * X[:, 7] + 0.15 * X[:, 8] + 0.25 * X[:, 9] +
            0.20 * X[:, 10] + 0.00004 * X[:, 11] + 0.15 * X[:, 12]
        )
        wind_eff   = -1.8 * X[:, 2]
        humid_eff  = 0.4 * (X[:, 1] - 50)
        temp_eff   = np.where(X[:, 0] > 35, 8.0, np.where(X[:, 0] < 10, 5.0, 0))
        pres_eff   = -0.15 * (X[:, 3] - 1013)
        hour_eff   = np.where(((X[:, 4] >= 7) & (X[:, 4] <= 10)) |
                              ((X[:, 4] >= 17) & (X[:, 4] <= 21)), 15.0, 0)
        month_eff  = np.where((X[:, 5] >= 11) | (X[:, 5] <= 2), 20.0,
                     np.where((X[:, 5] >= 6) & (X[:, 5] <= 9), -10.0, 0))
        noise      = np.random.normal(0, 8, n)

        y = base + wind_eff + humid_eff + temp_eff + pres_eff + hour_eff + month_eff + noise
        y = np.clip(y, 0, 500)
        
        return pd.DataFrame(X, columns=self.FEATURES), y

    def train(self):
        print("🚀 Training AirWatch Pro ensemble...")
        X_df, y = self.make_data()
        
        X_scaled = self.scaler.fit_transform(X_df)
        X_scaled_df = pd.DataFrame(X_scaled, columns=self.FEATURES)
        
        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled_df, y, test_size=0.2, random_state=self.random_state
        )

        models_to_train = {
            "gradient_boosting": GradientBoostingRegressor(
                n_estimators=250, learning_rate=0.08, max_depth=5,
                subsample=0.8, random_state=self.random_state
            ),
            "random_forest": RandomForestRegressor(
                n_estimators=250, max_depth=12, min_samples_split=5,
                random_state=self.random_state, n_jobs=-1
            ),
            "adaboost": AdaBoostRegressor(
                n_estimators=150, learning_rate=0.05,
                loss="square", random_state=self.random_state
            ),
            "ridge": Ridge(alpha=2.0)
        }

        for name, mdl in models_to_train.items():
            print(f"  Training {name} ...")
            mdl.fit(X_train, y_train)
            preds = mdl.predict(X_test)
            rmse = np.sqrt(mean_squared_error(y_test, preds))
            r2   = r2_score(y_test, preds)
            print(f"    RMSE={rmse:.2f}  R²={r2:.4f}")
            self.models[name] = mdl

        # Save files
        models_path = os.path.join(self.base_dir, "multi_models.pkl")
        scaler_path = os.path.join(self.base_dir, "scaler.pkl")
        weights_path = os.path.join(self.base_dir, "weights.pkl")
        
        joblib.dump(self.models, models_path)
        joblib.dump(self.scaler, scaler_path)
        joblib.dump(self.weights, weights_path)

        size_kb = os.path.getsize(models_path) / 1024
        print(f"\n✅ Saved {models_path} ({size_kb:.1f} KB)")
        print(f"✅ Saved scaler.pkl and weights.pkl")
        print("👉 Now run:")
        print("   git add backend/model/multi_models.pkl backend/model/scaler.pkl backend/model/weights.pkl")
        print("   git commit -m 'Add ML models trained with sklearn 1.4.2'")
        print("   git push origin main")

def main():
    trainer = MultiModelTrainer()
    trainer.train()

if __name__ == "__main__":
    main()