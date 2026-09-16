/**
 * Node provisioning — how many nodes a farm has, and where they sit.
 *
 * Reuses the farm data the signup flow already collects on the farmer profile
 * (farmSize, farmSizeUnit, latitude, longitude, farmName). No second farm model
 * is introduced.
 *
 * COVERAGE
 * One node monitors 500 m², so the true node count is ceil(area / 500). That
 * figure is reported honestly even when it is enormous: a 10 km x 10 km farm
 * really is 200,000 nodes.
 *
 * SIMULATED SUBSET
 * The simulator writes a row per node every 10 seconds, so provisioning all
 * 200,000 would mean 200,000 inserts per tick. Only the first SIM_MAX_NODES
 * (default 12) are actually provisioned and simulated; the rest are reported as
 * `unprovisioned` so the UI can state the real number without pretending to
 * stream data it does not have.
 *
 * PLACEMENT
 * The profile stores an area but no boundary polygon, so the plot is modelled as
 * a square of side sqrt(area). Nodes are laid out on a near-square grid inset
 * from the edges, which keeps every node inside the boundary and spatially
 * spread rather than clustered. Positions are stored both as normalised 0-1
 * blueprint coordinates (what the Map page draws) and as approximate lat/lon
 * offsets from the farm centre.
 */

const SQ_METRES_PER_NODE = 500;

const UNIT_TO_SQ_METRES = {
  acres: 4046.8564224,
  acre: 4046.8564224,
  hectares: 10000,
  hectare: 10000,
  ha: 10000,
  'sq m': 1,
  'sqm': 1,
  'm2': 1,
};

const DEFAULT_MAX_SIMULATED = 12;

// Roughly 111,320 m per degree of latitude; longitude is scaled by cos(lat).
const METRES_PER_DEG_LAT = 111320;

/** Configured ceiling on how many nodes the simulator will actually run. */
function maxSimulatedNodes() {
  const raw = Number(process.env.SIM_MAX_NODES);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return DEFAULT_MAX_SIMULATED;
}

/**
 * Farm area in square metres from the profile's size + unit.
 * Returns null when the farmer never supplied a usable size.
 */
function farmAreaSqMetres(profile = {}) {
  const size = Number(profile.farmSize);
  if (!Number.isFinite(size) || size <= 0) return null;

  const unitKey = String(profile.farmSizeUnit || 'acres').trim().toLowerCase();
  const factor = UNIT_TO_SQ_METRES[unitKey];
  if (!factor) return null;

  return size * factor;
}

/**
 * Node counts for a farm.
 *
 * `total` is the true coverage-based count; `simulated` is how many will stream
 * readings; `unprovisioned` is the honest remainder.
 */
function computeNodePlan(profile = {}) {
  const areaSqM = farmAreaSqMetres(profile);

  if (areaSqM === null) {
    // Signup always asks for farm size, but older profiles may lack it.
    // A 2,000 m² demonstration plot yields exactly four nodes at 500 m² each.
    const demoArea = 2000;
    const total = Math.ceil(demoArea / SQ_METRES_PER_NODE);
    const simulated = Math.min(total, maxSimulatedNodes());
    return {
      areaSqMetres: demoArea,
      plotSideMetres: Math.round(Math.sqrt(demoArea)),
      total,
      simulated,
      unprovisioned: total - simulated,
      sqMetresPerNode: SQ_METRES_PER_NODE,
      maxSimulated: maxSimulatedNodes(),
      demoPlot: true,
      reason: 'Farm size is missing, so a 2,000 m² demonstration plot (4 nodes) is used.',
    };
  }

  const total = Math.max(1, Math.ceil(areaSqM / SQ_METRES_PER_NODE));
  const simulated = Math.min(total, maxSimulatedNodes());

  return {
    areaSqMetres: Math.round(areaSqM),
    plotSideMetres: Math.round(Math.sqrt(areaSqM)),
    total,
    simulated,
    unprovisioned: total - simulated,
    sqMetresPerNode: SQ_METRES_PER_NODE,
    maxSimulated: maxSimulatedNodes(),
  };
}

/** BG-NODE-001, BG-NODE-002, ... Stable across restarts. */
function nodeIdFor(index) {
  return `BG-NODE-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Zone label for a grid cell.
 *
 * The grid is divided into at most 3x3 zone blocks, lettered A onward in
 * reading order, so Node 3 landing in the top-right block reads "Zone C".
 */
function zoneFor(row, col, rows, cols) {
  const zoneRows = Math.min(3, rows);
  const zoneCols = Math.min(3, cols);
  const zr = Math.min(zoneRows - 1, Math.floor((row / rows) * zoneRows));
  const zc = Math.min(zoneCols - 1, Math.floor((col / cols) * zoneCols));
  return `Zone ${String.fromCharCode(65 + zr * zoneCols + zc)}`;
}

/**
 * Build the node layout for a farm.
 *
 * Returns one entry per simulated node with its grid cell, normalised blueprint
 * position, approximate coordinates and zone. Deterministic: the same profile
 * always produces the same layout, so restarting the backend does not shuffle
 * a farmer's map.
 */
function buildNodeLayout(profile = {}) {
  const plan = computeNodePlan(profile);
  if (plan.simulated === 0) return { plan, nodes: [] };

  const count = plan.simulated;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const side = plan.plotSideMetres || 0;
  const centreLat = Number(profile.latitude);
  const centreLon = Number(profile.longitude);
  const hasCoords = Number.isFinite(centreLat) && Number.isFinite(centreLon);

  const nodes = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    // Cell centres, which keeps every node inset from the boundary.
    const x = (col + 0.5) / cols;
    const y = (row + 0.5) / rows;

    let latitude = null;
    let longitude = null;
    if (hasCoords && side > 0) {
      // Offset in metres from the plot centre, converted to degrees.
      const offsetNorth = (0.5 - y) * side;
      const offsetEast = (x - 0.5) * side;
      latitude = centreLat + offsetNorth / METRES_PER_DEG_LAT;
      const lonScale = METRES_PER_DEG_LAT * Math.cos((centreLat * Math.PI) / 180);
      longitude = centreLon + (lonScale > 0 ? offsetEast / lonScale : 0);
    }

    nodes.push({
      nodeId: nodeIdFor(i),
      nodeNumber: i + 1,
      zone: zoneFor(row, col, rows, cols),
      gridRow: row,
      gridCol: col,
      // Normalised blueprint coordinates, 0-1 across the plot.
      positionX: Number(x.toFixed(4)),
      positionY: Number(y.toFixed(4)),
      latitude: latitude === null ? null : Number(latitude.toFixed(6)),
      longitude: longitude === null ? null : Number(longitude.toFixed(6)),
      coversSqMetres: SQ_METRES_PER_NODE,
    });
  }

  return {
    plan: { ...plan, gridRows: rows, gridCols: cols },
    nodes,
  };
}

module.exports = {
  SQ_METRES_PER_NODE,
  UNIT_TO_SQ_METRES,
  maxSimulatedNodes,
  farmAreaSqMetres,
  computeNodePlan,
  buildNodeLayout,
  nodeIdFor,
  zoneFor,
};
