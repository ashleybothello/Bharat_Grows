import { useEffect, useState } from 'react';
import { API_URL } from '../../utils/api';
import { fetchMarketCrop, fetchMarketTrends } from '../../utils/market';
import { fetchAnomalies, fetchNodes } from '../../utils/telemetry';
import { cropsOf } from './helpers';

export default function useDashboardData() {
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [historyError, setHistoryError] = useState(false);
  const [latest, setLatest] = useState(null);
  const [points, setPoints] = useState([]);
  const [marketError, setMarketError] = useState(false);
  const [marketLoading, setMarketLoading] = useState(true);
  const [nodesPack, setNodesPack] = useState(null);
  const [latestAnomaly, setLatestAnomaly] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/history`);
        if (!res.ok) throw new Error('history');
        const rows = await res.json();
        if (!cancelled && Array.isArray(rows) && rows.length) {
          setLastAnalysis(rows[0]);
        }
      } catch {
        if (!cancelled) setHistoryError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadNodes = async () => {
      try {
        const [pack, events] = await Promise.all([
          fetchNodes(),
          fetchAnomalies({ limit: 1, severity: 'CRITICAL' }),
        ]);
        if (cancelled) return;
        setNodesPack(pack);
        setLatestAnomaly(events.rows?.[0] || null);
      } catch {
        if (!cancelled) {
          setNodesPack(null);
          setLatestAnomaly(null);
        }
      }
    };
    loadNodes();
    const timer = window.setInterval(loadNodes, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cropRes, trendRes] = await Promise.all([
          fetchMarketCrop('Wheat'),
          fetchMarketTrends({ commodity: 'Wheat', range: '7d' }),
        ]);
        if (cancelled) return;
        if (!cropRes.ok || !cropRes.data?.success) {
          setMarketError(true);
          return;
        }
        setLatest(cropRes.data.latest || null);
        if (trendRes.ok && trendRes.data?.success) {
          setPoints(trendRes.data.data || trendRes.data.observations || []);
        }
      } catch {
        if (!cancelled) setMarketError(true);
      } finally {
        if (!cancelled) setMarketLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const crops = cropsOf(lastAnalysis);
  const nodes = nodesPack?.nodes || [];
  const liveNode = nodes.find((n) => n.lastReadingAt) || null;
  const nodeCounts = {
    total: nodes.length,
    healthy: nodes.filter((n) => n.health === 'GOOD').length,
    warning: nodes.filter((n) => n.health === 'AVERAGE' || n.health === 'BAD').length,
    critical: nodes.filter((n) => n.health === 'CRITICAL').length,
  };
  return {
    lastAnalysis,
    historyError,
    latest,
    points,
    marketError,
    marketLoading,
    crops,
    crop: crops[0],
    hasSoil: Boolean(lastAnalysis || liveNode),
    nodesPack,
    liveNode,
    nodeCounts,
    latestAnomaly,
  };
}
