"""
Bharat Grows — Full Test Suite (23 tests)
==========================================

Tests:
  1.  Existing crop prediction (basic)
  2.  Crop top-3 output + feature order
  3.  Open-Meteo current weather
  4.  Open-Meteo forecast
  5.  Open-Meteo historical API
  6.  Historical rainfall CSV loading
  7.  Historical rainfall baseline calculation (West MP / September)
  8.  Geographic mapping — valid state
  9.  Graceful behavior — unmapped location
  10. Rainfall trend logic (INCREASING)
  11. Dry-spell risk HIGH
  12. Heavy-rain risk HIGH
  13. Waterlogging risk HIGH
  14. Low moisture + low rainfall → IRRIGATE
  15. Low moisture + high rainfall → WAIT
  16. High moisture + heavy rainfall → AVOID_IRRIGATION
  17. Invalid latitude
  18. Open-Meteo timeout/failure
  19. Malformed API response
  20. Unified /analyze/farm (with state → historical baseline)
  21. Existing /analyze/soil
  22. Existing /predict/irrigation
  23. Existing /predict/risk
"""

import sys
import os
import json
import time
import subprocess
import urllib.request
import urllib.error
from typing import Optional

# Project root on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

BASE = "http://127.0.0.1:8000"
PASS_COUNT = 0
FAIL_COUNT = 0


def _post(endpoint, data):
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        BASE + endpoint, data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _get(endpoint):
    req = urllib.request.Request(BASE + endpoint)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_test(name, fn):
    global PASS_COUNT, FAIL_COUNT
    try:
        fn()
        print(f"  ✅ {name}")
        PASS_COUNT += 1
    except Exception as e:
        print(f"  ❌ {name}: {e}")
        FAIL_COUNT += 1


# ============================================================
# 1. Crop prediction basic
# ============================================================
def test_crop_basic():
    r = _post("/predict/crop", {
        "N": 90, "P": 42, "K": 43,
        "temperature": 20.8, "humidity": 82.0, "ph": 6.5, "rainfall": 202.9,
    })
    assert "recommended_crop" in r
    assert isinstance(r["model_score"], float)


# ============================================================
# 2. Crop top-3 + feature order
# ============================================================
def test_crop_top3():
    r = _post("/predict/crop", {
        "N": 90, "P": 42, "K": 43,
        "temperature": 20.8, "humidity": 82.0, "ph": 6.5, "rainfall": 202.9,
    })
    assert len(r["top_3_crops"]) == 3
    assert r["feature_order_used"] == ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]


# ============================================================
# 3. Open-Meteo current weather
# ============================================================
def test_weather_current():
    r = _get("/weather/current?latitude=22.7196&longitude=75.8577")
    assert "temperature_c" in r
    assert "precipitation_mm" in r
    assert r["source"] == "Open-Meteo (CC-BY-4.0)"


# ============================================================
# 4. Open-Meteo forecast
# ============================================================
def test_weather_forecast():
    r = _get("/weather/forecast?latitude=22.7196&longitude=75.8577&forecast_days=3")
    assert "daily" in r and len(r["daily"]) == 3
    assert "hourly" in r
    assert r["source"] == "Open-Meteo (CC-BY-4.0)"


# ============================================================
# 5. Open-Meteo historical API
# ============================================================
def test_weather_historical():
    r = _get(
        "/weather/historical?latitude=22.7196&longitude=75.8577"
        "&start_date=2024-06-01&end_date=2024-06-05"
    )
    assert "daily" in r and len(r["daily"]) == 5
    assert "precipitation_sum_mm" in r["daily"][0]


# ============================================================
# 6. Historical rainfall CSV loading
# ============================================================
def test_historical_csv_loads():
    from api.services.historical_rainfall_service import list_available_subdivisions
    subdivisions = list_available_subdivisions()
    assert len(subdivisions) == 36
    assert "WEST MADHYA PRADESH" in subdivisions


# ============================================================
# 7. Historical baseline — West MP, September (heavy monsoon)
# ============================================================
def test_historical_baseline_calc():
    from api.services.historical_rainfall_service import get_historical_monthly_baseline
    # September is month 9; WEST MP SEP avg ≈ 161mm
    baseline = get_historical_monthly_baseline("WEST MADHYA PRADESH", 9)
    assert baseline is not None
    assert 100 < baseline < 250, f"Unexpected Sep baseline: {baseline}"


# ============================================================
# 8. Geographic mapping — valid state
# ============================================================
def test_geo_mapping_valid():
    from api.services.historical_rainfall_service import get_subdivision_for_state
    sub = get_subdivision_for_state("Madhya Pradesh")
    assert sub == "WEST MADHYA PRADESH"


# ============================================================
# 9. Graceful behavior — unmapped location
# ============================================================
def test_geo_mapping_unavailable():
    from api.services.historical_rainfall_service import get_subdivision_for_state
    sub = get_subdivision_for_state("Unknownland")
    assert sub is None


# ============================================================
# 10. Rainfall trend — INCREASING
# ============================================================
def test_rainfall_trend_increasing():
    from api.services.rainfall_intelligence import _compute_trend
    daily = [
        {"precipitation_sum_mm": 2.0},
        {"precipitation_sum_mm": 20.0},
        {"precipitation_sum_mm": 25.0},
    ]
    assert _compute_trend(daily) == "INCREASING"


# ============================================================
# 11. Dry-spell risk HIGH
# ============================================================
def test_dry_spell_high():
    from api.services.rainfall_intelligence import _dry_spell_risk
    assert _dry_spell_risk(0.5) == "HIGH"
    assert _dry_spell_risk(5.0) == "MODERATE"
    assert _dry_spell_risk(15.0) == "LOW"


# ============================================================
# 12. Heavy-rain risk HIGH
# ============================================================
def test_heavy_rain_high():
    from api.services.rainfall_intelligence import _heavy_rain_risk
    assert _heavy_rain_risk(60.0) == "HIGH"
    assert _heavy_rain_risk(20.0) == "MODERATE"
    assert _heavy_rain_risk(5.0) == "LOW"


# ============================================================
# 13. Waterlogging risk HIGH
# ============================================================
def test_waterlogging_high():
    from api.services.rainfall_intelligence import compute_waterlogging_risk
    risk = compute_waterlogging_risk(90.0, 150.0, 60.0)
    assert risk == "HIGH"


# ============================================================
# 14. Low moisture + low rain → IRRIGATE
# ============================================================
def test_irrigate_low_moisture_low_rain():
    from api.services.rainfall_intelligence import decide_irrigation
    r = decide_irrigation(18.0, 30.0, 50.0, 0.5, 1.0, waterlogging_risk="LOW")
    assert r["decision"] == "IRRIGATE"


# ============================================================
# 15. Low moisture + high rain → WAIT
# ============================================================
def test_wait_low_moisture_high_rain():
    from api.services.rainfall_intelligence import decide_irrigation
    r = decide_irrigation(25.0, 30.0, 60.0, 30.0, 60.0, waterlogging_risk="LOW")
    assert r["decision"] == "WAIT"


# ============================================================
# 16. High moisture + heavy rain → AVOID_IRRIGATION
# ============================================================
def test_avoid_waterlogging():
    from api.services.rainfall_intelligence import decide_irrigation
    r = decide_irrigation(90.0, 28.0, 85.0, 60.0, 150.0, waterlogging_risk="HIGH")
    assert r["decision"] == "AVOID_IRRIGATION"
    assert "waterlogging" in r["reason"].lower()


# ============================================================
# 17. Invalid latitude
# ============================================================
def test_invalid_latitude():
    try:
        _get("/weather/current?latitude=999&longitude=75.8577")
        assert False, "Should have raised an error"
    except urllib.error.HTTPError as e:
        assert e.code in (422, 503), f"Unexpected: {e.code}"


# ============================================================
# 18. Open-Meteo timeout/failure
# ============================================================
def test_api_failure():
    from api.services.weather_service import WeatherServiceError, _fetch_json
    try:
        _fetch_json("http://127.0.0.1:1/bad-url")
        assert False, "Should raise WeatherServiceError"
    except WeatherServiceError:
        pass


# ============================================================
# 19. Malformed API response
# ============================================================
def test_malformed_response():
    from api.services.weather_service import WeatherServiceError
    import unittest.mock as mock
    import urllib.request
    with mock.patch("urllib.request.urlopen") as mock_open:
        mock_resp = mock.MagicMock()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = mock.MagicMock(return_value=False)
        mock_resp.read.return_value = b"NOT_JSON{{{"
        mock_open.return_value = mock_resp
        from api.services.weather_service import _fetch_json
        try:
            _fetch_json("http://fake.url")
            assert False, "Should raise WeatherServiceError"
        except WeatherServiceError:
            pass


# ============================================================
# 20. Unified /analyze/farm (with state for historical baseline)
# ============================================================
def test_analyze_farm():
    r = _post("/analyze/farm", {
        "N": 52, "P": 31, "K": 46,
        "temperature": 30.5, "humidity": 68,
        "ph": 6.7, "soil_moisture": 28,
        "latitude": 22.7196, "longitude": 75.8577,
        "state": "Madhya Pradesh",
    })
    assert "recommended_crops" in r and len(r["recommended_crops"]) == 3
    assert "crop_explanation" in r
    assert "weather" in r
    assert "historical_rainfall" in r
    assert "rainfall_intelligence" in r
    assert "irrigation" in r
    assert r["data_sources"]["crop_ai"].startswith("Random Forest")
    assert "disclaimer" in r


# ============================================================
# 21. Existing /analyze/soil
# ============================================================
def test_existing_soil():
    r = _post("/analyze/soil", {"N": 35, "P": 45, "K": 20, "ph": 5.0})
    assert r["nitrogen_status"] == "LOW"
    assert r["ph_status"] == "ACIDIC"


# ============================================================
# 22. Existing /predict/irrigation
# ============================================================
def test_existing_irrigation():
    r = _post("/predict/irrigation", {
        "soil_moisture": 25.0, "temperature": 32.5,
        "humidity": 45.0, "rainfall": 0.0,
        "expected_rainfall": 2.0, "crop": "rice",
    })
    assert r["irrigation_decision"] == "IRRIGATE"


# ============================================================
# 23. Existing /predict/risk
# ============================================================
def test_existing_risk():
    r = _post("/predict/risk", {
        "soil_moisture": 15.0, "N": 20.0,
        "temperature": 42.0, "expected_rainfall": 150.0,
    })
    assert r["risk_level"] == "HIGH"


# ============================================================
# 24. Period-aware anomaly (Daily vs Monthly -> UNAVAILABLE)
# ============================================================
def test_anomaly_period_mismatch():
    from api.services.historical_rainfall_service import compute_rainfall_anomaly
    res = compute_rainfall_anomaly(160.0, 5.0, "monthly", "daily")
    assert res["available"] is False
    assert "Cannot compare" in res["reason"]


# ============================================================
# 25. Period-aware anomaly (Monthly vs Monthly -> VALID)
# ============================================================
def test_anomaly_period_match():
    from api.services.historical_rainfall_service import compute_rainfall_anomaly
    res = compute_rainfall_anomaly(160.0, 150.0, "monthly", "monthly")
    assert res["available"] is True
    assert res["deviation_mm"] == -10.0


# ============================================================
# Runner
# ============================================================
if __name__ == "__main__":
    print("\n🧪 Bharat Grows — Full Test Suite (25 tests)\n")

    tests = [
        ("1.  Crop prediction (basic)", test_crop_basic),
        ("2.  Crop top-3 + feature order", test_crop_top3),
        ("3.  Open-Meteo current weather", test_weather_current),
        ("4.  Open-Meteo forecast", test_weather_forecast),
        ("5.  Open-Meteo historical API", test_weather_historical),
        ("6.  Historical CSV loading", test_historical_csv_loads),
        ("7.  Historical baseline — West MP Sep", test_historical_baseline_calc),
        ("8.  Geographic mapping — valid state", test_geo_mapping_valid),
        ("9.  Geographic mapping — unavailable", test_geo_mapping_unavailable),
        ("10. Rainfall trend — INCREASING", test_rainfall_trend_increasing),
        ("11. Dry-spell risk levels", test_dry_spell_high),
        ("12. Heavy-rain risk levels", test_heavy_rain_high),
        ("13. Waterlogging risk HIGH", test_waterlogging_high),
        ("14. Low moisture + low rain → IRRIGATE", test_irrigate_low_moisture_low_rain),
        ("15. Low moisture + high rain → WAIT", test_wait_low_moisture_high_rain),
        ("16. High moisture + heavy rain → AVOID_IRRIGATION", test_avoid_waterlogging),
        ("17. Invalid latitude → error", test_invalid_latitude),
        ("18. API failure → WeatherServiceError", test_api_failure),
        ("19. Malformed response → WeatherServiceError", test_malformed_response),
        ("20. Unified /analyze/farm", test_analyze_farm),
        ("21. Existing /analyze/soil", test_existing_soil),
        ("22. Existing /predict/irrigation", test_existing_irrigation),
        ("23. Existing /predict/risk", test_existing_risk),
        ("24. Period-aware anomaly mismatch", test_anomaly_period_mismatch),
        ("25. Period-aware anomaly match", test_anomaly_period_match)
    ]

    for name, fn in tests:
        run_test(name, fn)

    print(f"\n📊 Results: {PASS_COUNT} passed, {FAIL_COUNT} failed out of {PASS_COUNT + FAIL_COUNT} tests\n")
    sys.exit(0 if FAIL_COUNT == 0 else 1)
