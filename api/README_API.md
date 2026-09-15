# Bharat Grows - ML Inference API

This is the AI/ML Inference layer for Bharat Grows.

## Getting Started

1. Install dependencies:
   ```bash
   pip install -r api/requirements.txt
   ```

2. Start the server:
   ```bash
   uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
   ```

## Endpoints

### 1. Crop Recommendation
**POST** `/predict/crop`
```json
{
  "N": 90,
  "P": 42,
  "K": 43,
  "temperature": 20.8,
  "humidity": 82.0,
  "ph": 6.5,
  "rainfall": 202.9
}
```

### 2. Soil Analysis
**POST** `/analyze/soil`
```json
{
  "N": 35,
  "P": 45,
  "K": 20,
  "ph": 6.5
}
```

### 3. Irrigation Prediction
**POST** `/predict/irrigation`
```json
{
  "soil_moisture": 25.0,
  "temperature": 32.5,
  "humidity": 45.0,
  "rainfall": 0.0,
  "expected_rainfall": 2.0,
  "crop": "rice"
}
```

### 4. Farm Risk Score
**POST** `/predict/risk`
```json
{
  "soil_moisture": 15.0,
  "N": 20.0,
  "temperature": 42.0,
  "expected_rainfall": 0.0
}
```
