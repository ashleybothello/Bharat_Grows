"""
BharatGrow — ML Inference Service
=================================

Runs on port 8000. Only the Express backend on :5005 talks to it; the React
frontend never reaches this service and never sees model artifacts.

WHAT IS AND IS NOT A MODEL HERE
-------------------------------
Crop intelligence IS a trained model:
  crop_xgb_model.pkl — VotingClassifier(soft) over XGBoost + RandomForest,
  37 crop classes, 4800 samples, held-out test accuracy 0.9604.
  Features, in the order enforced by scaler.pkl:
  N, P, K, temperature, humidity, ph, rainfall.

Rainfall intelligence is NOT a model. It is rule-based analysis over live
Open-Meteo forecast data plus an IMD 1901-2015 subdivision rainfall baseline.
It produces risk levels and an irrigation decision, not a learned forecast.
Endpoint names and response fields reflect that distinction deliberately.

The decision engine is NOT a model either — it is documented, deterministic
project scoring logic that combines the above with Government OGD market
prices supplied by Express.

ENDPOINTS
  GET  /health                  service + artifact status
  POST /api/predict             PRESERVED — existing soil analysis contract
  GET  /api/metrics             PRESERVED — training metrics
  POST /predict/crop            crop model, real predict_proba top-k
  POST /rainfall/intelligence   rule-based rainfall analysis + irrigation
  POST /analyze/soil            rule-based nutrient status
  POST /predict/irrigation      rule-based irrigation decision
  POST /predict/risk            rule-based farm risk score
  GET  /weather/current         Open-Meteo (CC-BY-4.0)
  GET  /weather/forecast        Open-Meteo (CC-BY-4.0)
  GET  /weather/historical      Open-Meteo Archive (CC-BY-4.0)
  POST /analyze/farm            crop model + rainfall intelligence combined
  POST /decide/crop             /analyze/farm + market prices -> ranked decision
"""

from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from crop_model import FEATURE_ORDER, CropModelUnavailable, crop_model
from decision_engine import rank_crops
from services.crop_explainer import generate_crop_explanation
from services.historical_rainfall_service import get_subdivision_for_state
from services.rainfall_intelligence import (
    analyze_rainfall,
    compute_waterlogging_risk,
    decide_irrigation,
)
from services.weather_service import (
    WeatherServiceError,
    get_current_weather,
    get_forecast_weather,
    get_historical_weather,
)

app = FastAPI(
    title="BharatGrow ML Service",
    description="Crop model + rainfall intelligence + crop decision engine.",
    version="2.0.0",
)

# Demo coordinates (Indore, MP). Real values come from the farmer profile or,
# later, GPS reported by the ESP32 nodes.
DEFAULT_LAT = 22.7196
DEFAULT_LON = 75.8577


@app.on_event("startup")
def startup() -> None:
    crop_model.load()
    if crop_model.ready:
        acc = crop_model.test_accuracy
        print(f"[crop model] loaded — {len(crop_model.classes)} classes, "
              f"test accuracy {acc:.4f}" if acc else "[crop model] loaded")
        print(f"[crop model] feature order: {FEATURE_ORDER}")
    else:
        print(f"[crop model] NOT LOADED: {crop_model.load_error}")

    try:
        from services.historical_rainfall_service import list_available_subdivisions
        print(f"[rainfall] IMD baseline ready — "
              f"{len(list_available_subdivisions())} subdivisions (1901-2015)")
    except Exception as e:
        print(f"[rainfall] IMD baseline unavailable: {e}")


def validate_coordinates(latitude: float, longitude: float) -> None:
    if not (-90 <= latitude <= 90):
        raise HTTPException(422, f"latitude must be between -90 and 90, got {latitude}")
    if not (-180 <= longitude <= 180):
        raise HTTPException(422, f"longitude must be between -180 and 180, got {longitude}")


def require_crop_model() -> None:
    if not crop_model.ready:
        raise HTTPException(
            503,
            f"Crop model unavailable: {crop_model.load_error or 'artifacts not loaded'}",
        )


# ============================================================
# Health
# ============================================================

@app.get("/health")
def health():
    try:
        from services.historical_rainfall_service import list_available_subdivisions
        subdivisions = len(list_available_subdivisions())
        rainfall_ok = True
    except Exception:
        subdivisions = 0
        rainfall_ok = False

    return {
        "status": "ok" if crop_model.ready else "degraded",
        "crop_model": {
            "loaded": crop_model.ready,
            "error": crop_model.load_error,
            "classes": len(crop_model.classes),
            "feature_order": FEATURE_ORDER,
            "test_accuracy": crop_model.test_accuracy,
        },
        "rainfall_intelligence": {
            "type": "rule-based (not a trained model)",
            "historical_baseline_loaded": rainfall_ok,
            "subdivisions": subdivisions,
        },
    }


# ============================================================
# PRESERVED — existing soil analysis contract used by Express /predict
# ============================================================

class SoilInput(BaseModel):
    n: float
    p: float
    k: float
    temperature: float
    humidity: float
    ph: float
    rainfall: float
    moisture: float


def check_soil_health(data: SoilInput):
    tips = []
    issues = 0

    # Ideal ranges: N (50-150), P (16-45), K (120-240), pH (6-7.5), Moisture (20-80)
    if data.n < 50:
        tips.append("Add Nitrogen-rich fertilizers like Urea.")
        issues += 1
    elif data.n > 150:
        tips.append("Reduce Nitrogen fertilizers; consider planting nitrogen-absorbing catch crops.")
        issues += 1

    if data.p < 16:
        tips.append("Add phosphorus-rich fertilizers like Bone Meal.")
        issues += 1
    elif data.p > 45:
        tips.append("Phosphorus is high; avoid adding P-fertilizers.")
        issues += 1

    if data.k < 120:
        tips.append("Add Potassium (Potash) to improve root growth and crop yield.")
        issues += 1

    if data.ph < 6.0:
        tips.append("Soil is acidic. Apply agricultural lime (crushed limestone).")
        issues += 1
    elif data.ph > 7.5:
        tips.append("Soil is alkaline. Add organic matter like compost or elemental sulfur.")
        issues += 1

    if data.moisture < 20:
        tips.append("Soil is too dry. Increase irrigation frequency and use mulch.")
        issues += 1
    elif data.moisture > 80:
        tips.append("Soil is waterlogged. Improve drainage systems.")
        issues += 1

    if issues == 0:
        quality = "Good"
        tips.append("Maintain current organic compost routines.")
    elif issues <= 2:
        quality = "Moderate"
    else:
        quality = "Poor"
        tips.append("Implement crop rotation using leguminous plants to restore balance naturally.")

    return quality, tips


@app.post("/api/predict")
def predict_soil(data: SoilInput):
    require_crop_model()

    quality, tips = check_soil_health(data)

    try:
        prediction = crop_model.predict(
            {
                "N": data.n, "P": data.p, "K": data.k,
                "temperature": data.temperature, "humidity": data.humidity,
                "ph": data.ph, "rainfall": data.rainfall,
            },
            top_k=2,
        )
    except CropModelUnavailable as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))

    best_crops = [c["crop"] for c in prediction["top_crops"]]
    crop_confidences = [
        {"crop": c["crop"], "confidence": c["probability"]}
        for c in prediction["top_crops"]
    ]

    if quality == "Poor":
        tips.append(f"Consider growing soil-restoring crops alongside {best_crops[0]}.")
    elif quality == "Good":
        tips.append(f"Ideal conditions for high-yield {best_crops[0]}.")

    return {
        "soil_quality": quality,
        "recommended_crops": best_crops,
        "improvement_tips": tips,
        "prediction_confidence": prediction["model_probability"],
        "crop_confidences": crop_confidences,
        "model_accuracy": crop_model.test_accuracy,
    }


@app.get("/api/metrics")
def get_metrics():
    if not crop_model.metrics:
        raise HTTPException(404, "Metrics not found. Train the model first.")
    return crop_model.metrics


# ============================================================
# Crop model
# ============================================================

class CropPredictionRequest(BaseModel):
    """Field observation in the crop model's own feature vocabulary."""
    N: float = Field(..., description="Nitrogen (kg/ha)")
    P: float = Field(..., description="Phosphorus (kg/ha)")
    K: float = Field(..., description="Potassium (kg/ha)")
    temperature: float = Field(..., description="Temperature (°C)")
    humidity: float = Field(..., description="Relative humidity (%)")
    ph: float = Field(..., description="Soil pH")
    rainfall: float = Field(..., description="Rainfall (mm)")
    top_k: int = Field(3, ge=1, le=10)
    # Populated later by the ESP32 telemetry pipeline. Not used for prediction.
    device_id: Optional[str] = Field(None, description="e.g. BG-NODE-001")


@app.post("/predict/crop")
def predict_crop(request: CropPredictionRequest):
    require_crop_model()
    try:
        result = crop_model.predict(request.model_dump(), top_k=request.top_k)
    except CropModelUnavailable as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))

    result["device_id"] = request.device_id
    result["model"] = {
        "algorithm": "VotingClassifier(soft) — XGBoost + RandomForest",
        "artifact": "crop_xgb_model.pkl",
        "preprocessing": "StandardScaler (scaler.pkl) applied before inference",
        "classes": len(crop_model.classes),
        "test_accuracy": crop_model.test_accuracy,
        "accuracy_note": (
            "Held-out test accuracy on the training dataset. Not a guarantee of "
            "real-world field accuracy."
        ),
    }
    return result


# ============================================================
# Rainfall intelligence — rule-based, explicitly not a forecast model
# ============================================================

class RainfallIntelligenceRequest(BaseModel):
    latitude: float = Field(DEFAULT_LAT)
    longitude: float = Field(DEFAULT_LON)
    state: Optional[str] = Field(
        None, description="Indian state — enables the IMD historical baseline"
    )
    soil_moisture: Optional[float] = Field(
        None, description="Soil moisture % — sharpens waterlogging risk when present"
    )
    device_id: Optional[str] = Field(None, description="e.g. BG-NODE-001")

    @field_validator("latitude")
    @classmethod
    def _lat(cls, v):
        if not (-90 <= v <= 90):
            raise ValueError("latitude must be between -90 and 90")
        return v

    @field_validator("longitude")
    @classmethod
    def _lon(cls, v):
        if not (-180 <= v <= 180):
            raise ValueError("longitude must be between -180 and 180")
        return v


RAINFALL_METHOD = {
    "type": "rule-based analysis — NOT a trained rainfall model",
    "forecast_horizon": "today, next 24 hours, next 3 days",
    "forecast_source": "Open-Meteo (CC-BY-4.0)",
    "historical_baseline": (
        "IMD subdivision-level monthly rainfall 1901-2015; regional context only, "
        "not farm-level"
    ),
    "units": "millimetres (mm)",
}


def _build_rainfall_intelligence(
    latitude: float,
    longitude: float,
    state: Optional[str],
    soil_moisture: Optional[float],
) -> Dict[str, Any]:
    """Fetch weather and run the rule-based rainfall analysis. Raises on outage."""
    current = get_current_weather(latitude, longitude)
    forecast = get_forecast_weather(latitude, longitude, forecast_days=3)

    subdivision = get_subdivision_for_state(state) if state else None

    analysis = analyze_rainfall(
        forecast_daily=forecast.get("daily", []),
        forecast_hourly=forecast.get("hourly", []),
        current_precipitation_mm=current.get("precipitation_mm", 0.0),
        subdivision=subdivision,
        month_number=datetime.now().month,
    )

    if soil_moisture is not None:
        analysis["waterlogging_risk"] = compute_waterlogging_risk(
            soil_moisture=soil_moisture,
            rainfall_next_3_days_mm=analysis["rainfall_next_3_days_mm"],
            rainfall_next_24h_mm=analysis["rainfall_next_24h_mm"],
        )

    analysis["current_weather"] = current
    analysis["method"] = RAINFALL_METHOD
    return analysis


@app.post("/rainfall/intelligence")
def rainfall_intelligence(request: RainfallIntelligenceRequest):
    validate_coordinates(request.latitude, request.longitude)
    try:
        analysis = _build_rainfall_intelligence(
            request.latitude, request.longitude, request.state, request.soil_moisture
        )
    except WeatherServiceError as e:
        raise HTTPException(503, f"Weather data unavailable: {e}")

    irrigation = decide_irrigation(
        soil_moisture=request.soil_moisture if request.soil_moisture is not None else 50.0,
        temperature=analysis["current_weather"].get("temperature_c") or 0.0,
        humidity=analysis["current_weather"].get("humidity_pct") or 0.0,
        rainfall_next_24h_mm=analysis["rainfall_next_24h_mm"],
        rainfall_next_3_days_mm=analysis["rainfall_next_3_days_mm"],
        waterlogging_risk=analysis["waterlogging_risk"],
    ) if request.soil_moisture is not None else None

    analysis["irrigation"] = irrigation
    analysis["device_id"] = request.device_id
    return analysis


# ============================================================
# Rule-based soil / irrigation / risk — ported from the AI branch
# ============================================================

class SoilAnalysisRequest(BaseModel):
    N: float
    P: float
    K: float
    ph: float


@app.post("/analyze/soil")
def analyze_soil(request: SoilAnalysisRequest):
    def nutrient_status(val, low, high):
        return "LOW" if val < low else ("HIGH" if val > high else "OPTIMAL")

    n_stat = nutrient_status(request.N, 40, 100)
    p_stat = nutrient_status(request.P, 20, 60)
    k_stat = nutrient_status(request.K, 20, 60)
    ph_stat = "ACIDIC" if request.ph < 5.5 else "ALKALINE" if request.ph > 7.5 else "OPTIMAL"

    concerns = []
    if n_stat == "LOW":
        concerns.append("Nitrogen deficiency")
    if p_stat == "LOW":
        concerns.append("Phosphorus deficiency")
    if k_stat == "LOW":
        concerns.append("Potassium deficiency")
    if ph_stat != "OPTIMAL":
        concerns.append(f"pH level is {ph_stat.lower()}")

    if not concerns:
        explanation = "Soil health is optimal."
        advisory = "Maintain current practices. No immediate fertilizer action required."
    else:
        explanation = f"Detected sub-optimal conditions: {', '.join(concerns)}."
        advisory = (
            "Consider soil amendments to address identified deficiencies "
            "before planting or during the next fertigation cycle."
        )

    return {
        "nitrogen_status": n_stat,
        "phosphorus_status": p_stat,
        "potassium_status": k_stat,
        "ph_status": ph_stat,
        "explanation": explanation,
        "actionable_advisory": advisory,
        "method": "rule-based nutrient thresholds — not a trained model",
    }


class IrrigationPredictionRequest(BaseModel):
    soil_moisture: float
    temperature: float
    humidity: float
    rainfall: float
    expected_rainfall: Optional[float] = 0.0
    crop: str = ""


@app.post("/predict/irrigation")
def predict_irrigation(request: IrrigationPredictionRequest):
    result = decide_irrigation(
        soil_moisture=request.soil_moisture,
        temperature=request.temperature,
        humidity=request.humidity,
        rainfall_next_24h_mm=request.expected_rainfall or 0.0,
        rainfall_next_3_days_mm=request.expected_rainfall or 0.0,
        crop=request.crop,
    )
    return {
        "irrigation_decision": result["decision"],
        "explanation": result["reason"],
        "factors_used": result["factors_used"],
        "method": "rule-based irrigation thresholds — not a trained model",
    }


class RiskPredictionRequest(BaseModel):
    soil_moisture: float
    N: float
    temperature: float
    expected_rainfall: Optional[float] = 0.0


@app.post("/predict/risk")
def predict_risk(request: RiskPredictionRequest):
    score, concerns = 0, []
    if request.soil_moisture < 20:
        score += 40
        concerns.append("Severe water stress")
    elif request.soil_moisture < 35:
        score += 20
        concerns.append("Moderate water stress")
    if request.temperature > 40:
        score += 30
        concerns.append("Extreme heat stress")
    if request.N < 30:
        score += 25
        concerns.append("Severe nutrient deficiency (Nitrogen)")
    if (request.expected_rainfall or 0.0) > 100:
        score += 50
        concerns.append("Flood/Waterlogging risk")

    score = min(score, 100)
    level = "LOW" if score < 20 else ("MODERATE" if score < 50 else "HIGH")

    return {
        "farm_health_score": float(100 - score),
        "risk_level": level,
        "top_contributing_concerns": concerns,
        "explanation": (
            "Farm conditions are stable. No significant risks detected."
            if not concerns
            else "Multiple risk factors detected requiring attention."
        ),
        "method": "rule-based risk thresholds — not a trained model",
    }


# ============================================================
# Weather passthrough — Open-Meteo (CC-BY-4.0)
# ============================================================

@app.get("/weather/current")
def weather_current(
    latitude: float = Query(DEFAULT_LAT),
    longitude: float = Query(DEFAULT_LON),
):
    validate_coordinates(latitude, longitude)
    try:
        return get_current_weather(latitude, longitude)
    except WeatherServiceError as e:
        raise HTTPException(503, str(e))


@app.get("/weather/forecast")
def weather_forecast(
    latitude: float = Query(DEFAULT_LAT),
    longitude: float = Query(DEFAULT_LON),
    forecast_days: int = Query(3, ge=1, le=7),
):
    validate_coordinates(latitude, longitude)
    try:
        return get_forecast_weather(latitude, longitude, forecast_days)
    except WeatherServiceError as e:
        raise HTTPException(503, str(e))


@app.get("/weather/historical")
def weather_historical(
    latitude: float = Query(DEFAULT_LAT),
    longitude: float = Query(DEFAULT_LON),
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
):
    validate_coordinates(latitude, longitude)
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
        datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(422, "Dates must be YYYY-MM-DD format")
    try:
        return get_historical_weather(latitude, longitude, start_date, end_date)
    except WeatherServiceError as e:
        raise HTTPException(503, str(e))


# ============================================================
# Unified farm analysis and decision engine
# ============================================================

class FarmAnalysisRequest(BaseModel):
    N: float = Field(..., description="Nitrogen (kg/ha)")
    P: float = Field(..., description="Phosphorus (kg/ha)")
    K: float = Field(..., description="Potassium (kg/ha)")
    ph: float = Field(..., description="Soil pH")
    temperature: float = Field(..., description="Temperature °C — sensor or ambient")
    humidity: float = Field(..., description="Relative humidity %")
    soil_moisture: float = Field(..., description="Soil moisture %")
    rainfall: Optional[float] = Field(
        None,
        description=(
            "Rainfall (mm) for the crop model. If omitted, today's Open-Meteo "
            "forecast total is used. Never synthesised."
        ),
    )
    latitude: float = Field(DEFAULT_LAT)
    longitude: float = Field(DEFAULT_LON)
    state: Optional[str] = Field(None, description="Enables IMD historical baseline")
    top_k: int = Field(3, ge=1, le=10)
    device_id: Optional[str] = Field(None, description="e.g. BG-NODE-001")

    @field_validator("latitude")
    @classmethod
    def _lat(cls, v):
        if not (-90 <= v <= 90):
            raise ValueError("latitude must be between -90 and 90")
        return v

    @field_validator("longitude")
    @classmethod
    def _lon(cls, v):
        if not (-180 <= v <= 180):
            raise ValueError("longitude must be between -180 and 180")
        return v


def _run_farm_analysis(request: FarmAnalysisRequest) -> Dict[str, Any]:
    """
    Crop model + rainfall intelligence over one field observation.

    Rainfall for the crop model comes from, in order: the caller's own value,
    else today's Open-Meteo forecast total. If neither exists the request fails
    — the missing feature is never filled with a placeholder.
    """
    require_crop_model()

    rainfall_block: Optional[Dict[str, Any]] = None
    weather_error: Optional[str] = None
    try:
        rainfall_block = _build_rainfall_intelligence(
            request.latitude, request.longitude, request.state, request.soil_moisture
        )
    except WeatherServiceError as e:
        weather_error = str(e)

    if request.rainfall is not None:
        rainfall_mm = float(request.rainfall)
        rainfall_source = "caller-supplied value"
    elif rainfall_block is not None:
        rainfall_mm = rainfall_block["rainfall_today_mm"]
        rainfall_source = "Open-Meteo forecast total for today (CC-BY-4.0)"
    else:
        raise HTTPException(
            503,
            "Cannot run the crop model: 'rainfall' was not supplied and live "
            f"weather is unavailable ({weather_error}). Supply 'rainfall' "
            "explicitly or retry when the weather service is reachable.",
        )

    # Temperature and humidity for the crop model come from the caller
    # (selected node snapshot or farmer-entered values). Open-Meteo is not
    # allowed to overwrite them — that would make every node share one ambient
    # reading and would ignore the farm's persisted sensors.
    sensor_temp = request.temperature
    sensor_humidity = request.humidity

    features = {
        "N": request.N, "P": request.P, "K": request.K,
        "temperature": sensor_temp, "humidity": sensor_humidity,
        "ph": request.ph, "rainfall": rainfall_mm,
    }

    try:
        prediction = crop_model.predict(features, top_k=request.top_k)
    except CropModelUnavailable as e:
        raise HTTPException(503, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))

    explanation = generate_crop_explanation(
        recommended_crop=prediction["recommended_crop"],
        score=prediction["model_probability"],
        inputs=features,
    )

    irrigation = None
    if rainfall_block:
        irrigation = decide_irrigation(
            soil_moisture=request.soil_moisture,
            temperature=sensor_temp,
            humidity=sensor_humidity,
            rainfall_next_24h_mm=rainfall_block["rainfall_next_24h_mm"],
            rainfall_next_3_days_mm=rainfall_block["rainfall_next_3_days_mm"],
            waterlogging_risk=rainfall_block["waterlogging_risk"],
        )

    # Same rule-based soil grading the legacy /api/predict contract returns, so
    # callers of /analyze/farm and /decide/crop get it without a second request.
    soil_quality, improvement_tips = check_soil_health(SoilInput(
        n=request.N, p=request.P, k=request.K,
        temperature=sensor_temp, humidity=sensor_humidity,
        ph=request.ph, rainfall=rainfall_mm, moisture=request.soil_moisture,
    ))

    return {
        "soil_quality": soil_quality,
        "improvement_tips": improvement_tips,
        "model_accuracy": crop_model.test_accuracy,
        "crop_prediction": prediction,
        "crop_explanation": explanation,
        "rainfall_intelligence": rainfall_block,
        "rainfall_unavailable_reason": weather_error if rainfall_block is None else None,
        "irrigation": irrigation,
        "rainfall_feature": {
            "value_mm": rainfall_mm,
            "source": rainfall_source,
        },
        "device_id": request.device_id,
        "data_sources": {
            "crop_model": (
                "VotingClassifier(soft) XGBoost + RandomForest, crop_xgb_model.pkl, "
                "trained on Crop_recommendation_enhanced.csv"
            ),
            "weather": "Open-Meteo (CC-BY-4.0) — https://open-meteo.com",
            "historical_rainfall": "IMD subdivision-level rainfall 1901-2015",
            "soil_inputs": "Farmer-entered values today; ESP32 telemetry once paired",
        },
        "disclaimer": (
            "Crop suitability comes from a model whose 96.04% figure is held-out "
            "test accuracy on its training dataset, not a real-world field "
            "guarantee. Rainfall intelligence is rule-based analysis of Open-Meteo "
            "forecasts and IMD subdivision-level history, not a trained rainfall "
            "model, and subdivision data is regional rather than farm-level. "
            "Irrigation guidance is advisory."
        ),
    }


@app.post("/analyze/farm")
def analyze_farm(request: FarmAnalysisRequest):
    return _run_farm_analysis(request)


class CropDecisionRequest(FarmAnalysisRequest):
    market_prices: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Real Government OGD / AGMARKNET prices keyed by crop name, e.g. "
            '{"wheat": {"modal_price": 2450}}. Supplied by the Express backend. '
            "Omit it and the market component is reported as unavailable."
        ),
    )


@app.post("/decide/crop")
def decide_crop(request: CropDecisionRequest):
    """Ranked, explainable crop decision. Deterministic project scoring logic."""
    analysis = _run_farm_analysis(
        FarmAnalysisRequest(**request.model_dump(exclude={"market_prices"}))
    )

    rainfall_block = analysis["rainfall_intelligence"] or {}
    try:
        decision = rank_crops(
            crop_prediction=analysis["crop_prediction"],
            rainfall_intelligence=rainfall_block,
            market_prices=request.market_prices,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    analysis["decision"] = decision
    return analysis
