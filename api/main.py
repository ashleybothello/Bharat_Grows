"""
Bharat Grows — AI Inference API  v3.0
======================================

MY MODULE: Crop AI + Weather/Rainfall Intelligence

TEAM BOUNDARIES:
  ME      → Crop AI, Weather/Rainfall, Irrigation, Unified Farm Advisory
  TANISH  → Market AI (separate module — not implemented here)
  JADEN+ASHLEY → ESP32 / IoT hardware (sensor data consumed here)

ENDPOINTS:
  --- Preserved (existing, backward-compatible) ---
  POST /predict/crop
  POST /analyze/soil
  POST /predict/irrigation
  POST /predict/risk

  --- New ---
  GET  /weather/current
  GET  /weather/forecast
  GET  /weather/historical
  POST /analyze/farm    ← unified farm advisory

DATA SOURCES:
  Crop model  → model_v1.joblib (Random Forest, Crop_recommendation.csv)
  Weather     → Open-Meteo (CC-BY-4.0) — NOT our AI model
  Historical  → IMD 1901-2015 subdivision rainfall CSV (regional context only)
  Soil        → ESP32 sensor hardware (Jaden/Ashley)
  Market      → Tanish's separate module

⚠ The crop model test accuracy (99.5%) is a benchmark on the training dataset.
  It does NOT represent guaranteed real-world agricultural accuracy.
"""

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import joblib
import json
import numpy as np
from datetime import datetime

from api.services.weather_service import (
    get_current_weather,
    get_forecast_weather,
    get_historical_weather,
    WeatherServiceError,
)
from api.services.rainfall_intelligence import (
    analyze_rainfall,
    decide_irrigation,
    compute_waterlogging_risk,
    THRESHOLDS,
)
from api.services.crop_explainer import generate_crop_explanation
from api.services.historical_rainfall_service import (
    get_subdivision_for_state,
    get_historical_monthly_baseline,
    list_available_subdivisions,
)

app = FastAPI(
    title="Bharat Grows - AI Inference API",
    description=(
        "Crop AI + Weather/Rainfall Intelligence for Bharat Grows. "
        "Part of INNOVIK 6.0 Hackathon 2026."
    ),
    version="3.0.0",
)

# --- Load model at startup ---
try:
    model = joblib.load("model_v1.joblib")
    with open("model_metadata.json", "r") as f:
        metadata = json.load(f)
        FEATURE_ORDER = metadata["features"]
        CLASSES = metadata["classes"]
except Exception as e:
    raise RuntimeError(
        f"Could not load model/metadata. Ensure model_v1.joblib and "
        f"model_metadata.json exist. Error: {str(e)}"
    )

# Default demo location (Indore, MP) — replace with GPS from IoT/mobile
DEFAULT_LAT = 22.7196
DEFAULT_LON = 75.8577


# ============================================================
# Coordinate Validation Helper
# ============================================================

def validate_coordinates(latitude: float, longitude: float):
    if not (-90 <= latitude <= 90):
        raise HTTPException(
            status_code=422,
            detail=f"latitude must be between -90 and 90, got {latitude}",
        )
    if not (-180 <= longitude <= 180):
        raise HTTPException(
            status_code=422,
            detail=f"longitude must be between -180 and 180, got {longitude}",
        )


# ============================================================
# Pydantic Models — EXISTING (preserved exactly)
# ============================================================

class CropPredictionRequest(BaseModel):
    N: float
    P: float
    K: float
    temperature: float
    humidity: float
    ph: float
    rainfall: float


class CropRecommendation(BaseModel):
    crop: str
    probability: float


class CropPredictionResponse(BaseModel):
    recommended_crop: str
    model_score: float
    top_3_crops: List[CropRecommendation]
    feature_order_used: List[str]


class SoilAnalysisRequest(BaseModel):
    N: float
    P: float
    K: float
    ph: float


class SoilAnalysisResponse(BaseModel):
    nitrogen_status: str
    phosphorus_status: str
    potassium_status: str
    ph_status: str
    explanation: str
    actionable_advisory: str


class IrrigationPredictionRequest(BaseModel):
    soil_moisture: float
    temperature: float
    humidity: float
    rainfall: float
    expected_rainfall: Optional[float] = 0.0
    crop: str


class IrrigationPredictionResponse(BaseModel):
    irrigation_decision: str
    explanation: str
    factors_used: Dict[str, float]


class RiskPredictionRequest(BaseModel):
    soil_moisture: float
    N: float
    temperature: float
    expected_rainfall: Optional[float] = 0.0


class RiskPredictionResponse(BaseModel):
    farm_health_score: float
    risk_level: str
    top_contributing_concerns: List[str]
    explanation: str


# ============================================================
# Pydantic Models — NEW
# ============================================================

class FarmAnalysisRequest(BaseModel):
    N: float = Field(..., description="Nitrogen (kg/ha) from ESP32")
    P: float = Field(..., description="Phosphorus (kg/ha) from ESP32")
    K: float = Field(..., description="Potassium (kg/ha) from ESP32")
    temperature: float = Field(..., description="Temperature °C (sensor or ambient)")
    humidity: float = Field(..., description="Humidity % (sensor or ambient)")
    ph: float = Field(..., description="Soil pH from ESP32")
    soil_moisture: float = Field(..., description="Soil moisture % from ESP32")
    latitude: float = Field(DEFAULT_LAT, description="Farm latitude")
    longitude: float = Field(DEFAULT_LON, description="Farm longitude")
    state: Optional[str] = Field(
        None,
        description="Indian state name (optional) — enables historical rainfall baseline",
    )

    @validator("latitude")
    def lat_range(cls, v):
        if not (-90 <= v <= 90):
            raise ValueError(f"latitude must be between -90 and 90")
        return v

    @validator("longitude")
    def lon_range(cls, v):
        if not (-180 <= v <= 180):
            raise ValueError(f"longitude must be between -180 and 180")
        return v


class CropWithScore(BaseModel):
    crop: str
    score: float


class WeatherBlock(BaseModel):
    temperature_c: Optional[float]
    humidity_percent: Optional[int]
    rainfall_today_mm: float
    rainfall_next_24h_mm: float
    rainfall_next_3_days_mm: float
    forecast_trend: str
    source: str


class HistoricalRainfallBlock(BaseModel):
    available: bool
    subdivision: Optional[str] = None
    monthly_baseline_mm: Optional[float] = None
    period: str = "1901-2015"
    source: str = "IMD Subdivision-level historical rainfall dataset"
    geographic_note: Optional[str] = None
    anomaly: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None


class RainfallIntelligenceBlock(BaseModel):
    forecast_trend: str
    dry_spell_risk: str
    heavy_rain_risk: str
    waterlogging_risk: str
    deviation_mm: Optional[float] = None
    deviation_percent: Optional[float] = None
    historical_comparison: Optional[str] = None


class IrrigationBlock(BaseModel):
    decision: str
    reason: str


class FarmAnalysisResponse(BaseModel):
    recommended_crops: List[CropWithScore]
    crop_explanation: str
    weather: WeatherBlock
    historical_rainfall: HistoricalRainfallBlock
    rainfall_intelligence: RainfallIntelligenceBlock
    irrigation: IrrigationBlock
    data_sources: Dict[str, str]
    disclaimer: str


# ============================================================
# EXISTING Endpoints — preserved exactly
# ============================================================

@app.post("/predict/crop", response_model=CropPredictionResponse)
def predict_crop(request: CropPredictionRequest):
    try:
        X = np.array([[
            request.N, request.P, request.K,
            request.temperature, request.humidity,
            request.ph, request.rainfall,
        ]])
        probs = model.predict_proba(X)[0]
        top_3_idx = probs.argsort()[-3:][::-1]
        top_3 = [
            CropRecommendation(crop=CLASSES[i], probability=round(float(probs[i]), 4))
            for i in top_3_idx
        ]
        return CropPredictionResponse(
            recommended_crop=top_3[0].crop,
            model_score=top_3[0].probability,
            top_3_crops=top_3,
            feature_order_used=FEATURE_ORDER,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/soil", response_model=SoilAnalysisResponse)
def analyze_soil(request: SoilAnalysisRequest):
    def nutrient_status(val, low, high):
        return "LOW" if val < low else ("HIGH" if val > high else "OPTIMAL")

    n_stat = nutrient_status(request.N, 40, 100)
    p_stat = nutrient_status(request.P, 20, 60)
    k_stat = nutrient_status(request.K, 20, 60)
    ph_stat = (
        "ACIDIC" if request.ph < 5.5
        else "ALKALINE" if request.ph > 7.5
        else "OPTIMAL"
    )

    concerns = []
    if n_stat == "LOW":   concerns.append("Nitrogen deficiency")
    if p_stat == "LOW":   concerns.append("Phosphorus deficiency")
    if k_stat == "LOW":   concerns.append("Potassium deficiency")
    if ph_stat != "OPTIMAL": concerns.append(f"pH level is {ph_stat.lower()}")

    if not concerns:
        explanation = "Soil health is optimal."
        advisory = "Maintain current practices. No immediate fertilizer action required."
    else:
        explanation = f"Detected sub-optimal conditions: {', '.join(concerns)}."
        advisory = (
            "Consider soil amendments to address identified deficiencies "
            "before planting or during the next fertigation cycle."
        )
    return SoilAnalysisResponse(
        nitrogen_status=n_stat, phosphorus_status=p_stat,
        potassium_status=k_stat, ph_status=ph_stat,
        explanation=explanation, actionable_advisory=advisory,
    )


@app.post("/predict/irrigation", response_model=IrrigationPredictionResponse)
def predict_irrigation(request: IrrigationPredictionRequest):
    if request.expected_rainfall > 10.0:
        decision, reason = "WAIT", "Significant rainfall expected soon"
    elif request.soil_moisture > 60.0:
        decision, reason = "WAIT", "Soil moisture is currently high enough"
    elif request.soil_moisture < 30.0:
        decision = "IRRIGATE"
        reason = (
            "Critical low moisture with high heat stress"
            if request.temperature > 35.0
            else "Soil moisture below optimal threshold"
        )
    else:
        decision, reason = "MONITOR", "Moisture is adequate, no immediate action required"

    return IrrigationPredictionResponse(
        irrigation_decision=decision,
        explanation=reason + ".",
        factors_used={
            "soil_moisture": request.soil_moisture,
            "temperature": request.temperature,
            "expected_rainfall": request.expected_rainfall,
        },
    )


@app.post("/predict/risk", response_model=RiskPredictionResponse)
def predict_risk(request: RiskPredictionRequest):
    score, concerns = 0, []
    if request.soil_moisture < 20:
        score += 40; concerns.append("Severe water stress")
    elif request.soil_moisture < 35:
        score += 20; concerns.append("Moderate water stress")
    if request.temperature > 40:
        score += 30; concerns.append("Extreme heat stress")
    if request.N < 30:
        score += 25; concerns.append("Severe nutrient deficiency (Nitrogen)")
    if request.expected_rainfall > 100:
        score += 50; concerns.append("Flood/Waterlogging risk")
    score = min(score, 100)
    level = "LOW" if score < 20 else ("MODERATE" if score < 50 else "HIGH")
    explanation = (
        "Farm conditions are stable. No significant risks detected."
        if not concerns
        else "Multiple risk factors detected requiring attention."
    )
    return RiskPredictionResponse(
        farm_health_score=float(100 - score),
        risk_level=level,
        top_contributing_concerns=concerns,
        explanation=explanation,
    )


# ============================================================
# NEW Endpoints — Weather
# ============================================================

@app.get("/weather/current")
def weather_current(
    latitude: float = Query(DEFAULT_LAT, description="Farm latitude"),
    longitude: float = Query(DEFAULT_LON, description="Farm longitude"),
):
    """Current weather from Open-Meteo for given coordinates."""
    validate_coordinates(latitude, longitude)
    try:
        return get_current_weather(latitude, longitude)
    except WeatherServiceError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/weather/forecast")
def weather_forecast(
    latitude: float = Query(DEFAULT_LAT),
    longitude: float = Query(DEFAULT_LON),
    forecast_days: int = Query(3, ge=1, le=7),
):
    """Forecast from Open-Meteo (1–7 days)."""
    validate_coordinates(latitude, longitude)
    try:
        return get_forecast_weather(latitude, longitude, forecast_days)
    except WeatherServiceError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/weather/historical")
def weather_historical(
    latitude: float = Query(DEFAULT_LAT),
    longitude: float = Query(DEFAULT_LON),
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
):
    """
    Historical weather from Open-Meteo Archive API.
    Useful for analysis and future ML feature engineering.
    Returns daily precipitation, rain, and temperature.
    """
    validate_coordinates(latitude, longitude)
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
        datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD format")
    try:
        return get_historical_weather(latitude, longitude, start_date, end_date)
    except WeatherServiceError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ============================================================
# NEW: Unified Farm Analysis
# ============================================================

@app.post("/analyze/farm", response_model=FarmAnalysisResponse)
def analyze_farm(request: FarmAnalysisRequest):
    """
    Unified farm advisory combining:
      - Crop recommendation (ML model V1)
      - Live + forecast weather (Open-Meteo)
      - Historical rainfall baseline (IMD 1901-2015)
      - Rainfall intelligence (rule-based)
      - Irrigation decision (rule-based)

    For Tanish: recommended_crops field is ready for Market AI consumption.
    For Jaden/Ashley: latitude/longitude accepts GPS from IoT hardware.
    """

    # --- Step 1: Fetch weather (single call covers current + forecast) ---
    weather_available = False
    current_wx = None
    forecast_wx = None
    try:
        current_wx = get_current_weather(request.latitude, request.longitude)
        forecast_wx = get_forecast_weather(request.latitude, request.longitude, forecast_days=3)
        weather_available = True
    except WeatherServiceError:
        pass  # graceful fallback below

    # Live temperature/humidity from Open-Meteo if available, else sensor fallback
    live_temp = (current_wx.get("temperature_c") or request.temperature) if current_wx else request.temperature
    live_humidity = (current_wx.get("humidity_pct") or request.humidity) if current_wx else request.humidity

    # --- Step 2: Rainfall analysis ---
    if weather_available and forecast_wx:
        rain_analysis = analyze_rainfall(
            forecast_daily=forecast_wx.get("daily", []),
            forecast_hourly=forecast_wx.get("hourly", []),
            current_precipitation_mm=(current_wx.get("precipitation_mm", 0.0) if current_wx else 0.0),
            subdivision=_resolve_subdivision(request.state),
            month_number=datetime.now().month,
        )
    else:
        rain_analysis = {
            "rainfall_today_mm": 0.0,
            "rainfall_next_24h_mm": 0.0,
            "rainfall_next_3_days_mm": 0.0,
            "rainfall_trend": "UNAVAILABLE",
            "dry_spell_risk": "UNKNOWN",
            "heavy_rain_risk": "UNKNOWN",
            "waterlogging_risk": "UNKNOWN",
            "historical_context": {
                "available": False,
                "reason": "Open-Meteo unavailable; falling back to sensor values.",
                "period": "1901-2015",
                "source": "IMD Subdivision-level historical rainfall dataset",
            },
        }

    # --- Step 3: Waterlogging risk incorporating soil moisture ---
    waterlogging_risk = compute_waterlogging_risk(
        soil_moisture=request.soil_moisture,
        rainfall_next_3_days_mm=rain_analysis["rainfall_next_3_days_mm"],
        rainfall_next_24h_mm=rain_analysis["rainfall_next_24h_mm"],
    )
    rain_analysis["waterlogging_risk"] = waterlogging_risk

    # --- Step 4: Crop model (use today's forecast rainfall as the rainfall feature) ---
    rainfall_for_model = rain_analysis["rainfall_today_mm"]
    X = np.array([[
        request.N, request.P, request.K,
        live_temp, live_humidity, request.ph,
        rainfall_for_model,
    ]])
    probs = model.predict_proba(X)[0]
    top_3_idx = probs.argsort()[-3:][::-1]
    recommended_crops = [
        CropWithScore(crop=CLASSES[i], score=round(float(probs[i]), 4))
        for i in top_3_idx
    ]

    # --- Step 5: Crop explanation ---
    crop_explanation = generate_crop_explanation(
        recommended_crop=recommended_crops[0].crop,
        score=recommended_crops[0].score,
        inputs={
            "N": request.N, "P": request.P, "K": request.K,
            "temperature": live_temp, "humidity": live_humidity,
            "ph": request.ph, "rainfall": rainfall_for_model,
        },
    )

    # --- Step 6: Irrigation decision ---
    irrigation = decide_irrigation(
        soil_moisture=request.soil_moisture,
        temperature=live_temp,
        humidity=live_humidity,
        rainfall_next_24h_mm=rain_analysis["rainfall_next_24h_mm"],
        rainfall_next_3_days_mm=rain_analysis["rainfall_next_3_days_mm"],
        waterlogging_risk=waterlogging_risk,
    )

    # --- Step 7: Build historical rainfall block ---
    hist_ctx = rain_analysis.get("historical_context", {})
    anomaly = hist_ctx.get("anomaly", {}) if hist_ctx.get("available") else None

    historical_block = HistoricalRainfallBlock(
        available=hist_ctx.get("available", False),
        subdivision=hist_ctx.get("subdivision"),
        monthly_baseline_mm=hist_ctx.get("monthly_baseline_mm"),
        period=hist_ctx.get("period", "1901-2015"),
        source=hist_ctx.get("source", "IMD Subdivision-level historical rainfall dataset"),
        geographic_note=hist_ctx.get("geographic_note"),
        anomaly=anomaly if anomaly else None,
        reason=hist_ctx.get("reason"),
    )

    # --- Step 8: Build rainfall intelligence block ---
    deviation_mm = anomaly.get("deviation_mm") if anomaly else None
    deviation_pct = anomaly.get("deviation_percent") if anomaly else None
    historical_comparison = anomaly.get("label") if anomaly else "UNAVAILABLE"

    rainfall_intelligence_block = RainfallIntelligenceBlock(
        forecast_trend=rain_analysis["rainfall_trend"],
        dry_spell_risk=rain_analysis["dry_spell_risk"],
        heavy_rain_risk=rain_analysis["heavy_rain_risk"],
        waterlogging_risk=waterlogging_risk,
        deviation_mm=deviation_mm,
        deviation_percent=deviation_pct,
        historical_comparison=historical_comparison,
    )

    # --- Step 9: Assemble response ---
    weather_source = (
        "Open-Meteo (CC-BY-4.0)"
        if weather_available
        else "UNAVAILABLE — sensor values used as fallback"
    )

    return FarmAnalysisResponse(
        recommended_crops=recommended_crops,
        crop_explanation=crop_explanation,
        weather=WeatherBlock(
            temperature_c=live_temp,
            humidity_percent=int(live_humidity),
            rainfall_today_mm=rain_analysis["rainfall_today_mm"],
            rainfall_next_24h_mm=rain_analysis["rainfall_next_24h_mm"],
            rainfall_next_3_days_mm=rain_analysis["rainfall_next_3_days_mm"],
            forecast_trend=rain_analysis["rainfall_trend"],
            source=weather_source,
        ),
        historical_rainfall=historical_block,
        rainfall_intelligence=rainfall_intelligence_block,
        irrigation=IrrigationBlock(
            decision=irrigation["decision"],
            reason=irrigation["reason"],
        ),
        data_sources={
            "crop_ai": "Random Forest (model_v1.joblib) trained on Crop_recommendation.csv",
            "weather_current_forecast": "Open-Meteo (CC-BY-4.0) — https://open-meteo.com",
            "historical_rainfall": "IMD Subdivision-level dataset 1901-2015 (Kaggle)",
            "soil_sensors": "ESP32 IoT hardware (Jaden/Ashley)",
            "market_intelligence": "Tanish's Market AI module (separate)",
        },
        disclaimer=(
            "Crop model accuracy of 99.5% is a benchmark on a standardised "
            "training dataset. It does NOT represent real-world field accuracy. "
            "Weather data is from Open-Meteo (CC-BY-4.0). Historical rainfall is "
            "regional subdivision-level context, not farm-level data. "
            "Irrigation recommendations are advisory only."
        ),
    )


def _resolve_subdivision(state: Optional[str]) -> Optional[str]:
    """Resolve a state name to an IMD subdivision, or None if unavailable."""
    if not state:
        return None
    return get_subdivision_for_state(state)
