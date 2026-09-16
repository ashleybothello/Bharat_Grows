"""
Historical Rainfall Service — Bharat Grows
==========================================

Data source: "Rainfall in India 1901-2015"
  File: ml_service/data/rainfall in india 1901-2015.csv

Dataset provenance:
  This dataset contains monthly rainfall (mm) for 36 IMD (India Meteorological
  Department) meteorological subdivisions from 1901 to 2015.
  It is widely attributed to IMD / Government of India open data and is
  available on Kaggle. Its exact licensing is unverified; it is used here
  as a regional historical reference baseline only.

IMPORTANT geographic limitation:
  The dataset is at IMD SUBDIVISION level (36 subdivisions across India),
  NOT at district, city, or farm level. It cannot provide farm-level accuracy.
  It is used solely for regional seasonal baseline context.

Subdivision → state mapping used in this file is approximate and based on
  IMD's published meteorological subdivision boundaries. It maps Indian states
  to their closest IMD subdivision.

Usage:
  - get_historical_monthly_baseline(subdivision, month_number)
  - get_historical_seasonal_baseline(subdivision, season)
  - get_subdivision_for_state(state_name)
  - list_available_subdivisions()
"""

import pandas as pd
import os
from typing import Optional, Dict, Tuple

# --- Dataset path ---
_CSV_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "rainfall in india 1901-2015.csv",
)

# --- Module-level cache: load once per process ---
_df: Optional[pd.DataFrame] = None
_baselines: Dict[str, dict] = {}

# Month index → column name mapping
MONTH_COLS = {
    1: "JAN", 2: "FEB", 3: "MAR", 4: "APR",
    5: "MAY", 6: "JUN", 7: "JUL", 8: "AUG",
    9: "SEP", 10: "OCT", 11: "NOV", 12: "DEC",
}

# IMD Seasons → month column groups
SEASON_COLS = {
    "WINTER":       ["JAN", "FEB"],           # Jan-Feb
    "SUMMER":       ["MAR", "APR", "MAY"],    # Mar-May (pre-monsoon)
    "SW_MONSOON":   ["JUN", "JUL", "AUG", "SEP"],  # Jun-Sep (Kharif)
    "NE_MONSOON":   ["OCT", "NOV", "DEC"],   # Oct-Dec (Rabi start)
}

# Season column aliases in the CSV
SEASON_CSV_COLS = {
    "WINTER":       "Jan-Feb",
    "SUMMER":       "Mar-May",
    "SW_MONSOON":   "Jun-Sep",
    "NE_MONSOON":   "Oct-Dec",
}

# --- Approximate state → IMD subdivision mapping ---
# Based on IMD meteorological subdivision boundaries (approximate).
# Only states/regions needed for a pan-India hackathon demo are listed.
# Do NOT claim this is a precise geographic mapping.
STATE_TO_SUBDIVISION = {
    "ANDHRA PRADESH":       "COASTAL ANDHRA PRADESH",
    "ARUNACHAL PRADESH":    "ARUNACHAL PRADESH",
    "ASSAM":                "ASSAM & MEGHALAYA",
    "BIHAR":                "BIHAR",
    "CHHATTISGARH":         "CHHATTISGARH",
    "GOA":                  "KONKAN & GOA",
    "GUJARAT":              "GUJARAT REGION",
    "HARYANA":              "HARYANA DELHI & CHANDIGARH",
    "DELHI":                "HARYANA DELHI & CHANDIGARH",
    "HIMACHAL PRADESH":     "HIMACHAL PRADESH",
    "JAMMU AND KASHMIR":    "JAMMU & KASHMIR",
    "JHARKHAND":            "JHARKHAND",
    "KARNATAKA":            "NORTH INTERIOR KARNATAKA",
    "KERALA":               "KERALA",
    "MADHYA PRADESH":       "WEST MADHYA PRADESH",
    "MAHARASHTRA":          "MADHYA MAHARASHTRA",
    "MANIPUR":              "NAGA MANI MIZO TRIPURA",
    "MEGHALAYA":            "ASSAM & MEGHALAYA",
    "MIZORAM":              "NAGA MANI MIZO TRIPURA",
    "NAGALAND":             "NAGA MANI MIZO TRIPURA",
    "ODISHA":               "ORISSA",
    "PUNJAB":               "PUNJAB",
    "RAJASTHAN":            "WEST RAJASTHAN",
    "SIKKIM":               "SUB HIMALAYAN WEST BENGAL & SIKKIM",
    "TAMIL NADU":           "TAMIL NADU",
    "TELANGANA":            "TELANGANA",
    "TRIPURA":              "NAGA MANI MIZO TRIPURA",
    "UTTAR PRADESH":        "WEST UTTAR PRADESH",
    "UTTARAKHAND":          "UTTARAKHAND",
    "WEST BENGAL":          "GANGETIC WEST BENGAL",
    # City aliases
    "INDORE":               "WEST MADHYA PRADESH",
    "BHOPAL":               "WEST MADHYA PRADESH",
    "MUMBAI":               "KONKAN & GOA",
    "BANGALORE":            "SOUTH INTERIOR KARNATAKA",
    "HYDERABAD":            "TELANGANA",
    "CHENNAI":              "TAMIL NADU",
    "KOLKATA":              "GANGETIC WEST BENGAL",
    "PATNA":                "BIHAR",
    "JAIPUR":               "EAST RAJASTHAN",
}


def _load_df() -> pd.DataFrame:
    """Load and cache the historical rainfall CSV."""
    global _df
    if _df is not None:
        return _df
    try:
        _df = pd.read_csv(_CSV_PATH)
        # Validate expected columns
        expected = {"SUBDIVISION", "YEAR", "JAN", "FEB", "MAR", "APR", "MAY",
                    "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "ANNUAL"}
        missing_cols = expected - set(_df.columns)
        if missing_cols:
            raise ValueError(f"Missing expected columns: {missing_cols}")
        return _df
    except FileNotFoundError:
        raise FileNotFoundError(
            f"Historical rainfall CSV not found at: {_CSV_PATH}"
        )


def list_available_subdivisions() -> list:
    """Return all IMD subdivisions available in the dataset."""
    df = _load_df()
    return sorted(df["SUBDIVISION"].unique().tolist())


def get_subdivision_for_state(state_or_city: str) -> Optional[str]:
    """
    Return the IMD subdivision for a given state or city name.
    Returns None if no mapping exists.
    This is an approximate mapping — not geographically precise.
    """
    key = state_or_city.upper().strip()
    return STATE_TO_SUBDIVISION.get(key)


def get_historical_monthly_baseline(
    subdivision: str, month_number: int
) -> Optional[float]:
    """
    Return the long-term historical monthly average rainfall (mm) for a
    given IMD subdivision and calendar month (1=Jan, 12=Dec).

    Based on: data/unzipped/rainfall in india 1901-2015.csv (115 years of data).

    Returns None if subdivision is unknown or data is unavailable.
    """
    if month_number not in MONTH_COLS:
        return None
    col = MONTH_COLS[month_number]
    try:
        df = _load_df()
        sub_df = df[df["SUBDIVISION"].str.upper() == subdivision.upper()]
        if sub_df.empty:
            return None
        monthly_avg = sub_df[col].dropna().mean()
        return round(float(monthly_avg), 1) if not pd.isna(monthly_avg) else None
    except Exception:
        return None


def get_historical_seasonal_baseline(
    subdivision: str, season: str
) -> Optional[float]:
    """
    Return the historical average seasonal rainfall (mm) for a subdivision.
    Seasons: WINTER, SUMMER, SW_MONSOON, NE_MONSOON
    """
    season_upper = season.upper()
    if season_upper not in SEASON_CSV_COLS:
        return None
    csv_col = SEASON_CSV_COLS[season_upper]
    try:
        df = _load_df()
        sub_df = df[df["SUBDIVISION"].str.upper() == subdivision.upper()]
        if sub_df.empty:
            return None
        avg = sub_df[csv_col].dropna().mean()
        return round(float(avg), 1) if not pd.isna(avg) else None
    except Exception:
        return None


def get_historical_annual_baseline(subdivision: str) -> Optional[float]:
    """Return long-term average annual rainfall (mm) for a subdivision."""
    try:
        df = _load_df()
        sub_df = df[df["SUBDIVISION"].str.upper() == subdivision.upper()]
        if sub_df.empty:
            return None
        avg = sub_df["ANNUAL"].dropna().mean()
        return round(float(avg), 1) if not pd.isna(avg) else None
    except Exception:
        return None


def get_baseline_summary(subdivision: str) -> dict:
    """
    Return a full baseline summary for a subdivision.
    Includes monthly averages, seasonal totals, and annual average.
    """
    try:
        df = _load_df()
        sub_df = df[df["SUBDIVISION"].str.upper() == subdivision.upper()]
        if sub_df.empty:
            return {"available": False, "subdivision": subdivision}

        monthly = {}
        for num, col in MONTH_COLS.items():
            avg = sub_df[col].dropna().mean()
            monthly[col] = round(float(avg), 1) if not pd.isna(avg) else None

        seasonal = {}
        for season, csv_col in SEASON_CSV_COLS.items():
            avg = sub_df[csv_col].dropna().mean()
            seasonal[season] = round(float(avg), 1) if not pd.isna(avg) else None

        annual = sub_df["ANNUAL"].dropna().mean()

        return {
            "available": True,
            "subdivision": subdivision,
            "data_period": "1901-2015",
            "source": "IMD Subdivision-level historical rainfall (via Kaggle dataset)",
            "geographic_note": (
                "Subdivision-level data only. Not equivalent to farm-level rainfall."
            ),
            "annual_avg_mm": round(float(annual), 1) if not pd.isna(annual) else None,
            "monthly_avg_mm": monthly,
            "seasonal_avg_mm": seasonal,
        }
    except Exception as e:
        return {"available": False, "error": str(e)}


def compute_rainfall_anomaly(
    baseline_mm: Optional[float],
    observed_mm: Optional[float],
    baseline_period: str = "monthly",
    observed_period: str = "monthly",
    tolerance_pct: float = 10.0,
) -> dict:
    """
    Compute deviation between observed rainfall and historical baseline.

    IMPORTANT — period matching is enforced:
      - baseline_period and observed_period MUST match
        (both 'monthly', both 'seasonal', both 'annual').
      - NEVER compare a daily or sub-daily reading against a monthly/seasonal baseline.
      - If periods differ, returns available=False with an explanation.

    Parameters:
        baseline_mm: historical average for the reference period
        observed_mm: observed/forecast rainfall for a COMPARABLE period
        baseline_period: 'monthly' | 'seasonal' | 'annual'
        observed_period: must match baseline_period exactly
        tolerance_pct: % band considered 'near normal' (default ±10%)
    """
    # Enforce period match — refuse to produce a misleading anomaly
    if baseline_period != observed_period:
        return {
            "available": False,
            "reason": (
                f"Cannot compare a '{observed_period}' observation "
                f"against a '{baseline_period}' historical baseline. "
                "Periods must match to produce a meaningful anomaly."
            ),
            "baseline_mm": baseline_mm,
            "baseline_period": baseline_period,
            "observed_mm": observed_mm,
            "observed_period": observed_period,
        }

    if baseline_mm is None or observed_mm is None or baseline_mm == 0:
        return {
            "available": False,
            "reason": "Baseline or observation value is unavailable.",
            "baseline_mm": baseline_mm,
            "observed_mm": observed_mm,
        }

    deviation_mm = round(observed_mm - baseline_mm, 1)
    deviation_pct = round((deviation_mm / baseline_mm) * 100, 1)

    if deviation_pct > tolerance_pct:
        label = "ABOVE_HISTORICAL_BASELINE"
    elif deviation_pct < -tolerance_pct:
        label = "BELOW_HISTORICAL_BASELINE"
    else:
        label = "NEAR_HISTORICAL_BASELINE"

    return {
        "available": True,
        "baseline_mm": baseline_mm,
        "baseline_period": baseline_period,
        "observed_mm": round(observed_mm, 1),
        "observed_period": observed_period,
        "deviation_mm": deviation_mm,
        "deviation_percent": deviation_pct,
        "label": label,
    }

