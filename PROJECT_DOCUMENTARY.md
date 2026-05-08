# 🌬️ AirWatch Pro: Project Documentary
### *Advanced Air Quality Monitoring & AI Prediction System*

---

## 1. 🌟 Project Overview
**AirWatch Pro** is a state-of-the-art environmental monitoring dashboard designed to provide real-time, global air quality insights. By combining live satellite data from multiple APIs with a custom-trained **Stacking Ensemble Machine Learning model**, the project offers both current observations and high-accuracy 24-hour forecasts.

---

## 2. 🎨 Design Philosophy: "The Glassmorphic Future"
The interface was built using a **Premium Glassmorphism** design language.
*   **Aesthetics**: Deep semi-transparent cards, neon glows that change based on AQI severity (Green to Purple), and modern **Outfit** typography.
*   **3D Interaction**: Uses **Three.js** to render a live 3D particle field in the background that reacts to the current pollution level.
*   **Responsiveness**: Fully optimized for "Half-Screen" multi-tasking and "Full-Screen" data-station monitoring.

---

## 3. 🧠 The "Super-Ensemble" ML Architecture
The heart of AirWatch Pro's accuracy is its **Stacking Regressor** (The Meta-Learner).

### Algorithms Used:
1.  **XGBoost (Extreme Gradient Boosting)**: Our primary engine for precision and handling high-dimensional pollutant relationships.
2.  **Random Forest**: Provides robustness and handles "noise" in weather patterns.
3.  **Gradient Boosting**: Fine-tunes the residuals for minimal error.
4.  **Meta-Learner (RidgeCV)**: An "AI that watches the AIs." It analyzes the outputs of the above three models and learns which one is most accurate for specific weather conditions (e.g., trust XGBoost more during high humidity).

---

## 4. 🛰️ Data Ecosystem
AirWatch Pro synchronizes data from the world's most reliable environmental sources:
*   **OpenWeatherMap**: Provides global pollution layers and 5-day forecasts.
*   **WAQI (CPCB)**: Pulls official ground-station data directly from CPCB (Central Pollution Control Board) for India.
*   **IQAir**: Serves as a global verification source for high-confidence AQI.

---

## 5. 🛠️ Technical Implementation
### Frontend Stack:
- **HTML5/JS**: Zero-dependency Vanilla JS for maximum speed.
- **Chart.js**: Powered by the DataLabels and Annotation plugins for "floating" numerical tags and AQI zone markings.
- **FontAwesome**: High-visibility iconography for health advice and weather stats.

### Backend Stack:
- **Flask (Python)**: High-performance micro-framework.
- **SQLAlchemy (MySQL)**: Persistent storage for user accounts and search logs.
- **Flask-Login**: Secure session management with Admin-level permissions.

---

## 6. 🔒 Admin & Security Features
*   **Privacy-First Logging**: Only users with the `Admin` role can view global search history or export data logs.
*   **Search Record Downloads**: Admins can generate instant "Search Receipts" for any city exploration, including timestamp, user ID, and live AQI values.

---

## 7. 🚀 How to Run
1.  **Install Dependencies**: `pip install -r requirements.txt`
2.  **Train the AI**: `python backend/model/train_model.py`
3.  **Launch Dashboard**: `python run.py`
4.  **Access**: Navigate to `http://localhost:5000`

---

### *Developed with a vision for cleaner air and smarter data.*
