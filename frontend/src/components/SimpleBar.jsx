export default function SimpleBar({ label, value, max, money = false }) {
  const pct = max ? Math.min(100, Math.round((Number(value || 0) / Number(max || 1)) * 100)) : 0;
  return <div className="simple-bar"><div className="bar-label"><span>{label}</span><b>{money ? Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : value}</b></div><div className="bar-track"><i style={{ width: `${pct}%` }} /></div></div>;
}
