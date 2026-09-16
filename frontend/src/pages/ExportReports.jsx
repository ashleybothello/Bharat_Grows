import { useState } from 'react';
import { FileText, Download, FileSpreadsheet } from 'lucide-react';
import axios from 'axios';
import { fetchMarketPrices } from '../utils/market';
import { API_URL } from '../utils/api';
import { fetchHardwareHistory, fetchHardwareLive, fetchTelemetryHistory } from '../utils/telemetry';
import { downloadBlob, linesToPdfBlob, stamp, toCsv } from '../utils/exportFiles';
import { cropsOf } from './dashboard/helpers';
import { readLatestAnalysis } from '../utils/latestAnalysis';
import PageHeader from '../components/PageHeader';
import { useLang } from '../context/LanguageContext';

function saveTable(format, title, slug, headers, rows, notes = []) {
  const date = stamp();
  if (format === 'csv') {
    downloadBlob(toCsv(headers, rows), `${slug}_${date}.csv`, 'text/csv;charset=utf-8');
    return;
  }
  const lines = [
    ...notes,
    notes.length ? '' : null,
    `Columns: ${headers.join(', ')}`,
    `Rows: ${rows.length}`,
    '',
    ...rows.flatMap((row, index) => [
      `#${index + 1}`,
      ...headers.map((key) => `  ${key}: ${row[key] ?? ''}`),
      '',
    ]),
  ].filter((line) => line != null);
  if (!rows.length) lines.push('No retrieved records.');
  downloadBlob(linesToPdfBlob(title, lines), `${slug}_${date}.pdf`, 'application/pdf');
}

export default function ExportReports() {
  const { t } = useLang();
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState({});

  const reports = [
    {
      id: 'soil',
      title: t.pg_export_soil,
      desc: t.pg_export_soil_d,
      source: t.pg_export_src_history,
    },
    {
      id: 'sensors',
      title: t.pg_export_sensors,
      desc: t.pg_export_sensors_d,
      source: t.pg_export_src_sim,
    },
    {
      id: 'hardware',
      title: t.pg_export_hw,
      desc: t.pg_export_hw_d,
      source: 'ESP32',
    },
    {
      id: 'market',
      title: t.pg_export_market,
      desc: t.pg_export_market_d,
      source: 'Government OGD / AGMARKNET',
    },
  ];

  const setCardNote = (id, message) => {
    setNote((prev) => ({ ...prev, [id]: message }));
  };

  const handleExport = async (id, format) => {
    const key = `${id}-${format}`;
    setBusy(key);
    setCardNote(id, '');
    try {
      if (id === 'soil') {
        const { data } = await axios.get(`${API_URL}/history`, { timeout: 20000 });
        const rows = (Array.isArray(data) ? data : []).map((item) => ({
          created_at: item.created_at,
          n: item.n,
          p: item.p,
          k: item.k,
          ph: item.ph,
          moisture: item.moisture,
          temperature: item.temperature,
          humidity: item.humidity,
          rainfall: item.rainfall,
          soil_quality: item.soil_quality,
          recommended_crops: cropsOf(item).join('; '),
        }));
        const analysis = readLatestAnalysis();
        const notes = [
          'Source: persisted Analyze / crop-model history.',
          analysis?.decision?.chosen_crop
            ? `Latest session crop decision: ${analysis.decision.chosen_crop}`
            : 'No in-session crop decision stored.',
        ];
        if (!rows.length) setCardNote(id, t.pg_export_empty);
        saveTable(format, t.pg_export_soil, 'soil_history', [
          'created_at', 'n', 'p', 'k', 'ph', 'moisture', 'temperature', 'humidity', 'rainfall', 'soil_quality', 'recommended_crops',
        ], rows, notes);
        return;
      }

      if (id === 'sensors') {
        let rows = [];
        let failed = false;
        try {
          const pack = await fetchTelemetryHistory({ limit: 200, range: '1w' });
          rows = (pack?.rows || []).map((row) => ({
            recorded_at: row.recorded_at,
            node_id: row.node_id || row.nodeId,
            source: row.source || 'SIMULATED',
            soil_moisture: row.soil_moisture,
            rain: row.rain,
            water_level: row.water_level,
            temperature: row.temperature,
            humidity: row.humidity,
          }));
        } catch {
          failed = true;
          setCardNote(id, t.pg_export_fail);
        }
        if (!failed && !rows.length) setCardNote(id, t.pg_export_empty);
        saveTable(format, t.pg_export_sensors, 'sensor_moisture_rain', [
          'recorded_at', 'node_id', 'source', 'soil_moisture', 'rain', 'water_level', 'temperature', 'humidity',
        ], rows, [
          'These are persisted farm-node readings. In this demo they are SIMULATED, not ESP32.',
          'Irrigation litre totals are not stored, so they are not exported.',
        ]);
        return;
      }

      if (id === 'hardware') {
        const live = await fetchHardwareLive();
        const devices = live?.devices || [];
        const packs = await Promise.all(devices.map((device) => fetchHardwareHistory({
          deviceId: device.deviceId,
          limit: 80,
        })));
        const rows = packs.flatMap((pack) => (pack?.rows || []).map((row) => ({
          device_id: row.deviceId,
          packet_at: row.packetAt,
          health: row.health,
          nitrogen: row.reading?.nitrogen,
          phosphorus: row.reading?.phosphorus,
          potassium: row.reading?.potassium,
          soil_moisture: row.reading?.soil_moisture,
          temperature: row.reading?.temperature,
          humidity: row.reading?.humidity,
          light: row.reading?.light,
          rain: row.reading?.rain,
          water_level: row.reading?.water_level,
          flame: row.reading?.flame,
          pir: row.reading?.pir,
        })));
        if (!rows.length) setCardNote(id, t.pg_export_empty);
        saveTable(format, t.pg_export_hw, 'esp32_telemetry', [
          'device_id', 'packet_at', 'health', 'nitrogen', 'phosphorus', 'potassium', 'soil_moisture',
          'temperature', 'humidity', 'light', 'rain', 'water_level', 'flame', 'pir',
        ], rows, ['Source: ESP32 packets stored separately from simulated farm nodes.']);
        return;
      }

      if (id === 'market') {
        const { ok, data } = await fetchMarketPrices({ limit: 500 });
        const records = data?.records || [];
        if (!ok || !data?.success || !records.length) {
          setCardNote(id, t.pg_export_market_fail);
          return;
        }
        const rows = records.map((row) => ({
          date: row.date,
          commodity: row.commodity,
          variety: row.variety,
          mandi: row.market,
          district: row.district,
          state: row.state,
          min: row.minPrice,
          modal: row.modalPrice,
          max: row.maxPrice,
          unit: row.unit,
          source: row.source,
        }));
        saveTable(format, t.pg_export_market, 'mandi_prices', [
          'date', 'commodity', 'variety', 'mandi', 'district', 'state', 'min', 'modal', 'max', 'unit', 'source',
        ], rows, ['Official AGMARKNET wholesale prices. No invented rates.']);
      }
    } catch {
      setCardNote(id, t.pg_export_fail);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="farm-page">
      <PageHeader kicker={t.pg_more_export} title={t.pg_more_export} lede={t.pg_export_lede} />

      <div className="export-grid">
        {reports.map((report) => (
          <article key={report.id} className="export-card">
            <div className="export-card-top">
              <span className="export-icon" aria-hidden>
                {report.id === 'market' || report.id === 'sensors' ? (
                  <FileSpreadsheet size={28} />
                ) : (
                  <FileText size={28} />
                )}
              </span>
              <em>{report.source}</em>
            </div>
            <h2>{report.title}</h2>
            <p>{report.desc}</p>
            <div className="export-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={Boolean(busy)}
                onClick={() => handleExport(report.id, 'csv')}
              >
                <Download size={16} />
                {busy === `${report.id}-csv` ? t.pg_export_generating : t.pg_export_csv}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={Boolean(busy)}
                onClick={() => handleExport(report.id, 'pdf')}
              >
                <Download size={16} />
                {busy === `${report.id}-pdf` ? t.pg_export_generating : t.pg_export_pdf}
              </button>
            </div>
            {note[report.id] ? <p className="export-note" role="alert">{note[report.id]}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
