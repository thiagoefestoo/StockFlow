const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const sequelize = require('../config/db');

const {
  User,
  ContractorCompany,
  Technician,
  Material,
  SerializedAsset,
  StockBalance,
  StockBatch,
  StockBatchItem,
  StockMovement,
  Transfer,
  TransferItem,
  ServiceOrder,
  ServiceOrderMaterial,
  AuditLog,
  Notification,
  Task,
} = require('../app/models');

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function resetDemoData() {
  const demoOrders = await ServiceOrder.findAll({
    where: { osNumber: { [Op.like]: 'DEMO-OS-%' } },
    attributes: ['id'],
  });

  const demoTransfers = await Transfer.findAll({
    where: { transferNumber: { [Op.like]: 'DEMO-GUIA-%' } },
    attributes: ['id'],
  });

  const demoBatches = await StockBatch.findAll({
    where: { receiptNumber: { [Op.like]: 'DEMO-ENTRADA-%' } },
    attributes: ['id'],
  });

  const demoMaterials = await Material.findAll({
    where: { sku: { [Op.like]: 'DEMO-%' } },
    attributes: ['id'],
  });

  const demoTechnicians = await Technician.findAll({
    where: {
      [Op.or]: [
        { document: { [Op.like]: 'DEMO-%' } },
        { email: { [Op.like]: '%.demo@telecomstock.local' } },
      ],
    },
    attributes: ['id'],
  });

  const orderIds = demoOrders.map((item) => item.id);
  const transferIds = demoTransfers.map((item) => item.id);
  const batchIds = demoBatches.map((item) => item.id);
  const materialIds = demoMaterials.map((item) => item.id);
  const technicianIds = demoTechnicians.map((item) => item.id);

  await ServiceOrderMaterial.destroy({ where: orderIds.length ? { serviceOrderId: orderIds } : { id: -1 } });
  await ServiceOrder.destroy({ where: { osNumber: { [Op.like]: 'DEMO-OS-%' } } });

  await TransferItem.destroy({ where: transferIds.length ? { transferId: transferIds } : { id: -1 } });
  await Transfer.destroy({ where: { transferNumber: { [Op.like]: 'DEMO-GUIA-%' } } });

  await StockBatchItem.destroy({ where: batchIds.length ? { batchId: batchIds } : { id: -1 } });
  await StockBatch.destroy({ where: { receiptNumber: { [Op.like]: 'DEMO-ENTRADA-%' } } });

  await StockMovement.destroy({
    where: {
      [Op.or]: [
        { reference: { [Op.like]: 'DEMO-%' } },
        { serialNumber: { [Op.like]: 'DEMO-%' } },
      ],
    },
  });

  await StockBalance.destroy({
    where: {
      [Op.or]: [
        materialIds.length ? { materialId: materialIds } : { id: -1 },
        technicianIds.length ? { technicianId: technicianIds } : { id: -1 },
      ],
    },
  });

  await SerializedAsset.destroy({ where: { serialNumber: { [Op.like]: 'DEMO-%' } } });
  await Notification.destroy({ where: { title: { [Op.like]: 'DEMO%' } } });
  await Task.destroy({ where: { title: { [Op.like]: 'DEMO%' } } });
  await AuditLog.destroy({ where: { message: { [Op.like]: '%DEMO%' } } });

  await User.destroy({
    where: {
      email: {
        [Op.in]: [
          'supervisor.demo@telecomstock.local',
          'ana.demo@telecomstock.local',
          'bruno.demo@telecomstock.local',
        ],
      },
    },
  });

  await Technician.destroy({
    where: {
      [Op.or]: [
        { document: { [Op.like]: 'DEMO-%' } },
        { email: { [Op.like]: '%.demo@telecomstock.local' } },
      ],
    },
  });

  await ContractorCompany.destroy({ where: { document: { [Op.like]: 'DEMO-%' } } });
  await Material.destroy({ where: { sku: { [Op.like]: 'DEMO-%' } } });
}

async function main() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  await resetDemoData();

  const passwordHash = await bcrypt.hash('admin123', 10);

  const [admin] = await User.findOrCreate({
    where: { email: 'admin@local.com' },
    defaults: {
      name: 'Administrador',
      email: 'admin@local.com',
      passwordHash,
      role: 'admin',
      status: 'ativo',
    },
  });

  const supervisor = await User.create({
    name: 'Supervisor Demo',
    email: 'supervisor.demo@telecomstock.local',
    passwordHash,
    role: 'supervisor',
    status: 'ativo',
  });

  const company = await ContractorCompany.create({
    name: 'DEMO Fibra Serviços Telecom',
    document: 'DEMO-12.345.678/0001-90',
    contactName: 'Marcos Oliveira',
    phone: '(47) 99999-1000',
    email: 'operacao.demo@telecomstock.local',
    city: 'Joinville',
    status: 'ativa',
    notes: 'Empresa criada para estudo do sistema.',
  });

  const ana = await Technician.create({
    name: 'Ana Souza',
    document: 'DEMO-TEC-001',
    phone: '(47) 99999-2001',
    email: 'ana.demo@telecomstock.local',
    type: 'terceirizado',
    status: 'ativo',
    vehiclePlate: 'ABC1D23',
    companyId: company.id,
    notes: 'Técnica com carga ativa e OS concluída.',
  });

  const bruno = await Technician.create({
    name: 'Bruno Lima',
    document: 'DEMO-TEC-002',
    phone: '(47) 99999-2002',
    email: 'bruno.demo@telecomstock.local',
    type: 'terceirizado',
    status: 'ativo',
    vehiclePlate: 'DEF4G56',
    companyId: company.id,
    notes: 'Técnico com guia pendente de assinatura.',
  });

  await User.create({
    name: 'Ana Souza',
    email: 'ana.demo@telecomstock.local',
    passwordHash,
    role: 'tecnico',
    status: 'ativo',
    technicianId: ana.id,
  });

  await User.create({
    name: 'Bruno Lima',
    email: 'bruno.demo@telecomstock.local',
    passwordHash,
    role: 'tecnico',
    status: 'ativo',
    technicianId: bruno.id,
  });

  const onu = await Material.create({
    sku: 'DEMO-ONU-GPON',
    name: 'ONU GPON Wi-Fi AC',
    category: 'onu',
    unit: 'un',
    requiresSerial: true,
    unitCost: 185.9,
    minStock: 2,
    active: true,
  });

  const roteador = await Material.create({
    sku: 'DEMO-ROTEADOR',
    name: 'Roteador Wi-Fi 5',
    category: 'roteador',
    unit: 'un',
    requiresSerial: true,
    unitCost: 129.9,
    minStock: 1,
    active: true,
  });

  const drop = await Material.create({
    sku: 'DEMO-DROP',
    name: 'Cabo Drop 1FO',
    category: 'drop',
    unit: 'm',
    requiresSerial: false,
    unitCost: 0.75,
    minStock: 80,
    active: true,
  });

  const conector = await Material.create({
    sku: 'DEMO-CONECTOR-SC',
    name: 'Conector SC/APC',
    category: 'conector',
    unit: 'un',
    requiresSerial: false,
    unitCost: 2.5,
    minStock: 20,
    active: true,
  });

  const esticador = await Material.create({
    sku: 'DEMO-ESTICADOR',
    name: 'Esticador para Drop',
    category: 'esticador',
    unit: 'un',
    requiresSerial: false,
    unitCost: 1.8,
    minStock: 10,
    active: true,
  });

  const batch = await StockBatch.create({
    receiptNumber: 'DEMO-ENTRADA-001',
    sourceCompany: 'Companhia Telecom Parceira',
    receivedAt: new Date().toISOString().slice(0, 10),
    cycle: 'quinzenal',
    status: 'confirmado',
    totalItems: 388,
    totalValue: 1517.6,
    notes: 'Entrada quinzenal de demonstração.',
    createdById: admin.id,
  });

  const onuSerials = ['DEMO-ONU-0001', 'DEMO-ONU-0002', 'DEMO-ONU-0003', 'DEMO-ONU-0004', 'DEMO-ONU-0005', 'DEMO-ONU-0006'];
  const routerSerials = ['DEMO-ROT-0001', 'DEMO-ROT-0002'];

  await StockBatchItem.bulkCreate([
    {
      batchId: batch.id,
      materialId: onu.id,
      quantity: 6,
      unitCost: 185.9,
      totalCost: 1115.4,
      serialNumbers: onuSerials,
    },
    {
      batchId: batch.id,
      materialId: roteador.id,
      quantity: 2,
      unitCost: 129.9,
      totalCost: 259.8,
      serialNumbers: routerSerials,
    },
    {
      batchId: batch.id,
      materialId: drop.id,
      quantity: 300,
      unitCost: 0.75,
      totalCost: 225,
      serialNumbers: [],
    },
    {
      batchId: batch.id,
      materialId: conector.id,
      quantity: 50,
      unitCost: 2.5,
      totalCost: 125,
      serialNumbers: [],
    },
    {
      batchId: batch.id,
      materialId: esticador.id,
      quantity: 30,
      unitCost: 1.8,
      totalCost: 54,
      serialNumbers: [],
    },
  ]);

  const createdAssets = [];

  for (const serialNumber of onuSerials) {
    const asset = await SerializedAsset.create({
      materialId: onu.id,
      serialNumber,
      mac: `AA:BB:CC:00:00:${serialNumber.slice(-2)}`,
      brand: 'FiberHome',
      model: 'HG6145D2',
      status: 'em_estoque',
      ownerType: 'estoque',
      acquisitionCost: 185.9,
      lastMovementAt: new Date(),
      notes: 'Patrimônio serializado de demonstração.',
    });
    createdAssets.push(asset);
  }

  for (const serialNumber of routerSerials) {
    const asset = await SerializedAsset.create({
      materialId: roteador.id,
      serialNumber,
      mac: `DD:EE:FF:00:00:${serialNumber.slice(-2)}`,
      brand: 'TP-Link',
      model: 'Archer C5',
      status: 'em_estoque',
      ownerType: 'estoque',
      acquisitionCost: 129.9,
      lastMovementAt: new Date(),
      notes: 'Roteador serializado de demonstração.',
    });
    createdAssets.push(asset);
  }

  await StockBalance.bulkCreate([
    { materialId: drop.id, ownerType: 'estoque', technicianId: null, quantity: 160 },
    { materialId: conector.id, ownerType: 'estoque', technicianId: null, quantity: 40 },
    { materialId: esticador.id, ownerType: 'estoque', technicianId: null, quantity: 20 },

    { materialId: drop.id, ownerType: 'tecnico', technicianId: ana.id, quantity: 45 },
    { materialId: conector.id, ownerType: 'tecnico', technicianId: ana.id, quantity: 4 },
    { materialId: esticador.id, ownerType: 'tecnico', technicianId: ana.id, quantity: 4 },

    { materialId: drop.id, ownerType: 'tecnico', technicianId: bruno.id, quantity: 60 },
    { materialId: conector.id, ownerType: 'tecnico', technicianId: bruno.id, quantity: 4 },
    { materialId: esticador.id, ownerType: 'tecnico', technicianId: bruno.id, quantity: 4 },
  ]);

  for (const asset of createdAssets) {
    await StockMovement.create({
      type: 'entrada',
      materialId: asset.materialId,
      assetId: asset.id,
      quantity: 1,
      serialNumber: asset.serialNumber,
      toOwnerType: 'estoque',
      reference: 'DEMO-ENTRADA-001',
      notes: 'Entrada de patrimônio DEMO.',
      createdById: admin.id,
      movementAt: daysAgo(15),
    });
  }

  for (const item of [
    { materialId: drop.id, quantity: 300 },
    { materialId: conector.id, quantity: 50 },
    { materialId: esticador.id, quantity: 30 },
  ]) {
    await StockMovement.create({
      type: 'entrada',
      materialId: item.materialId,
      quantity: item.quantity,
      toOwnerType: 'estoque',
      reference: 'DEMO-ENTRADA-001',
      notes: 'Entrada de material não serializado DEMO.',
      createdById: admin.id,
      movementAt: daysAgo(15),
    });
  }

  const assetOnu1 = await SerializedAsset.findOne({ where: { serialNumber: 'DEMO-ONU-0001' } });
  const assetOnu2 = await SerializedAsset.findOne({ where: { serialNumber: 'DEMO-ONU-0002' } });
  const assetOnu3 = await SerializedAsset.findOne({ where: { serialNumber: 'DEMO-ONU-0003' } });
  const assetRot1 = await SerializedAsset.findOne({ where: { serialNumber: 'DEMO-ROT-0001' } });

  assetOnu1.ownerType = 'cliente';
  assetOnu1.status = 'instalado';
  assetOnu1.technicianId = ana.id;
  assetOnu1.custodyStartedAt = daysAgo(10);
  assetOnu1.installedAt = daysAgo(2);
  assetOnu1.customerName = 'Cliente Demo Instalado';
  assetOnu1.customerCpf = '12345678900';
  assetOnu1.lastMovementAt = daysAgo(2);
  await assetOnu1.save();

  assetOnu2.ownerType = 'tecnico';
  assetOnu2.status = 'com_tecnico';
  assetOnu2.technicianId = ana.id;
  assetOnu2.custodyStartedAt = daysAgo(10);
  assetOnu2.lastMovementAt = daysAgo(10);
  await assetOnu2.save();

  assetOnu3.ownerType = 'tecnico';
  assetOnu3.status = 'com_tecnico';
  assetOnu3.technicianId = bruno.id;
  assetOnu3.custodyStartedAt = daysAgo(35);
  assetOnu3.lastMovementAt = daysAgo(35);
  await assetOnu3.save();

  assetRot1.ownerType = 'tecnico';
  assetRot1.status = 'com_tecnico';
  assetRot1.technicianId = bruno.id;
  assetRot1.custodyStartedAt = daysAgo(35);
  assetRot1.lastMovementAt = daysAgo(35);
  await assetRot1.save();

  const guiaAna = await Transfer.create({
    transferNumber: 'DEMO-GUIA-001',
    technicianId: ana.id,
    status: 'assinado',
    deliveredAt: daysAgo(10),
    signedAt: daysAgo(9),
    totalQuantity: 94,
    totalValue: 452.9,
    signatureResponsible: 'Ana Souza',
    attachmentName: 'guia-demo-ana.pdf',
    notes: 'Guia DEMO assinada para estudo.',
    createdById: admin.id,
  });

  await TransferItem.bulkCreate([
    { transferId: guiaAna.id, materialId: onu.id, assetId: assetOnu1.id, quantity: 1, unitCost: 185.9, totalCost: 185.9, serialNumber: 'DEMO-ONU-0001' },
    { transferId: guiaAna.id, materialId: onu.id, assetId: assetOnu2.id, quantity: 1, unitCost: 185.9, totalCost: 185.9, serialNumber: 'DEMO-ONU-0002' },
    { transferId: guiaAna.id, materialId: drop.id, quantity: 80, unitCost: 0.75, totalCost: 60 },
    { transferId: guiaAna.id, materialId: conector.id, quantity: 6, unitCost: 2.5, totalCost: 15 },
    { transferId: guiaAna.id, materialId: esticador.id, quantity: 6, unitCost: 1.8, totalCost: 10.8 },
  ]);

  const guiaBruno = await Transfer.create({
    transferNumber: 'DEMO-GUIA-002',
    technicianId: bruno.id,
    status: 'pendente_assinatura',
    deliveredAt: daysAgo(35),
    totalQuantity: 70,
    totalValue: 390.5,
    notes: 'Guia DEMO pendente para testar alertas.',
    createdById: admin.id,
  });

  await TransferItem.bulkCreate([
    { transferId: guiaBruno.id, materialId: onu.id, assetId: assetOnu3.id, quantity: 1, unitCost: 185.9, totalCost: 185.9, serialNumber: 'DEMO-ONU-0003' },
    { transferId: guiaBruno.id, materialId: roteador.id, assetId: assetRot1.id, quantity: 1, unitCost: 129.9, totalCost: 129.9, serialNumber: 'DEMO-ROT-0001' },
    { transferId: guiaBruno.id, materialId: drop.id, quantity: 60, unitCost: 0.75, totalCost: 45 },
    { transferId: guiaBruno.id, materialId: conector.id, quantity: 4, unitCost: 2.5, totalCost: 10 },
    { transferId: guiaBruno.id, materialId: esticador.id, quantity: 4, unitCost: 1.8, totalCost: 7.2 },
  ]);

  for (const movement of [
    { type: 'transferencia_tecnico', materialId: onu.id, assetId: assetOnu1.id, serialNumber: 'DEMO-ONU-0001', quantity: 1, technicianId: ana.id, reference: 'DEMO-GUIA-001', movementAt: daysAgo(10) },
    { type: 'transferencia_tecnico', materialId: onu.id, assetId: assetOnu2.id, serialNumber: 'DEMO-ONU-0002', quantity: 1, technicianId: ana.id, reference: 'DEMO-GUIA-001', movementAt: daysAgo(10) },
    { type: 'transferencia_tecnico', materialId: onu.id, assetId: assetOnu3.id, serialNumber: 'DEMO-ONU-0003', quantity: 1, technicianId: bruno.id, reference: 'DEMO-GUIA-002', movementAt: daysAgo(35) },
    { type: 'transferencia_tecnico', materialId: roteador.id, assetId: assetRot1.id, serialNumber: 'DEMO-ROT-0001', quantity: 1, technicianId: bruno.id, reference: 'DEMO-GUIA-002', movementAt: daysAgo(35) },
    { type: 'transferencia_tecnico', materialId: drop.id, quantity: 80, technicianId: ana.id, reference: 'DEMO-GUIA-001', movementAt: daysAgo(10) },
    { type: 'transferencia_tecnico', materialId: conector.id, quantity: 6, technicianId: ana.id, reference: 'DEMO-GUIA-001', movementAt: daysAgo(10) },
    { type: 'transferencia_tecnico', materialId: esticador.id, quantity: 6, technicianId: ana.id, reference: 'DEMO-GUIA-001', movementAt: daysAgo(10) },
    { type: 'transferencia_tecnico', materialId: drop.id, quantity: 60, technicianId: bruno.id, reference: 'DEMO-GUIA-002', movementAt: daysAgo(35) },
    { type: 'transferencia_tecnico', materialId: conector.id, quantity: 4, technicianId: bruno.id, reference: 'DEMO-GUIA-002', movementAt: daysAgo(35) },
    { type: 'transferencia_tecnico', materialId: esticador.id, quantity: 4, technicianId: bruno.id, reference: 'DEMO-GUIA-002', movementAt: daysAgo(35) },
  ]) {
    await StockMovement.create({
      type: movement.type,
      materialId: movement.materialId,
      assetId: movement.assetId || null,
      quantity: movement.quantity,
      serialNumber: movement.serialNumber || null,
      fromOwnerType: 'estoque',
      toOwnerType: 'tecnico',
      toTechnicianId: movement.technicianId,
      reference: movement.reference,
      notes: 'Transferência DEMO para técnico.',
      createdById: admin.id,
      movementAt: movement.movementAt,
    });
  }

  const os1 = await ServiceOrder.create({
    osNumber: 'DEMO-OS-1001',
    technicianId: ana.id,
    customerName: 'Cliente Demo Instalado',
    customerCpf: '12345678900',
    customerAddress: 'Rua das Flores, 100',
    city: 'Joinville',
    serviceType: 'instalacao',
    status: 'concluida',
    completedAt: daysAgo(2),
    notes: 'OS DEMO concluída com baixa de ONU, drop, conectores e esticadores.',
    createdById: admin.id,
  });

  await ServiceOrderMaterial.bulkCreate([
    { serviceOrderId: os1.id, materialId: onu.id, assetId: assetOnu1.id, quantity: 1, serialNumber: 'DEMO-ONU-0001', unitCost: 185.9, totalCost: 185.9 },
    { serviceOrderId: os1.id, materialId: drop.id, quantity: 35, unitCost: 0.75, totalCost: 26.25 },
    { serviceOrderId: os1.id, materialId: conector.id, quantity: 2, unitCost: 2.5, totalCost: 5 },
    { serviceOrderId: os1.id, materialId: esticador.id, quantity: 2, unitCost: 1.8, totalCost: 3.6 },
  ]);

  for (const movement of [
    { materialId: onu.id, assetId: assetOnu1.id, serialNumber: 'DEMO-ONU-0001', quantity: 1 },
    { materialId: drop.id, quantity: 35 },
    { materialId: conector.id, quantity: 2 },
    { materialId: esticador.id, quantity: 2 },
  ]) {
    await StockMovement.create({
      type: 'baixa_os',
      materialId: movement.materialId,
      assetId: movement.assetId || null,
      quantity: movement.quantity,
      serialNumber: movement.serialNumber || null,
      fromOwnerType: 'tecnico',
      toOwnerType: 'cliente',
      fromTechnicianId: ana.id,
      reference: 'DEMO-OS-1001',
      notes: 'Baixa DEMO por OS.',
      createdById: admin.id,
      movementAt: daysAgo(2),
    });
  }

  await ServiceOrder.create({
    osNumber: 'DEMO-OS-1002',
    technicianId: bruno.id,
    customerName: 'Cliente Demo Pendente',
    customerCpf: '98765432100',
    customerAddress: 'Av. Brasil, 500',
    city: 'Joinville',
    serviceType: 'troca_onu',
    status: 'pendente',
    completedAt: null,
    notes: 'OS DEMO pendente para visualizar tarefas e atrasos.',
    createdById: supervisor.id,
  });

  await ServiceOrder.create({
    osNumber: 'DEMO-OS-1003',
    technicianId: ana.id,
    customerName: 'Cliente Demo Manutenção',
    customerCpf: '45678912300',
    customerAddress: 'Rua XV, 250',
    city: 'Araquari',
    serviceType: 'manutencao',
    status: 'aberta',
    completedAt: null,
    notes: 'OS DEMO aberta para testar o portal do técnico.',
    createdById: supervisor.id,
  });

  await Notification.bulkCreate([
    {
      userId: admin.id,
      role: 'admin',
      type: 'assinatura',
      severity: 'warning',
      title: 'DEMO Guia pendente de assinatura',
      message: 'A guia DEMO-GUIA-002 do técnico Bruno Lima ainda não foi assinada.',
      status: 'nao_lida',
      route: '/transfers',
      dueAt: daysAgo(1),
      metadata: { demo: true, transferNumber: 'DEMO-GUIA-002' },
    },
    {
      userId: admin.id,
      role: 'admin',
      type: 'estoque',
      severity: 'danger',
      title: 'DEMO Estoque baixo',
      message: 'O estoque de conectores e esticadores está próximo do mínimo configurado.',
      status: 'nao_lida',
      route: '/stock',
      metadata: { demo: true },
    },
    {
      role: 'todos',
      type: 'dica',
      severity: 'info',
      title: 'DEMO Dica operacional',
      message: 'Confira os materiais em carga antes de finalizar cada OS para evitar divergência patrimonial.',
      status: 'nao_lida',
      route: '/dashboard',
      metadata: { demo: true },
    },
  ]);

  await Task.bulkCreate([
    {
      title: 'DEMO Conferir assinatura da guia do Bruno',
      description: 'Validar se a guia DEMO-GUIA-002 foi assinada e anexada ao sistema.',
      priority: 'alta',
      status: 'aberta',
      dueAt: daysAgo(1),
      relatedEntity: 'Transfer',
      relatedEntityId: String(guiaBruno.id),
      assignedToId: supervisor.id,
      createdById: admin.id,
    },
    {
      title: 'DEMO Repor conectores SC/APC',
      description: 'Comprar ou solicitar novo lote de conectores para manter estoque mínimo.',
      priority: 'media',
      status: 'aberta',
      dueAt: daysAgo(-3),
      relatedEntity: 'Material',
      relatedEntityId: String(conector.id),
      assignedToId: supervisor.id,
      createdById: admin.id,
    },
  ]);

  await AuditLog.bulkCreate([
    {
      actorId: admin.id,
      action: 'seed',
      entity: 'Sistema',
      entityId: 'DEMO',
      message: 'Carga DEMO criada para estudo do TelecomStock.',
      afterData: {
        materiais: 5,
        tecnicos: 2,
        guias: 2,
        ordensServico: 3,
      },
    },
    {
      actorId: supervisor.id,
      action: 'consulta',
      entity: 'BI',
      entityId: 'DEMO',
      message: 'Registro DEMO para visualização da auditoria e histórico.',
    },
  ]);

  console.log('');
  console.log('✅ Dados DEMO criados com sucesso!');
  console.log('');
  console.log('Acesse o sistema e confira:');
  console.log('- Dashboard');
  console.log('- Estoque');
  console.log('- Materiais');
  console.log('- Técnicos');
  console.log('- Transferências/guias');
  console.log('- Ordens de serviço');
  console.log('- Notificações');
  console.log('- Tarefas');
  console.log('- Auditoria');
  console.log('- BI gerencial');
  console.log('');
  console.log('Logins úteis:');
  console.log('Admin:      admin@local.com / admin123');
  console.log('Supervisor: supervisor.demo@telecomstock.local / admin123');
  console.log('Técnico 1:  ana.demo@telecomstock.local / admin123');
  console.log('Técnico 2:  bruno.demo@telecomstock.local / admin123');
}

main()
  .catch((error) => {
    console.error('');
    console.error('❌ Erro ao criar dados DEMO:');
    console.error(error.message);
    console.error('');
    process.exit(1);
  })
  .finally(async () => {
    await sequelize.close();
  });
