"""
Crop Explanation Service for Bharat Grows.

Generates human-readable explanations for crop recommendations
based on actual input conditions. Does NOT invent agronomic facts
that are not supported by the model/input.
"""

from typing import List, Dict


def generate_crop_explanation(
    recommended_crop: str,
    score: float,
    inputs: dict,
) -> str:
    """
    Generate a human-readable explanation for a crop recommendation.

    Only references conditions that are actually present in the input.
    Does NOT fabricate agronomic facts beyond what the model uses.
    """
    parts = []

    # Temperature characterization
    temp = inputs.get("temperature")
    if temp is not None:
        if temp < 15:
            parts.append("cool temperatures")
        elif temp < 25:
            parts.append("moderate temperatures")
        elif temp < 35:
            parts.append("warm temperatures")
        else:
            parts.append("high temperatures")

    # Humidity characterization
    hum = inputs.get("humidity")
    if hum is not None:
        if hum > 75:
            parts.append("high humidity")
        elif hum > 50:
            parts.append("moderate humidity")
        else:
            parts.append("low humidity")

    # Rainfall characterization
    rain = inputs.get("rainfall")
    if rain is not None:
        if rain > 200:
            parts.append("high rainfall")
        elif rain > 100:
            parts.append("moderate rainfall")
        else:
            parts.append("low rainfall")

    # Soil characterization
    ph = inputs.get("ph")
    if ph is not None:
        if ph < 5.5:
            parts.append("acidic soil")
        elif ph > 7.5:
            parts.append("alkaline soil")
        else:
            parts.append("near-neutral pH soil")

    # NPK summary
    n, p, k = inputs.get("N"), inputs.get("P"), inputs.get("K")
    if n is not None and p is not None and k is not None:
        parts.append(f"soil nutrients (N={n:.0f}, P={p:.0f}, K={k:.0f})")

    if parts:
        conditions = ", ".join(parts)
        explanation = (
            f"{recommended_crop} is recommended (model confidence: {score:.0%}) "
            f"because the current conditions — {conditions} — "
            f"align with the patterns learned by the crop suitability model."
        )
    else:
        explanation = (
            f"{recommended_crop} is recommended with a model confidence of {score:.0%}."
        )

    return explanation
