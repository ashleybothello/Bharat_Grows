# BharatGrow

Pride of Bharat, the farmer's smile. Soil intelligence, crop recommendation, mandi prices, GIS, farm telemetry, and pest detection for Indian farmers.

## Architecture

```
React (Vite, HashRouter)  →  Express (soil/backend)  →  FastAPI (ml_service)
         Vercel                        Render                     Render
                                              ↘
                                         Supabase PostgreSQL
```

Active backend: `soil/backend/server.js` (not a root `server.js`).

## Local development

Frontend (`frontend/`):

```
copy .env.example .env
npm install
npm run dev
```

`VITE_API_URL=http://localhost:5005`

Express (`soil/backend/`):

```
copy .env.example .env
# fill secrets locally; never commit .env
npm install
npm start
```

ML (`ml_service/`):

```
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Production

| Service | Host | Root | Build | Start |
|---|---|---|---|---|
| Frontend | Vercel | `frontend` | `npm run build` | static `dist` |
| API | Render | `soil/backend` | `npm install` | `npm start` |
| ML | Render | `ml_service` | `pip install -r requirements.txt` | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

Vercel env: `VITE_API_URL` = public Render API URL.

Render API env (set in the dashboard, never in git): `DATABASE_URL`, `ML_SERVICE_URL`, `FRONTEND_URL`, `DATA_GOV_API_KEY`, `FAST2SMS_API_KEY`, `GEMINI_API_KEY`, `PLANT_ID_API_KEY` or `PLANT_HEALTH_API_KEY`, `INSECT_ID_API_KEY`, `SMTP_*`, `SESSION_SECRET`, `JWT_SECRET`, `OTP_HASH_SECRET`, optional `ESP_GATEWAY_URL`, `ALERT_TO_EMAIL`.

Pest detection uses Kindwise **plant.id** (leaf) and **insect.id** (insect). Keys stay on Express.

Telemetry `source=SIMULATED` is software simulation, not live hardware. Hardware Beta uses `esp_telemetry`.
