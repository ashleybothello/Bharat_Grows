"""
Rainfall Intelligence Engine — Bharat Grows
============================================

This module is RULE-BASED and DATA-DRIVEN.
It is NOT an ML model.

It combines:
  A. Historical monthly/seasonal rainfall baselines (IMD 1901-2015 CSV)
  B. Current weather from Open-Meteo
  C. Forecast rainfall from Open-Meteo
  D. Soil moisture from ESP32 sensor
  E. Temperature / humidity

Outputs:
  - rainfall summary (today, 24h, 3-day)
  - historical baseline for the current month
  - rainfall anomaly (if baseline available and comparison is valid)
  - trend (INCREASING / DECREASING / STABLE / UNKNOWN)
  - dry_spell_risk
  - heavy_rain_risk
  - waterlogging_risk
  - irrigation decision + reason

Thresholds are documented below and are based on general agronomic guidelines.
They are NOT presented as universal scientific standards.

IRRIGATION DECISIONS:
  AVOID_IRRIGATION — waterlogging risk or saturated soil
  WAIT             — significant rain expected or soil adequate
  MONITOR          — borderline; check again soon
  IRRIGATE         — soil critically low and no rain expected

---
RAINFALL ANOMALY:
  Comparison is only made between monthly observed/forecast rainfall and
  the IMD subdivision monthly historical average for the same calendar month.
  If the comparison is geographically invalid, returns UNAVAILABLE.
---

OPEN-METEO ATTRIBUTION:
  "Weather data provided by Open-Meteo (CC-BY-4.0)"
  https://open-meteo.com

HISTORICAL DATA ATTRIBUTION:
  "Historical rainfall baseline from IMD Subdivision-level dataset 1901-2015
  (sourced from Kaggle). Geographic resolution: subdivision level only."
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from services.historical_rainfall_service import (
    get_historical_monthly_baseline,
    compute_rainfall_anomaly,
)


# ============================================================
# Documented Thresholds
# ============================================================

THRESHOLDS = {
    # --- Rainfall amounts (mm) ---
    # Heavy rain: IMD defines >64.5mm/day as "very heavy"; >50mm/24h used here
    # as a practical crop-risk threshold.
    "heavy_rain_24h_high": 50.0,
    "heavy_rain_24h_moderate": 15.0,

    # Dry spell: < 2mm/3 days = high risk of crop stress in most Indian crops.
    # This is a simplified agronomic proxy, not a formal meteorological dry-spell definition.
    "dry_spell_3day_high": 2.0,
    "dry_spell_3day_moderate": 10.0,

    # Waterlogging: >100mm in 3 days on already moist soil poses flood risk
    "waterlogging_rain_3day_high": 100.0,
    "waterlogging_rain_3day_moderate": 60.0,

    # --- Soil moisture (%) ---
    "soil_critical_low": 20.0,   # Severe stress; irrigate urgently
    "soil_low": 30.0,            # Low; irrigate unless rain expected
    "soil_high": 70.0,           # Adequate; no irrigation needed
    "soil_saturated": 85.0,      # Saturation level; waterlogging risk

    # --- Temperature ---
    "heat_stress_c": 38.0,       # Heat stress threshold

    # --- Irrigation wait ---
    # If more than this much rain is expected in 24h, delay irrigation
    "wait_rain_threshold_mm": 5.0,

    # --- Rainfall anomaly bands ---
    # Within ±10% of historical baseline = near normal
    "anomaly_tolerance_pct": 10.0,
}


# ============================================================
# Public API
# ============================================================

def analyze_rainfall(
    forecast_daily: List[dict],
    forecast_hourly: List[dict],
    current_precipitation_mm: float = 0.0,
    subdivision: Optional[str] = None,
    month_number: Optional[int] = None,
) -> dict:
    """
    Analyze rainfall from Open-Meteo forecast + historical context.

    Parameters:
        forecast_daily: from Open-Meteo forecast (daily items)
        forecast_hourly: from Open-Meteo forecast (hourly items)
        current_precipitation_mm: current reading from Open-Meteo
        subdivision: IMD subdivision name (for historical baseline lookup)
        month_number: current calendar month (1-12) for baseline comparison

    Returns comprehensive rainfall intelligence dict.
    """
    # --- Today's total from first daily forecast entry ---
    rainfall_today = 0.0
    if forecast_daily:
        rainfall_today = forecast_daily[0].get("precipitation_sum_mm") or 0.0

    # --- Next 24h from hourly data ---
    now = datetime.now()
    next_24h_cutoff = now + timedelta(hours=24)
    rainfall_next_24h = 0.0
    for entry in forecast_hourly:
        try:
            t = datetime.fromisoformat(entry["time"])
            if now <= t <= next_24h_cutoff:
                rainfall_next_24h += entry.get("precipitation_mm") or 0.0
        except (ValueError, KeyError):
            continue

    # --- Next 3 days from daily sums ---
    rainfall_next_3_days = sum(
        (d.get("precipitation_sum_mm") or 0.0) for d in forecast_daily[:3]
    )

    # --- Trend: compare day-1 vs days-2+3 average ---
    trend = _compute_trend(forecast_daily)

    # --- Risk assessments ---
    dry_spell_risk = _dry_spell_risk(rainfall_next_3_days)
    heavy_rain_risk = _heavy_rain_risk(rainfall_next_24h)
    waterlogging_risk = _waterlogging_risk_from_rain(rainfall_next_3_days)

    # --- Historical baseline ---
    historical = _get_historical_context(subdivision, month_number, rainfall_today)

    return {
        "rainfall_today_mm": round(rainfall_today, 1),
        "rainfall_next_24h_mm": round(rainfall_next_24h, 1),
        "rainfall_next_3_days_mm": round(rainfall_next_3_days, 1),
        "rainfall_trend": trend,
        "dry_spell_risk": dry_spell_risk,
        "heavy_rain_risk": heavy_rain_risk,
        "waterlogging_risk": waterlogging_risk,
        "historical_context": historical,
    }


def decide_irrigation(
    soil_moisture: float,
    temperature: float,
    humidity: float,
    rainfall_next_24h_mm: float,
    rainfall_next_3_days_mm: float,
    crop: str = "",
    waterlogging_risk: str = "LOW",
) -> dict:
    """
    Rule-based irrigation decision engine.

    Priority order:
      1. AVOID_IRRIGATION — waterlogging / saturated soil + heavy rain
      2. WAIT             — adequate rain expected in 24h
      3. WAIT             — soil moisture already high
      4. IRRIGATE         — critically low soil moisture
      5. IRRIGATE         — low soil moisture + no rain expected
      6. MONITOR          — low soil moisture + some rain expected
      7. MONITOR          — all else stable

    Every decision includes an explicit reason.
    """
    reasons = []
    decision = "MONITOR"

    # Priority 1: Waterlogging
    if waterlogging_risk == "HIGH" or (
        soil_moisture > THRESHOLDS["soil_saturated"] and rainfall_next_24h_mm > 20
    ):
        decision = "AVOID_IRRIGATION"
        reasons.append(
            f"Waterlogging risk is {waterlogging_risk}. "
            f"Soil moisture is at {soil_moisture:.0f}% and "
            f"{rainfall_next_24h_mm:.1f}mm of rain is expected in 24 hours. "
            f"Adding irrigation now could damage roots and flood the field."
        )

    # Priority 2: Significant rain expected
    elif rainfall_next_24h_mm > THRESHOLDS["wait_rain_threshold_mm"]:
        decision = "WAIT"
        reasons.append(
            f"{rainfall_next_24h_mm:.1f}mm of rainfall is expected in the next 24 hours. "
            f"Delaying irrigation to avoid water waste and over-saturation."
        )

    # Priority 3: Soil already moist
    elif soil_moisture > THRESHOLDS["soil_high"]:
        decision = "WAIT"
        reasons.append(
            f"Soil moisture is adequate at {soil_moisture:.0f}%. "
            f"No irrigation needed at this time."
        )

    # Priority 4: Critically low moisture
    elif soil_moisture < THRESHOLDS["soil_critical_low"]:
        decision = "IRRIGATE"
        if temperature > THRESHOLDS["heat_stress_c"]:
            reasons.append(
                f"URGENT: Soil moisture is critically low ({soil_moisture:.0f}%) "
                f"with heat stress conditions ({temperature:.1f}°C). "
                f"Immediate irrigation is required to prevent crop loss."
            )
        else:
            reasons.append(
                f"Soil moisture is critically low at {soil_moisture:.0f}%. "
                f"Immediate irrigation is recommended."
            )

    # Priority 5: Low moisture, no rain coming
    elif soil_moisture < THRESHOLDS["soil_low"]:
        if rainfall_next_24h_mm < 2.0:
            decision = "IRRIGATE"
            reasons.append(
                f"Soil moisture is low ({soil_moisture:.0f}%) and "
                f"minimal rainfall ({rainfall_next_24h_mm:.1f}mm) is expected. "
                f"Irrigation is recommended."
            )
        else:
            # Priority 6: Low moisture but some rain expected
            decision = "MONITOR"
            reasons.append(
                f"Soil moisture is low ({soil_moisture:.0f}%) but "
                f"some rainfall ({rainfall_next_24h_mm:.1f}mm) is expected in 24 hours. "
                f"Monitor conditions before irrigating."
            )

    # Priority 7: Stable
    else:
        decision = "MONITOR"
        reasons.append(
            f"Soil moisture ({soil_moisture:.0f}%) is in an acceptable range. "
            f"Weather conditions are stable. No immediate action required."
        )

    return {
        "decision": decision,
        "reason": " ".join(reasons),
        "factors_used": {
            "soil_moisture_pct": soil_moisture,
            "temperature_c": temperature,
            "humidity_pct": humidity,
            "rainfall_next_24h_mm": round(rainfall_next_24h_mm, 1),
            "rainfall_next_3_days_mm": round(rainfall_next_3_days_mm, 1),
            "waterlogging_risk": waterlogging_risk,
            "crop": crop or "unspecified",
        },
    }


def compute_waterlogging_risk(
    soil_moisture: float,
    rainfall_next_3_days_mm: float,
    rainfall_next_24h_mm: float,
) -> str:
    """
    Waterlogging risk that incorporates soil moisture + rainfall.
    Used for the unified farm analysis response.
    """
    if (
        rainfall_next_3_days_mm > THRESHOLDS["waterlogging_rain_3day_high"]
        or (soil_moisture > THRESHOLDS["soil_saturated"] and rainfall_next_24h_mm > 20)
    ):
        return "HIGH"
    elif (
        rainfall_next_3_days_mm > THRESHOLDS["waterlogging_rain_3day_moderate"]
        and soil_moisture > THRESHOLDS["soil_high"]
    ):
        return "MODERATE"
    return "LOW"


# ============================================================
# Internal helpers
# ============================================================

def _compute_trend(forecast_daily: List[dict]) -> str:
    """
    Rainfall trend based on forecast:
      Compare day-1 vs average of days 2 and 3.
      A >5mm difference is considered meaningful.
    """
    if len(forecast_daily) < 3:
        return "UNKNOWN"
    day1 = forecast_daily[0].get("precipitation_sum_mm") or 0.0
    day23_avg = (
        (forecast_daily[1].get("precipitation_sum_mm") or 0.0) +
        (forecast_daily[2].get("precipitation_sum_mm") or 0.0)
    ) / 2.0

    if day23_avg > day1 + 5:
        return "INCREASING"
    elif day23_avg < day1 - 5:
        return "DECREASING"
    return "STABLE"


def _dry_spell_risk(rainfall_next_3_days: float) -> str:
    if rainfall_next_3_days < THRESHOLDS["dry_spell_3day_high"]:
        return "HIGH"
    elif rainfall_next_3_days < THRESHOLDS["dry_spell_3day_moderate"]:
        return "MODERATE"
    return "LOW"


def _heavy_rain_risk(rainfall_next_24h: float) -> str:
    if rainfall_next_24h > THRESHOLDS["heavy_rain_24h_high"]:
        return "HIGH"
    elif rainfall_next_24h > THRESHOLDS["heavy_rain_24h_moderate"]:
        return "MODERATE"
    return "LOW"


def _waterlogging_risk_from_rain(rainfall_next_3_days: float) -> str:
    """Rain-only waterlogging risk (without soil moisture — used in analyze_rainfall)."""
    if rainfall_next_3_days > THRESHOLDS["waterlogging_rain_3day_high"]:
        return "HIGH"
    elif rainfall_next_3_days > THRESHOLDS["waterlogging_rain_3day_moderate"]:
        return "MODERATE"
    return "LOW"


def _get_historical_context(
    subdivision: Optional[str],
    month_number: Optional[int],
    rainfall_today_mm: float,
) -> dict:
    """
    Build historical rainfall context block.
    Returns a block with baseline, anomaly (if valid), and source labeling.
    """
    if not subdivision or not month_number:
        return {
            "available": False,
            "reason": "No IMD subdivision provided. Provide 'state' in request for historical context.",
            "period": "1901-2015",
            "source": "IMD Subdivision-level historical rainfall dataset",
        }

    baseline_mm = get_historical_monthly_baseline(subdivision, month_number)

    if baseline_mm is None:
        return {
            "available": False,
            "subdivision": subdivision,
            "reason": f"Subdivision '{subdivision}' not found in historical dataset.",
            "period": "1901-2015",
            "source": "IMD Subdivision-level historical rainfall dataset",
        }

    # Pass explicit periods; this will cause compute_rainfall_anomaly to return available=False
    # because 'monthly' != 'daily', avoiding the invalid anomaly comparison.
    anomaly = compute_rainfall_anomaly(
        baseline_mm=baseline_mm,
        observed_mm=rainfall_today_mm,
        baseline_period="monthly",
        observed_period="daily",
        tolerance_pct=THRESHOLDS["anomaly_tolerance_pct"],
    )

    return {
        "available": True,
        "subdivision": subdivision,
        "month": month_number,
        "monthly_baseline_mm": baseline_mm,
        "anomaly": anomaly,
        "period": "1901-2015",
        "source": "IMD Subdivision-level historical rainfall dataset (via Kaggle)",
        "geographic_note": (
            "This baseline is at IMD subdivision level, not farm level. "
            "It provides regional seasonal context only."
        ),
    }
