export default function EmptyState({ title = 'Nenhum registro encontrado', text = 'Quando houver dados, eles aparecerão aqui.' }) {
  return <div className="empty-state"><strong>{title}</strong><p>{text}</p></div>;
}
