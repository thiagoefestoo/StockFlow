import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const ROTATION_MS = 30000;

const PENDING_TIPS = {
  '/aprovacoes': {
    id: 'pending-approvals',
    icon: '✓',
    tone: 'warning',
    title: (count) => `${count} aprovação(ões) aguardando decisão`,
    message: 'Revise as solicitações pendentes para não atrasar a separação e a entrega dos materiais.',
    actionLabel: 'Abrir aprovações',
  },
  '/solicitacoes-material': {
    id: 'pending-material-requests',
    icon: '▣',
    tone: 'warning',
    title: (count) => `${count} solicitação(ões) precisam de acompanhamento`,
    message: 'Confira os pedidos aprovados e em andamento para manter o atendimento dos técnicos em dia.',
    actionLabel: 'Ver solicitações',
  },
  '/transferencias': {
    id: 'pending-transfer-signatures',
    icon: '✎',
    tone: 'danger',
    title: (count) => `${count} guia(s) de transferência sem assinatura`,
    message: 'Anexe ou confira os termos pendentes para preservar a rastreabilidade da carga entregue.',
    actionLabel: 'Ver transferências',
  },
  '/perdas-tecnico': {
    id: 'pending-loss-signatures',
    icon: '!',
    tone: 'danger',
    title: (count) => `${count} guia(s) de perda aguardando tratamento`,
    message: 'Revise a ocorrência e a documentação antes de concluir o processo de perda ou desconto.',
    actionLabel: 'Ver perdas',
  },
  '/avaliacao-perdas': {
    id: 'pending-loss-evaluation',
    icon: '⌕',
    tone: 'warning',
    title: (count) => `${count} avaliação(ões) de perda aguardando análise`,
    message: 'Confira os detalhes, evidências e responsabilidades antes de tomar uma decisão.',
    actionLabel: 'Avaliar perdas',
  },
  '/os': {
    id: 'pending-service-orders',
    icon: 'OS',
    tone: 'info',
    title: (count) => `${count} OS aberta(s) ou pendente(s)`,
    message: 'Acompanhe o que os técnicos estão executando e confirme se as baixas de materiais foram registradas corretamente.',
    actionLabel: 'Acompanhar OS',
  },
  '/tecnicos': {
    id: 'pending-technician-terms',
    icon: 'T',
    tone: 'warning',
    title: (count) => `${count} técnico(s) com documentação para revisar`,
    message: 'Mantenha termos e vínculos atualizados para garantir a responsabilidade sobre ferramentas e materiais.',
    actionLabel: 'Ver técnicos',
  },
  '/caixa-tecnico': {
    id: 'pending-technician-box',
    icon: '▤',
    tone: 'warning',
    title: (count) => `${count} tarefa(s) aguardando atenção na caixa do técnico`,
    message: 'Confira cargas, solicitações, assinaturas e OS para manter sua caixa atualizada.',
    actionLabel: 'Abrir minha caixa',
  },
};

const CONTEXT_TIPS = [
  {
    id: 'context-transfers',
    match: '/transferencias',
    icon: '✎',
    tone: 'info',
    title: 'Você está acompanhando as transferências',
    message: 'Antes de concluir, confira técnico, cidade, quantidades e anexos da guia de assinatura.',
  },
  {
    id: 'context-orders',
    match: '/os',
    icon: 'OS',
    tone: 'info',
    title: 'Você está acompanhando as ordens de serviço',
    message: 'Compare os materiais utilizados com a caixa do técnico e investigue baixas fora do padrão.',
  },
  {
    id: 'context-requests',
    match: '/solicitacoes-material',
    icon: '▣',
    tone: 'info',
    title: 'Você está no fluxo de solicitações',
    message: 'Confira cidade, estoque de origem, saldo disponível e quantidade aprovada antes da entrega.',
  },
  {
    id: 'context-stock',
    match: '/estoque',
    icon: '▦',
    tone: 'info',
    title: 'Você está analisando o estoque',
    message: 'Use os filtros por cidade e saldo para localizar divergências antes que afetem uma solicitação.',
  },
];

const GENERAL_TIPS = [
  {
    id: 'general-technician-box',
    module: 'technicianBoxControl',
    route: '/central-caixa-tecnico',
    icon: '▤',
    tone: 'success',
    title: 'Acompanhe a caixa de cada técnico',
    message: 'Confira materiais, ONUs e ferramentas em posse do técnico para não perder a rastreabilidade.',
    actionLabel: 'Abrir Central da Caixa',
  },
  {
    id: 'general-service-orders',
    module: 'serviceOrders',
    route: '/os',
    icon: 'OS',
    tone: 'info',
    title: 'Observe o consumo nas ordens de serviço',
    message: 'Acompanhe quantidades utilizadas, seriais instalados e serviços concluídos para identificar desvios rapidamente.',
    actionLabel: 'Ver ordens de serviço',
  },
  {
    id: 'general-transfer-signatures',
    module: 'transfers',
    route: '/transferencias',
    icon: '✎',
    tone: 'info',
    title: 'Mantenha as transferências documentadas',
    message: 'Uma guia sem assinatura reduz a segurança da custódia. Revise as pendências ao longo do dia.',
    actionLabel: 'Ver transferências',
  },
  {
    id: 'general-material-requests',
    module: 'materialRequests',
    route: '/solicitacoes-material',
    icon: '▣',
    tone: 'success',
    title: 'Acompanhe o ciclo completo das solicitações',
    message: 'Pedido, aprovação, separação e entrega precisam permanecer vinculados à cidade e ao estoque corretos.',
    actionLabel: 'Ver solicitações',
  },
  {
    id: 'general-serial-life',
    module: 'serialLife',
    route: '/vida-serial',
    icon: '#',
    tone: 'info',
    title: 'Use a vida do serial para investigar equipamentos',
    message: 'Consulte origem, transferências, técnico responsável, instalação e devoluções de cada ONU.',
    actionLabel: 'Consultar serial',
  },
  {
    id: 'general-financial-bi',
    module: 'biFinancial',
    route: '/bi/financeiro',
    icon: 'BI',
    tone: 'success',
    title: 'Compare entradas, posição atual e consumo',
    message: 'O BI Financeiro ajuda a localizar diferenças entre materiais recebidos e destinos documentados.',
    actionLabel: 'Abrir BI Financeiro',
  },
  {
    id: 'general-audit',
    module: 'audit',
    route: '/auditoria',
    icon: '⌕',
    tone: 'info',
    title: 'Use a auditoria antes de corrigir um registro',
    message: 'Confira quem realizou a ação, quando aconteceu e qual documento originou a movimentação.',
    actionLabel: 'Abrir auditoria',
  },
  {
    id: 'general-technician-request',
    module: 'materialRequests',
    technicianOnly: true,
    route: '/solicitacoes-material',
    icon: '+',
    tone: 'success',
    title: 'Solicite apenas o necessário para sua operação',
    message: 'Antes de pedir uma nova carga, confira o saldo disponível na sua caixa e as solicitações em andamento.',
    actionLabel: 'Ver solicitações',
  },
  {
    id: 'general-technician-os',
    module: 'serviceOrders',
    technicianOnly: true,
    route: '/os',
    icon: 'OS',
    tone: 'info',
    title: 'Registre a OS logo após o atendimento',
    message: 'A baixa imediata mantém seu saldo correto e ajuda a empresa a acompanhar o consumo real.',
    actionLabel: 'Registrar ou consultar OS',
  },
  {
    id: 'general-technician-serial',
    module: 'serialLife',
    technicianOnly: true,
    route: '/vida-serial',
    icon: '#',
    tone: 'info',
    title: 'Confirme o serial antes da instalação',
    message: 'Verifique se a ONU selecionada está realmente na sua caixa e se o patrimônio corresponde ao equipamento físico.',
    actionLabel: 'Consultar serial',
  },
];

function normalizedCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
}

function uniqueTips(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function LivePulse() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isTechnician, canAccessModule, canAccessPath } = useAuth();
  const [notifications, setNotifications] = useState({ unread: 0, notifications: [] });
  const [pendingMenu, setPendingMenu] = useState({ total: 0, routes: {} });
  const [updatedAt, setUpdatedAt] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  async function load() {
    try {
      // Estes mesmos endpoints também alimentam o sino de notificações. O cache do
      // cliente deduplica as chamadas e evita consultas adicionais ao banco.
      const [notificationResult, pendingResult] = await Promise.allSettled([
        api.getCached('/notifications', { params: { limit: 20 } }, 60000),
        api.getCached('/operations/pending-menu', {}, 60000),
      ]);

      if (notificationResult.status === 'fulfilled') {
        setNotifications(notificationResult.value.data.data || { unread: 0, notifications: [] });
      }
      if (pendingResult.status === 'fulfilled') {
        setPendingMenu(pendingResult.value.data.data || { total: 0, routes: {} });
      }
      if (notificationResult.status === 'fulfilled' || pendingResult.status === 'fulfilled') {
        setUpdatedAt(new Date());
      }
    } catch (_) {}
  }

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') load();
    };

    refreshWhenVisible();
    const id = window.setInterval(refreshWhenVisible, 120000);
    window.addEventListener('focus', refreshWhenVisible);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [user?.id]);

  const tips = useMemo(() => {
    const pendingTips = Object.entries(pendingMenu?.routes || {})
      .map(([route, rawCount]) => ({ route, count: normalizedCount(rawCount), config: PENDING_TIPS[route] }))
      .filter(({ route, count, config }) => count > 0 && config && canAccessPath(route))
      .map(({ route, count, config }) => ({
        ...config,
        id: `${config.id}-${count}`,
        route,
        title: config.title(count),
        kind: 'Ação recomendada',
        priority: 100,
      }));

    const notificationTips = (notifications.notifications || [])
      .filter((item) => item.status === 'nao_lida')
      .filter((item) => !item.route || canAccessPath(item.route))
      .slice(0, 3)
      .map((item) => ({
        id: `notification-${item.id}`,
        icon: item.severity === 'danger' ? '!' : item.severity === 'success' ? '✓' : 'i',
        tone: item.severity || 'info',
        title: item.title || 'Novo aviso do sistema',
        message: item.message || 'Abra a central de notificações para conferir os detalhes.',
        route: item.route || '',
        actionLabel: item.route ? 'Ver agora' : '',
        kind: 'Novo acontecimento',
        priority: 80,
      }));

    const contextualTip = CONTEXT_TIPS.find((item) => location.pathname.startsWith(item.match));
    const contextualTips = contextualTip ? [{ ...contextualTip, kind: 'Dica desta página', priority: 50 }] : [];

    const generalTips = GENERAL_TIPS
      .filter((item) => !item.module || canAccessModule(item.module))
      .filter((item) => !item.technicianOnly || isTechnician)
      .filter((item) => isTechnician || !item.technicianOnly)
      .filter((item) => !item.route || canAccessPath(item.route))
      .map((item) => ({ ...item, kind: 'Boa prática', priority: 10 }));

    const calmTip = pendingTips.length || notificationTips.length
      ? []
      : [{
        id: 'operation-clear',
        icon: '✓',
        tone: 'success',
        title: 'Operação sem pendências críticas agora',
        message: 'Aproveite para revisar caixas, documentos e movimentações recentes antes do próximo atendimento.',
        kind: 'Tudo em dia',
        priority: 90,
      }];

    return uniqueTips([
      ...pendingTips,
      ...notificationTips,
      ...calmTip,
      ...contextualTips,
      ...generalTips,
    ]).slice(0, 14);
  }, [pendingMenu, notifications, location.pathname, canAccessModule, canAccessPath, isTechnician]);

  const tipsSignature = useMemo(
    () => tips.map((tip) => tip.id).join('|'),
    [tips]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [tipsSignature]);

  useEffect(() => {
    if (tips.length <= 1) return undefined;

    let timeoutId;

    const scheduleNext = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        if (document.visibilityState === 'visible') {
          setActiveIndex((current) => (current + 1) % tips.length);
        } else {
          scheduleNext();
        }
      }, ROTATION_MS);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleNext();
    };

    scheduleNext();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeIndex, tips.length, tipsSignature]);

  const currentTip = tips[activeIndex % Math.max(tips.length, 1)] || {
    id: 'loading-tip',
    icon: 'i',
    tone: 'info',
    kind: 'Dica inteligente',
    title: 'Carregando acontecimentos da operação',
    message: 'Aguarde enquanto o sistema organiza as recomendações mais relevantes para seu acesso.',
  };

  function showNextTip() {
    if (tips.length <= 1) return;
    setActiveIndex((current) => (current + 1) % tips.length);
  }

  function openTip() {
    if (currentTip.route) navigate(currentTip.route);
  }

  return (
    <section className={`live-pulse tone-${currentTip.tone || 'info'}`} aria-live="polite">
      <div className="live-tip-icon" aria-hidden="true">{currentTip.icon || 'i'}</div>

      <div className="live-content" key={currentTip.id}>
        <div className="live-tip-kicker">
          <strong>{currentTip.kind || 'Dica inteligente'}</strong>
          {tips.length > 1 && <span>{activeIndex + 1} de {tips.length}</span>}
        </div>
        <h3>{currentTip.title}</h3>
        <p>{currentTip.message}</p>
      </div>

      <div className="live-tip-actions">
        {currentTip.route && currentTip.actionLabel && (
          <button type="button" className="live-tip-open" onClick={openTip}>
            {currentTip.actionLabel}
          </button>
        )}
        {tips.length > 1 && (
          <button type="button" className="live-tip-next" onClick={showNextTip} aria-label="Mostrar próxima dica">
            Próxima <span aria-hidden="true">›</span>
          </button>
        )}
        {updatedAt && (
          <small>
            Atualizado {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </small>
        )}
      </div>

      {tips.length > 1 && (
        <div className="live-tip-progress" aria-hidden="true">
          <span key={`${currentTip.id}-${activeIndex}`} />
        </div>
      )}
    </section>
  );
}
