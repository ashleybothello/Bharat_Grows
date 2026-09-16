export default function Metric({ label, value }) {
  return (
    <div className="dash-metric">
      <dt>{label}</dt>
      <dd className="tabular">{value ?? '—'}</dd>
    </div>
  );
}
