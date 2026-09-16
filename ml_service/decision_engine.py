"""
Crop Decision Engine — BharatGrow
=================================

This module is PROJECT-DEFINED SCORING LOGIC. It is NOT a machine learning model
and it is NOT an agronomic standard. It is a deterministic, auditable ranking
layer that combines three independent intelligence sources:

  1. Crop suitability     — real predict_proba output of the crop model
  2. Field water condition — rainfall intelligence risk levels (rule-based,
                             Open-Meteo forecast + IMD 1901-2015 baseline)
  3. Market attractiveness — real Government OGD / AGMARKNET modal prices,
                             supplied by the Express backend

Determinism: the same inputs always produce the same output. No randomness,
no time-dependent behaviour beyond the inputs handed to it.

WHY THE COMPONENTS ARE SHAPED THIS WAY
--------------------------------------
Crop suitability and market attractiveness are PER-CROP, so they decide the
ranking between candidate crops.

Field water condition is SHARED across all candidates. It is deliberately not
made per-crop: BharatGrow has no per-crop water-requirement dataset, and
inventing one would fabricate agronomy. Rainfall already influences the crop
ranking through the legitimate route — `rainfall` is one of the seven features
the crop model was trained on. The shared water score therefore acts as a
documented confidence modifier on the whole recommendation, and is always
reported to the user as its own explicit factor.

WEIGHTS
-------
Defaults below are project-chosen starting values, not derived from a study.
Override them with environment variables:
  DECISION_WEIGHT_CROP    (default 0.60)
  DECISION_WEIGHT_MARKET  (default 0.25)
  DECISION_WEIGHT_WATER   (default 0.15)

If market data is unavailable, the market weight is redistributed across the
remaining components proportionally, and `market_component` reports
available=False with a reason. Scores are never silently padded.
"""

import os
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    # python-dotenv is optional; plain OS environment variables still apply.
    pass


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


WEIGHTS = {
    "crop_suitability": _env_float("DECISION_WEIGHT_CROP", 0.60),
    "market_attractiveness": _env_float("DECISION_WEIGHT_MARKET", 0.25),
    "field_water_condition": _env_float("DECISION_WEIGHT_WATER", 0.15),
}

# Field water condition scores per documented risk level.
# Project-defined ordinal mapping of the rainfall engine's risk labels onto 0-1.
WATER_RISK_SCORES = {
    "LOW": 1.0,
    "MODERATE": 0.6,
    "HIGH": 0.2,
    "UNKNOWN": None,      # excluded from the average rather than guessed
    "UNAVAILABLE": None,
}

SCORING_VERSION = "decision-engine-v1"


def score_field_water_condition(rainfall_intelligence: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert rainfall risk labels into a single 0-1 field water score.

    Averages the three risk dimensions the rainfall engine actually produces.
    Dimensions reported as UNKNOWN/UNAVAILABLE are excluded, never defaulted.
    """
    dimensions = {
        "dry_spell_risk": rainfall_intelligence.get("dry_spell_risk", "UNKNOWN"),
        "heavy_rain_risk": rainfall_intelligence.get("heavy_rain_risk", "UNKNOWN"),
        "waterlogging_risk": rainfall_intelligence.get("waterlogging_risk", "UNKNOWN"),
    }

    used: Dict[str, float] = {}
    for name, label in dimensions.items():
        value = WATER_RISK_SCORES.get(str(label).upper())
        if value is not None:
            used[name] = value

    if not used:
        return {
            "available": False,
            "score": None,
            "reason": "No rainfall risk dimensions were available to score.",
            "risk_levels": dimensions,
        }

    score = round(sum(used.values()) / len(used), 4)
    return {
        "available": True,
        "score": score,
        "risk_levels": dimensions,
        "dimensions_scored": sorted(used.keys()),
        "note": (
            "Shared across all candidate crops. Derived from rule-based rainfall "
            "risk levels, not from a per-crop water requirement dataset."
        ),
    }


def score_market_attractiveness(
    candidate_crops: List[str],
    market_prices: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Relative market score per candidate crop from real OGD/AGMARKNET modal prices.

    market_prices maps a crop name to {"modal_price": float, ...} as fetched by
    the Express backend. Scoring is min-max normalised ACROSS THE CANDIDATE SET
    only — it expresses "which of these crops currently fetches more per quintal",
    never an absolute market rating. Crops without a real price get no score.
    """
    if not market_prices:
        return {
            "available": False,
            "reason": "No market price data supplied to the decision engine.",
            "scores": {},
        }

    observed: Dict[str, float] = {}
    for crop in candidate_crops:
        entry = market_prices.get(crop) or market_prices.get(crop.lower())
        if not isinstance(entry, dict):
            continue
        price = entry.get("modal_price")
        try:
            price = float(price)
        except (TypeError, ValueError):
            continue
        if price > 0:
            observed[crop] = price

    if not observed:
        return {
            "available": False,
            "reason": "No candidate crop had a usable modal price in the market data.",
            "scores": {},
        }

    if len(observed) == 1:
        only = next(iter(observed))
        return {
            "available": True,
            "scores": {only: 1.0},
            "observed_modal_prices": observed,
            "normalisation": "single candidate priced; assigned 1.0 by definition",
            "crops_without_price": [c for c in candidate_crops if c not in observed],
            "source": "Government OGD / AGMARKNET (via BharatGrow market service)",
        }

    low, high = min(observed.values()), max(observed.values())
    span = high - low
    scores = {
        crop: (1.0 if span == 0 else round((price - low) / span, 4))
        for crop, price in observed.items()
    }

    return {
        "available": True,
        "scores": scores,
        "observed_modal_prices": observed,
        "normalisation": "min-max across candidate crops only (relative, not absolute)",
        "crops_without_price": [c for c in candidate_crops if c not in observed],
        "source": "Government OGD / AGMARKNET (via BharatGrow market service)",
    }


def _effective_weights(has_market: bool, has_water: bool) -> Dict[str, float]:
    """Drop unavailable components and renormalise the rest to sum to 1."""
    active = {"crop_suitability": WEIGHTS["crop_suitability"]}
    if has_market:
        active["market_attractiveness"] = WEIGHTS["market_attractiveness"]
    if has_water:
        active["field_water_condition"] = WEIGHTS["field_water_condition"]

    total = sum(active.values())
    if total <= 0:
        return {"crop_suitability": 1.0}
    return {name: round(w / total, 4) for name, w in active.items()}


def rank_crops(
    crop_prediction: Dict[str, Any],
    rainfall_intelligence: Dict[str, Any],
    market_prices: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Combine crop model output, rainfall intelligence and market prices into a
    ranked, explainable recommendation.

    crop_prediction is the dict returned by CropModel.predict().
    Every returned crop carries its component sub-scores so the ranking can be
    audited line by line.
    """
    candidates = crop_prediction.get("top_crops") or []
    if not candidates:
        raise ValueError("crop_prediction contained no candidate crops to rank")

    candidate_names = [c["crop"] for c in candidates]

    water = score_field_water_condition(rainfall_intelligence)
    market = score_market_attractiveness(candidate_names, market_prices)

    weights = _effective_weights(
        has_market=market.get("available", False),
        has_water=water.get("available", False),
    )

    ranked = []
    for candidate in candidates:
        crop = candidate["crop"]
        components = {"crop_suitability": float(candidate["probability"])}

        if "market_attractiveness" in weights:
            market_score = market["scores"].get(crop)
            # A candidate with no real price contributes nothing rather than a guess.
            components["market_attractiveness"] = (
                float(market_score) if market_score is not None else 0.0
            )
        if "field_water_condition" in weights:
            components["field_water_condition"] = float(water["score"])

        total = sum(weights[name] * value for name, value in components.items())

        ranked.append({
            "crop": crop,
            "decision_score": round(total, 4),
            "model_probability": float(candidate["probability"]),
            "components": {k: round(v, 4) for k, v in components.items()},
            "weighted_contributions": {
                name: round(weights[name] * value, 4)
                for name, value in components.items()
            },
            "market_price_available": crop in market.get("scores", {}),
        })

    ranked.sort(key=lambda r: r["decision_score"], reverse=True)

    top = ranked[0]
    return {
        "scoring_version": SCORING_VERSION,
        "recommended_crop": top["crop"],
        "ranked_crops": ranked,
        "weights_used": weights,
        "configured_weights": WEIGHTS,
        "water_component": water,
        "market_component": market,
        "explanation": _explain(top, weights, water, market),
        "methodology_note": (
            "Project-defined deterministic scoring logic, not a trained model and "
            "not an agronomic standard. Crop suitability comes from the crop "
            "model's predict_proba output; field water condition from rule-based "
            "rainfall intelligence; market attractiveness from Government OGD / "
            "AGMARKNET modal prices normalised across candidate crops only."
        ),
    }


def _explain(
    top: Dict[str, Any],
    weights: Dict[str, float],
    water: Dict[str, Any],
    market: Dict[str, Any],
) -> str:
    """Plain-language account of why the top crop won, using only real values."""
    parts = [
        f"{top['crop']} ranked highest with a decision score of "
        f"{top['decision_score']:.2f} out of 1.00."
    ]
    parts.append(
        f"The crop model assigned it a probability of "
        f"{top['model_probability']:.0%} (weight {weights['crop_suitability']:.0%})."
    )

    if "market_attractiveness" in weights:
        if top["market_price_available"]:
            price = market["observed_modal_prices"][top["crop"]]
            parts.append(
                f"Its latest mandi modal price of Rs {price:,.0f} scored "
                f"{top['components']['market_attractiveness']:.2f} relative to the "
                f"other candidates (weight {weights['market_attractiveness']:.0%})."
            )
        else:
            parts.append(
                "No mandi price was available for this crop, so it contributed "
                "nothing to the market component."
            )
    else:
        parts.append(
            f"Market data was not part of this decision: {market.get('reason')}"
        )

    if "field_water_condition" in weights:
        levels = water["risk_levels"]
        parts.append(
            f"Field water conditions scored {water['score']:.2f} "
            f"(dry spell {levels['dry_spell_risk']}, heavy rain "
            f"{levels['heavy_rain_risk']}, waterlogging "
            f"{levels['waterlogging_risk']}; weight "
            f"{weights['field_water_condition']:.0%}). This factor applies equally "
            "to every candidate crop."
        )
    else:
        parts.append(
            f"Rainfall conditions were not scored: {water.get('reason')}"
        )

    return " ".join(parts)
