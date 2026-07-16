import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import api from '../services/api';

const severityIcon = {
  danger: 'AL',
  warning: 'AT',
  success: 'OK',
  info: 'IN',
};

const defaultPosition = { top: 96, right: 28, left: 'auto', width: '430px' };

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, notifications: [] });
  const [position, setPosition] = useState(defaultPosition);
  const dialogRef = useRef(null);
  const buttonRef = useRef(null);

  async function load() {
    try {
      const res = await api.get('/notifications');
      setData(res.data.data || { unread: 0, notifications: [] });
    } catch (_) {}
  }

  function calculatePosition() {
    const button = buttonRef.current;
    if (!button || typeof window === 'undefined') return defaultPosition;

    const rect = button.getBoundingClientRect();
    const isMobile = window.innerWidth <= 760;
    const safeMargin = isMobile ? 12 : 24;
    const panelWidth = Math.min(460, window.innerWidth - safeMargin * 2);
    const top = Math.min(
      Math.max(rect.bottom + 12, safeMargin),
      Math.max(safeMargin, window.innerHeight - 120)
    );

    if (isMobile) {
      return {
        top,
        left: safeMargin,
        right: safeMargin,
        width: `calc(100vw - ${safeMargin * 2}px)`,
      };
    }

    return {
      top,
      right: Math.max(window.innerWidth - rect.right, safeMargin),
      left: 'auto',
      width: `${panelWidth}px`,
    };
  }

  function updatePosition() {
    setPosition(calculatePosition());
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    if (open && !dialog.open) {
      try {
        updatePosition();
        dialog.showModal();
      } catch (_) {}
    }

    if (!open && dialog.open) {
      dialog.close();
    }

    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleResize() {
      updatePosition();
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [open]);

  async function markRead(item) {
    try {
      if (item?.id) await api.post(`/notifications/${item.id}/read`);
      load();
    } catch (_) {}
  }

  function closeDialog() {
    setOpen(false);
  }

  function handleDialogClick(event) {
    if (event.target === dialogRef.current) closeDialog();
  }

  const notifications = data.notifications || [];

  return (
    <div className="bell-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`bell ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label="Abrir central de notificações"
        aria-expanded={open}
      >
        <span>Notificações</span>
        {data.unread > 0 && <b>{data.unread}</b>}
      </button>

      <dialog
        ref={dialogRef}
        className="bell-dialog"
        aria-label="Central viva de notificações"
        onCancel={closeDialog}
        onClose={() => setOpen(false)}
        onClick={handleDialogClick}
        style={{
          top: `${position.top}px`,
          right: position.left === 'auto' ? `${position.right}px` : `${position.right}px`,
          left: position.left === 'auto' ? 'auto' : `${position.left}px`,
          width: position.width,
        }}
      >
        <section className="bell-dialog-card" onClick={(event) => event.stopPropagation()}>
          <div className="bell-title">
            <div>
              <strong>Central viva</strong>
              <small>Alertas, tarefas e dicas do StockFlow</small>
            </div>
            <div className="bell-title-actions">
              <span>{data.unread || 0} novas</span>
              <button type="button" className="bell-close" onClick={closeDialog} aria-label="Fechar notificações">×</button>
            </div>
          </div>

          <div className="bell-list">
            {notifications.slice(0, 8).map((item) => (
              <button key={item.id} type="button" className={`notification severity-${item.severity || 'info'}`} onClick={() => markRead(item)}>
                <i>{severityIcon[item.severity] || 'IN'}</i>
                <span className="notification-content">
                  <strong>{item.title}</strong>
                  <small>{item.message}</small>
                </span>
              </button>
            ))}
            {notifications.length === 0 && (
              <div className="bell-empty">
                <strong>Tudo certo por aqui</strong>
                <span>Sem novas notificações no momento.</span>
              </div>
            )}
          </div>

          <div className="bell-footer">
            <button type="button" className="ghost" onClick={load}>Atualizar agora</button>
          </div>
        </section>
      </dialog>
    </div>
  );
}
