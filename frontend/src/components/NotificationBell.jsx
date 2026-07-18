import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const severityIcon = {
  danger: 'AL',
  warning: 'AT',
  success: 'OK',
  info: 'IN',
};

const routeLabels = {
  '/aprovacoes': 'Aprovações pendentes',
  '/solicitacoes-material': 'Solicitações de material',
  '/transferencias': 'Guias de transferência',
  '/perdas-tecnico': 'Perdas/descontos',
  '/os': 'Ordens de serviço',
  '/caixa-tecnico': 'Minha caixa do técnico',
};

function badgeLabel(count) {
  const value = Number(count || 0);
  return value > 99 ? '99+' : String(value);
}

function pendingMessage(route, count) {
  const value = Number(count || 0);
  if (route === '/caixa-tecnico') return `${value} tarefa(s), aviso(s) ou guia(s) aguardando sua atenção.`;
  if (route === '/solicitacoes-material') return `${value} solicitação(ões) aguardando acompanhamento ou entrega.`;
  if (route === '/transferencias') return `${value} guia(s) aguardando assinatura ou conferência.`;
  if (route === '/perdas-tecnico') return `${value} guia(s) de perda/desconto aguardando assinatura.`;
  if (route === '/aprovacoes') return `${value} aprovação(ões) pendente(s).`;
  if (route === '/os') return `${value} OS aberta(s) ou pendente(s).`;
  return `${value} tarefa(s) pendente(s).`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, notifications: [] });
  const [pendingMenu, setPendingMenu] = useState({ total: 0, routes: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [notificationResult, pendingResult] = await Promise.allSettled([
        api.get('/notifications'),
        api.get('/operations/pending-menu'),
      ]);

      if (notificationResult.status === 'fulfilled') {
        setData(notificationResult.value.data.data || { unread: 0, notifications: [] });
      }
      if (pendingResult.status === 'fulfilled') {
        setPendingMenu(pendingResult.value.data.data || { total: 0, routes: {} });
      }
      if (notificationResult.status === 'rejected' && pendingResult.status === 'rejected') {
        throw notificationResult.reason || pendingResult.reason;
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Não foi possível carregar as notificações.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 45000);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', load);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const pendingTasks = useMemo(() => Object.entries(pendingMenu?.routes || {})
    .filter(([, count]) => Number(count || 0) > 0)
    .map(([route, count]) => ({
      id: `pending-${route}`,
      title: routeLabels[route] || 'Tarefa pendente',
      message: pendingMessage(route, count),
      severity: Number(count || 0) > 5 ? 'danger' : 'warning',
      route,
      isPendingTask: true,
      count: Number(count || 0),
    })), [pendingMenu]);

  const notifications = data.notifications || [];
  const totalBadge = Number(data.unread || 0) + Number(pendingMenu.total || 0);

  async function openPanel() {
    if (!open) await load();
    setOpen((current) => !current);
  }

  async function handleItemClick(item) {
    try {
      if (item?.id && !item.isPendingTask) await api.post(`/notifications/${item.id}/read`);
    } catch (_) {}
    setOpen(false);
    if (item?.route) navigate(item.route);
    load();
  }

  const panel = open ? createPortal(
    <div className="bell-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="bell-panel" role="dialog" aria-modal="true" aria-label="Central de notificações">
        <div className="bell-title">
          <div>
            <strong>Central de notificações</strong>
            <small>Tarefas pendentes, solicitações e alertas do sistema</small>
          </div>
          <div className="bell-title-actions">
            <span>{badgeLabel(totalBadge)} pendente(s)</span>
            <button type="button" className="bell-close" onClick={() => setOpen(false)} aria-label="Fechar notificações">×</button>
          </div>
        </div>

        {error && <div className="bell-error">{error}</div>}

        <div className="bell-list">
          {pendingTasks.map((item) => (
            <button key={item.id} type="button" className={`notification severity-${item.severity}`} onClick={() => handleItemClick(item)}>
              <i>{badgeLabel(item.count)}</i>
              <span className="notification-content">
                <strong>{item.title}</strong>
                <small>{item.message}</small>
              </span>
            </button>
          ))}

          {notifications.slice(0, 10).map((item) => (
            <button key={item.id} type="button" className={`notification severity-${item.severity || 'info'}`} onClick={() => handleItemClick(item)}>
              <i>{severityIcon[item.severity] || 'IN'}</i>
              <span className="notification-content">
                <strong>{item.title}</strong>
                <small>{item.message}</small>
              </span>
            </button>
          ))}

          {!loading && pendingTasks.length === 0 && notifications.length === 0 && (
            <div className="bell-empty">
              <strong>Tudo certo por aqui</strong>
              <span>Sem tarefas ou notificações pendentes no momento.</span>
            </div>
          )}
          {loading && <div className="bell-empty"><strong>Carregando...</strong><span>Buscando tarefas pendentes.</span></div>}
        </div>

        <div className="bell-footer">
          <button type="button" className="ghost" onClick={load}>Atualizar agora</button>
        </div>
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <div className="bell-wrap">
      <button
        type="button"
        className={`bell ${open ? 'is-open' : ''}${totalBadge > 0 ? ' has-alerts' : ''}`}
        onClick={openPanel}
        aria-label="Abrir central de notificações"
        aria-expanded={open}
      >
        <span>Notificações</span>
        {totalBadge > 0 && <b>{badgeLabel(totalBadge)}</b>}
      </button>
      {panel}
    </div>
  );
}
