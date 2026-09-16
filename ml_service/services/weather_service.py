"""
Open-Meteo Weather Service for Bharat Grows.

Data source: Open-Meteo (https://open-meteo.com)
License: CC-BY-4.0 — Attribution required.
Attribution: "Weather data provided by Open-Meteo (CC-BY-4.0)"

This module fetches current weather, forecast, and historical data.
Open-Meteo is the DATA SOURCE, NOT our AI model.
"""

import urllib.request
import urllib.error
import json
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta


# --- API Configuration ---
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DEFAULT_TIMEZONE = "Asia/Kolkata"
REQUEST_TIMEOUT_SECONDS = 10


class WeatherServiceError(Exception):
    """Raised when Open-Meteo API call fails."""
    pass


def _fetch_json(url: str) -> dict:
    """Fetch JSON from a URL with timeout and error handling."""
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise WeatherServiceError(f"Open-Meteo API unreachable: {e}")
    except json.JSONDecodeError:
        raise WeatherServiceError("Open-Meteo returned invalid JSON")
    except Exception as e:
        raise WeatherServiceError(f"Weather fetch failed: {e}")


def get_current_weather(latitude: float, longitude: float) -> dict:
    """
    Fetch current weather conditions from Open-Meteo.

    Returns dict with keys:
        temperature_c, humidity_pct, precipitation_mm, rain_mm,
        wind_speed_kmh, weather_code, time
    """
    params = (
        f"?latitude={latitude}&longitude={longitude}"
        f"&current=temperature_2m,relative_humidity_2m,precipitation,rain,"
        f"weather_code,wind_speed_10m"
        f"&timezone={DEFAULT_TIMEZONE}"
    )
    data = _fetch_json(FORECAST_URL + params)

    current = data.get("current", {})
    return {
        "temperature_c": current.get("temperature_2m"),
        "humidity_pct": current.get("relative_humidity_2m"),
        "precipitation_mm": current.get("precipitation", 0.0),
        "rain_mm": current.get("rain", 0.0),
        "wind_speed_kmh": current.get("wind_speed_10m"),
        "weather_code": current.get("weather_code"),
        "time": current.get("time"),
        "source": "Open-Meteo (CC-BY-4.0)",
    }


def get_forecast_weather(
    latitude: float, longitude: float, forecast_days: int = 3
) -> dict:
    """
    Fetch hourly + daily forecast from Open-Meteo.

    Returns dict with:
        hourly: list of {time, temp, humidity, precip_prob, precip_mm, rain_mm}
        daily: list of {date, precip_sum_mm, rain_sum_mm, precip_prob_max}
    """
    params = (
        f"?latitude={latitude}&longitude={longitude}"
        f"&hourly=temperature_2m,relative_humidity_2m,"
        f"precipitation_probability,precipitation,rain"
        f"&daily=precipitation_sum,rain_sum,precipitation_probability_max"
        f"&timezone={DEFAULT_TIMEZONE}"
        f"&forecast_days={forecast_days}"
    )
    data = _fetch_json(FORECAST_URL + params)

    hourly_raw = data.get("hourly", {})
    daily_raw = data.get("daily", {})

    hourly = []
    times = hourly_raw.get("time", [])
    for i, t in enumerate(times):
        hourly.append({
            "time": t,
            "temperature_c": _safe_idx(hourly_raw.get("temperature_2m"), i),
            "humidity_pct": _safe_idx(hourly_raw.get("relative_humidity_2m"), i),
            "precipitation_probability_pct": _safe_idx(
                hourly_raw.get("precipitation_probability"), i
            ),
            "precipitation_mm": _safe_idx(hourly_raw.get("precipitation"), i),
            "rain_mm": _safe_idx(hourly_raw.get("rain"), i),
        })

    daily = []
    dates = daily_raw.get("time", [])
    for i, d in enumerate(dates):
        daily.append({
            "date": d,
            "precipitation_sum_mm": _safe_idx(
                daily_raw.get("precipitation_sum"), i
            ),
            "rain_sum_mm": _safe_idx(daily_raw.get("rain_sum"), i),
            "precipitation_probability_max_pct": _safe_idx(
                daily_raw.get("precipitation_probability_max"), i
            ),
        })

    return {
        "hourly": hourly,
        "daily": daily,
        "source": "Open-Meteo (CC-BY-4.0)",
    }


def get_historical_weather(
    latitude: float,
    longitude: float,
    start_date: str,
    end_date: str,
) -> dict:
    """
    Fetch historical daily weather from Open-Meteo Archive API.

    Parameters:
        start_date, end_date: YYYY-MM-DD strings.

    Returns dict with:
        daily: list of {date, precipitation_sum_mm, rain_sum_mm,
                        temperature_mean_c, temperature_max_c, temperature_min_c}
    """
    params = (
        f"?latitude={latitude}&longitude={longitude}"
        f"&start_date={start_date}&end_date={end_date}"
        f"&daily=precipitation_sum,rain_sum,"
        f"temperature_2m_mean,temperature_2m_max,temperature_2m_min"
        f"&timezone={DEFAULT_TIMEZONE}"
    )
    data = _fetch_json(ARCHIVE_URL + params)

    daily_raw = data.get("daily", {})
    dates = daily_raw.get("time", [])
    daily = []
    for i, d in enumerate(dates):
        daily.append({
            "date": d,
            "precipitation_sum_mm": _safe_idx(
                daily_raw.get("precipitation_sum"), i
            ),
            "rain_sum_mm": _safe_idx(daily_raw.get("rain_sum"), i),
            "temperature_mean_c": _safe_idx(
                daily_raw.get("temperature_2m_mean"), i
            ),
            "temperature_max_c": _safe_idx(
                daily_raw.get("temperature_2m_max"), i
            ),
            "temperature_min_c": _safe_idx(
                daily_raw.get("temperature_2m_min"), i
            ),
        })

    return {
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "elevation_m": data.get("elevation"),
        "daily": daily,
        "source": "Open-Meteo Archive (CC-BY-4.0)",
    }


def _safe_idx(lst: Optional[list], idx: int, default=None):
    """Safely index a list that may be None or too short."""
    if lst is None:
        return default
    if idx < len(lst):
        return lst[idx]
    return default
