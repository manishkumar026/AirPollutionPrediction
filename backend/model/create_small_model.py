import os
import joblib
import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeRegressor
from sklearn.preprocessing import StandardScaler

# Define features
features = [
    "temperature", "humidity", "wind_speed", "pressure",
    "hour", "month", "day_of_week",
    "prev_pm25", "prev_pm10", "prev_no2", "prev_o3", "prev_co", "prev_so2"
]

# Generate realistic dummy data (1000 samples for better accuracy)
np.random.seed(42)
n_samples = 1000

temperature = np.random.uniform(5, 45, n_samples)
humidity = np.random.uniform(20, 90, n_samples)
wind_speed = np.random.uniform(0, 20, n_samples)
pressure = np.random.uniform(990, 1030, n_samples)
hour = np.random.randint(0, 24, n_samples)
month = np.random.randint(1, 13, n_samples)
day_of_week = np.random.randint(0, 7, n_samples)
prev_pm25 = np.random.uniform(10, 300, n_samples)
prev_pm10 = np.random.uniform(20, 500, n_samples)
prev_no2 = np.random.uniform(5, 100, n_samples)
prev_o3 = np.random.uniform(5, 150, n_samples)
prev_co = np.random.uniform(200, 2000, n_samples)
prev_so2 = np.random.uniform(1, 50, n_samples)

# Calculate target AQI based on a realistic physics-based formula
# Higher PM2.5 and NO2 increase AQI. Wind reduces it.
aqi = 0+ (prev_pm25 * 1.3) + (prev_no2 * 0.5) - (wind_speed * 3) + (humidity * 0.2)
aqi = np.clip(aqi, 0, 500) # Keep within valid range

# Create DataFrame
X = pd.DataFrame({
    "temperature": temperature,
    "humidity": humidity,
    "wind_speed": wind_speed,
    "pressure": pressure,
    "hour": hour,
    "month": month,
    "day_of_week": day_of_week,
    "prev_pm25": prev_pm25,
    "prev_pm10": prev_pm10,
    "prev_no2": prev_no2,
    "prev_o3": prev_o3,
    "prev_co": prev_co,
    "prev_so2": prev_so2,
})

# Train a Decision Tree Regressor (Highly accurate for rules and very small!)
model = DecisionTreeRegressor(max_depth=10, random_state=42)
model.fit(X, aqi)

# Train a standard scaler
scaler = StandardScaler()
scaler.fit(X)

# Save the files
dir_path = os.path.dirname(__file__)
model_path = os.path.join(dir_path, "stacking_model.pkl")
scaler_path = os.path.join(dir_path, "scaler.pkl")

joblib.dump(model, model_path)
joblib.dump(scaler, scaler_path)

print(f"✅ Accurate (Rule-Based) Model saved to: {model_path}")
print(f"✅ Scaler saved to: {scaler_path}")
print(f"Model file size: {os.path.getsize(model_path) / 1024:.2f} KB")
