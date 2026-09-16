"""
Crop model loader and prediction interface — BharatGrow ML service.

MODEL ARTIFACTS (all live in this directory, server-side only):
  crop_xgb_model.pkl  VotingClassifier(soft) over XGBClassifier + RandomForestClassifier
  scaler.pkl          StandardScaler — MANDATORY, the model was trained on scaled features
  label_encoder.pkl   LabelEncoder mapping class index -> crop name
  metrics.json        Held-out test metrics produced by train_xgboost.py

FEATURE ORDER is not a guess: scaler.pkl carries feature_names_in_ ==
['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall'] and predictions
must be built in exactly that order before scaling.

The model reports probabilities via predict_proba (soft voting), so top-k
confidences below are real model outputs, not derived or invented values.
"""

import json
import os
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

# Order enforced by scaler.pkl feature_names_in_ and train_xgboost.py
FEATURE_ORDER: List[str] = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]


class CropModelUnavailable(RuntimeError):
    """Raised when artifacts are missing or unusable. Never substituted with fake output."""


class CropModel:
    def __init__(self):
        self.model = None
        self.scaler = None
        self.encoder = None
        self.metrics: Optional[dict] = None
        self.load_error: Optional[str] = None

    def load(self) -> None:
        try:
            self.model = joblib.load(os.path.join(MODEL_DIR, "crop_xgb_model.pkl"))
            self.scaler = joblib.load(os.path.join(MODEL_DIR, "scaler.pkl"))
            self.encoder = joblib.load(os.path.join(MODEL_DIR, "label_encoder.pkl"))
            with open(os.path.join(MODEL_DIR, "metrics.json"), "r") as f:
                self.metrics = json.load(f)
        except Exception as e:
            self.load_error = str(e)
            self.model = self.scaler = self.encoder = None
            return

        scaler_features = getattr(self.scaler, "feature_names_in_", None)
        if scaler_features is not None and list(scaler_features) != FEATURE_ORDER:
            self.load_error = (
                f"Feature order mismatch: scaler expects {list(scaler_features)}, "
                f"service builds {FEATURE_ORDER}"
            )
            self.model = self.scaler = self.encoder = None

    @property
    def ready(self) -> bool:
        return self.model is not None and self.scaler is not None and self.encoder is not None

    @property
    def classes(self) -> List[str]:
        return list(self.encoder.classes_) if self.encoder is not None else []

    @property
    def test_accuracy(self) -> Optional[float]:
        """Held-out test accuracy from training. NOT a real-world field accuracy claim."""
        return self.metrics.get("accuracy") if self.metrics else None

    def predict(self, features: Dict[str, float], top_k: int = 3) -> dict:
        """
        Run the crop model on one field observation.

        features must contain every key in FEATURE_ORDER. Returns the model's own
        predict_proba values; missing or unusable artifacts raise instead of
        returning a placeholder prediction.
        """
        if not self.ready:
            raise CropModelUnavailable(
                self.load_error or "Crop model artifacts are not loaded"
            )

        missing = [f for f in FEATURE_ORDER if features.get(f) is None]
        if missing:
            raise ValueError(f"Missing required features: {missing}")

        X = pd.DataFrame(
            [[float(features[f]) for f in FEATURE_ORDER]],
            columns=FEATURE_ORDER,
        )
        X_scaled = self.scaler.transform(X)
        probs = self.model.predict_proba(X_scaled)[0]

        k = max(1, min(top_k, len(probs)))
        top_idx = np.argsort(probs)[::-1][:k]
        ranked = [
            {
                "crop": str(self.encoder.inverse_transform([int(i)])[0]),
                "probability": round(float(probs[int(i)]), 4),
            }
            for i in top_idx
        ]

        return {
            "recommended_crop": ranked[0]["crop"],
            "model_probability": ranked[0]["probability"],
            "top_crops": ranked,
            "feature_order_used": FEATURE_ORDER,
            "features_received": {f: float(features[f]) for f in FEATURE_ORDER},
        }


crop_model = CropModel()
