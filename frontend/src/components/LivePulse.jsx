import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function LivePulse() {
  const { isSupervisor } = useAuth();
  const [notifications, setNotifications] = useState({ unread: 0, notifications: [] });
  const [cockpit, setCockpit] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  async function load() {
    try {
      const notificationReq = api.get('/notifications');
      const cockpitReq = isSupervisor ? api.get('/operations/cockpit') : Promise.resolve({ data: { data: null } });
      const [n, c] = await Promise.all([notificationReq, cockpitReq]);
      setNotifications(n.data.data || { unread: 0, notifications: [] });
      setCockpit(c.data.data);
      setUpdatedAt(new Date());
    } catch (_) {}
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 45000);
    return () => clearInterval(id);
  }, [isSupervisor]);

  const tips = useMemo(() => {
    const list = [];
    const k = cockpit?.kpis || {};
    if (k.pendingApprovals > 0) list.push(`✅ ${k.pendingApprovals} aprovação(ões) aguardando decisão`);
    if (k.pendingSignatures > 0) list.push(`🖊️ ${k.pendingSignatures} guia(s) sem assinatura`);
    if (k.openOrders > 0) list.push(`📲 ${k.openOrders} OS aberta(s) para acompanhamento`);
    if (notifications.unread > 0) list.push(`🔔 ${notifications.unread} alerta(s) novo(s)`);
    if (!list.length) list.push('🟢 Operação sem pendências críticas agora');
    list.push('💡 Dica: confira a caixa do técnico antes de liberar nova carga');
    return list.slice(0, 4);
  }, [cockpit, notifications]);

  return (
    <section className="live-pulse" aria-live="polite">
      <div className="pulse-dot" />
      <div className="live-content">
        <strong>StockFlow ao vivo</strong>
        <div className="live-ticker">
          {tips.map((tip, index) => <span key={index}>{tip}</span>)}
        </div>
      </div>
      {updatedAt && <small>Atualizado {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>}
    </section>
  );
}
