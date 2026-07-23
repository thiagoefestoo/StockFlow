export default function FloatingAlert({ message, type = 'danger', title, onClose }) {
  if (!message) return null;

  const isSuccess = type === 'success';
  const resolvedTitle = title || (isSuccess ? 'Tudo certo' : 'Atenção');
  const icon = isSuccess ? '✅' : type === 'warning' ? '⚠️' : '🚨';

  return (
    <div className={`floating-alert ${type}`} role="alert" aria-live="assertive">
      <div className="floating-alert-icon">{icon}</div>
      <div className="floating-alert-content">
        <strong>{resolvedTitle}</strong>
        <span>{message}</span>
      </div>
      {onClose && <button type="button" className="floating-alert-close" onClick={onClose} aria-label="Fechar aviso">×</button>}
    </div>
  );
}
