const { Op } = require('sequelize');
const {
  Material,
  StockBalance,
  SerializedAsset,
  Transfer,
  Technician,
  Notification,
  ServiceOrder,
  MaterialRequest,
} = require('../models');
const { daysBetween, money } = require('../utils/number');

async function createOnce(where, payload) {
  const existing = await Notification.findOne({ where });
  if (!existing) return Notification.create(payload);
  return existing;
}

async function generateSmartNotifications() {
  const created = [];
  const materials = await Material.findAll({ where: { active: true } });
  for (const material of materials) {
    const balance = await StockBalance.findOne({ where: { materialId: material.id, ownerType: 'estoque', technicianId: null } });
    const nonSerialQty = Number(balance?.quantity || 0);
    const serialQty = await SerializedAsset.count({ where: { materialId: material.id, ownerType: 'estoque' } });
    const totalAvailable = material.requiresSerial ? serialQty : nonSerialQty;
    if (Number(material.minStock || 0) > 0 && totalAvailable <= Number(material.minStock)) {
      created.push(await createOnce(
        { type: 'estoque', status: 'nao_lida', title: `Estoque baixo: ${material.name}` },
        {
          role: 'admin',
          type: 'estoque',
          severity: totalAvailable === 0 ? 'danger' : 'warning',
          title: `Estoque baixo: ${material.name}`,
          message: `O material ${material.name} está com saldo ${totalAvailable}. Estoque mínimo configurado: ${material.minStock}.`,
          route: '/estoque',
          metadata: { materialId: material.id, available: totalAvailable, minStock: material.minStock },
        }
      ));
    }
  }

  const oldAssets = await SerializedAsset.findAll({
    where: {
      ownerType: 'tecnico',
      custodyStartedAt: { [Op.lte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    include: [Material, Technician],
    limit: 30,
    order: [['custodyStartedAt', 'ASC']],
  });
  for (const asset of oldAssets) {
    const days = daysBetween(asset.custodyStartedAt);
    created.push(await createOnce(
      { type: 'patrimonio', status: 'nao_lida', title: `ONU parada com técnico: ${asset.serialNumber}` },
      {
        role: 'supervisor',
        type: 'patrimonio',
        severity: days >= 60 ? 'danger' : 'warning',
        title: `ONU parada com técnico: ${asset.serialNumber}`,
        message: `${asset.Material?.name || 'Equipamento'} está há ${days} dias com ${asset.Technician?.name || 'técnico'}. Verifique baixa por OS, devolução ou pendência.`,
        route: `/patrimonio?serial=${encodeURIComponent(asset.serialNumber)}`,
        metadata: { assetId: asset.id, technicianId: asset.technicianId, days },
      }
    ));
  }

  const unsigned = await Transfer.findAll({
    where: {
      status: 'pendente_assinatura',
      deliveredAt: { [Op.lte]: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    },
    include: [Technician],
    limit: 20,
  });
  for (const transfer of unsigned) {
    created.push(await createOnce(
      { type: 'assinatura', status: 'nao_lida', title: `Guia sem assinatura: ${transfer.transferNumber}` },
      {
        role: 'admin',
        type: 'assinatura',
        severity: 'warning',
        title: `Guia sem assinatura: ${transfer.transferNumber}`,
        message: `A guia entregue para ${transfer.Technician?.name || 'técnico'} ainda não possui anexo assinado.`,
        route: `/transferencias/${transfer.id}`,
        metadata: { transferId: transfer.id },
      }
    ));
  }

  const todayOrders = await ServiceOrder.count({ where: { createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  if (todayOrders === 0) {
    created.push(await createOnce(
      { type: 'dica', status: 'nao_lida', title: 'Dica operacional: baixa diária de OS' },
      {
        role: 'tecnico',
        type: 'dica',
        severity: 'info',
        title: 'Dica operacional: baixa diária de OS',
        message: 'Registre as OS no mesmo dia da execução. Isso mantém o estoque do técnico correto e evita divergência na guia mensal.',
        route: '/portal-tecnico',
        metadata: { source: 'auto-intelligence' },
      }
    ));
  }


  const pendingRequests = await MaterialRequest.findAll({
    where: {
      status: 'pendente_aprovacao',
      createdAt: { [Op.lte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    include: [Technician],
    limit: 20,
  });
  for (const request of pendingRequests) {
    created.push(await createOnce(
      { type: 'tarefa', status: 'nao_lida', title: `Solicitação aguardando aprovação: ${request.requestNumber}` },
      {
        role: 'supervisor',
        type: 'tarefa',
        severity: request.priority === 'critica' ? 'danger' : 'warning',
        title: `Solicitação aguardando aprovação: ${request.requestNumber}`,
        message: `${request.Technician?.name || 'Técnico'} aguarda aprovação de material há mais de 24 horas.`,
        route: '/aprovacoes',
        metadata: { requestId: request.id, requestNumber: request.requestNumber },
      }
    ));
  }

  const approvedRequests = await MaterialRequest.findAll({
    where: {
      status: 'aprovado',
      approvedAt: { [Op.lte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    include: [Technician],
    limit: 20,
  });
  for (const request of approvedRequests) {
    created.push(await createOnce(
      { type: 'estoque', status: 'nao_lida', title: `Separação pendente: ${request.requestNumber}` },
      {
        role: 'admin',
        type: 'estoque',
        severity: 'warning',
        title: `Separação pendente: ${request.requestNumber}`,
        message: `A solicitação de ${request.Technician?.name || 'técnico'} já foi aprovada, mas ainda não foi entregue.`,
        route: '/solicitacoes-material',
        metadata: { requestId: request.id, requestNumber: request.requestNumber },
      }
    ));
  }

  const totalValue = await SerializedAsset.sum('acquisitionCost', { where: { ownerType: 'tecnico' } });
  if (Number(totalValue || 0) > 0) {
    created.push(await createOnce(
      { type: 'dica', status: 'nao_lida', title: 'Dica de auditoria: patrimônio em campo' },
      {
        role: 'supervisor',
        type: 'dica',
        severity: 'success',
        title: 'Dica de auditoria: patrimônio em campo',
        message: `Há ${money(totalValue)} em equipamentos sob responsabilidade de técnicos. Use o BI de técnicos para priorizar conferências.`,
        route: '/bi/tecnicos',
        metadata: { totalValue: money(totalValue) },
      }
    ));
  }

  return created;
}

function startAutoIntelligence(minutes) {
  if (!minutes || minutes <= 0) return;
  const interval = Math.max(60, Number(minutes) * 60) * 1000;
  setInterval(() => {
    generateSmartNotifications().catch((error) => console.error('Erro na inteligência automática:', error.message));
  }, interval);
  console.log(`🔔 Inteligência automática ativa a cada ${minutes} minuto(s).`);
}

module.exports = { generateSmartNotifications, startAutoIntelligence };
