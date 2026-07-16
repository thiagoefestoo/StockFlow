export default function KpiCard({ label, value, hint, tone = 'default' }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}
