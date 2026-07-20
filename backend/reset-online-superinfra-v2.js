require('dotenv').config();

const bcrypt = require('bcryptjs');
const sequelize = require('./config/db');

const {
  User,
  Technician,
  Material,
  SerializedAsset,
  StockBalance,
  StockMovement,
  Transfer,
  TransferItem,
  StockBatch,
  StockBatchItem,
  Warehouse,
} = require('./app/models');

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function resetTables(transaction) {
  const tablesToClear = [
    'material_request_items',
    'material_requests',
    'approval_requests',
    'notifications',
    'tasks',
    'service_order_materials',
    'service_orders',
    'transfer_items',
    'transfers',
    'stock_movements',
    'stock_batch_items',
    'stock_batches',
    'serialized_assets',
    'stock_balances',
    'audit_logs',
    'users',
    'technicians',
    'contractor_companies',
    'materials',
    'warehouses',
  ];

  const existingRaw = await sequelize.getQueryInterface().showAllTables();
  const existing = existingRaw.map((item) =>
    typeof item === 'string' ? item : item.tableName
  );

  const presentTables = tablesToClear.filter((table) => existing.includes(table));

  if (!presentTables.length) {
    console.log('Nenhuma tabela encontrada para limpar.');
    return;
  }

  await sequelize.query(
    `TRUNCATE TABLE ${presentTables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE;`,
    { transaction }
  );

  console.log('Tabelas apagadas:', presentTables.join(', '));
}

async function createUser(data, transaction) {
  return User.create({
    name: data.name,
    email: String(data.email).toLowerCase(),
    passwordHash: await bcrypt.hash(data.password, 10),
    role: data.role,
    status: 'ativo',
    technicianId: data.technicianId || null,
    warehouseIds: data.warehouseIds || [],
    cityAccess: data.cityAccess || [],
    approvalLimit: data.approvalLimit || 0,
    mustChangePassword: false,
    passwordChangedAt: new Date(),
  }, { transaction });
}

async function createMaterial(data, transaction) {
  return Material.create({
    active: true,
    minStock: 0,
    maxStock: 0,
    reorderPoint: 0,
    allowTechnicianTransfer: true,
    allowCustomerInstall: true,
    ...data,
  }, { transaction });
}

async function createBalance(data, transaction) {
  return StockBalance.create({
    materialId: data.material.id,
    ownerType: data.ownerType,
    quantity: data.quantity,
    technicianId: data.technicianId || null,
    warehouseId: data.warehouseId || null,
  }, { transaction });
}

async function createAssetForTechnician(data, transaction) {
  return SerializedAsset.create({
    materialId: data.material.id,
    serialNumber: data.serialNumber,
    ownerType: 'tecnico',
    status: 'com_tecnico',
    technicianId: data.technician.id,
    warehouseId: null,
    acquisitionCost: data.unitCost || data.material.unitCost || 0,
    custodyStartedAt: new Date(),
    lastMovementAt: new Date(),
    notes: `Carga inicial online para ${data.technician.name}.`,
  }, { transaction });
}

async function main() {
  if (process.env.CONFIRM_RESET !== 'APAGAR') {
    throw new Error('Proteção ativa. Rode primeiro: $env:CONFIRM_RESET="APAGAR"');
  }

  await sequelize.authenticate();
  console.log('Conectado ao banco Neon.');

  await sequelize.transaction(async (transaction) => {
    await resetTables(transaction);

    const warehouse = await Warehouse.create({
      name: 'Estoque Central Super Infra',
      code: 'SUPER-JOINVILLE',
      region: 'Norte SC',
      city: 'Joinville',
      state: 'SC',
      responsibleName: 'Almoxarifado Super Infra',
      status: 'ativo',
      approvalLimit: 500,
      notes: 'Estoque principal da implantação online.',
    }, { transaction });

    const admin = await createUser({
      name: 'Administrador Super Infra',
      email: 'admin@superinfra.local',
      password: 'Admin@123',
      role: 'admin',
      warehouseIds: [warehouse.id],
      cityAccess: ['Joinville', 'Araquari'],
      approvalLimit: 999999,
    }, transaction);

    await createUser({
      name: 'Estoquista Super Infra',
      email: 'estoque@superinfra.local',
      password: 'Estoque@123',
      role: 'estoquista',
      warehouseIds: [warehouse.id],
      cityAccess: ['Joinville', 'Araquari'],
      approvalLimit: 500,
    }, transaction);

    const bruno = await Technician.create({
      name: 'Bruno Lima',
      email: 'bruno@superinfra.local',
      phone: '(47) 99999-0001',
      type: 'interno',
      status: 'ativo',
      serviceCities: ['Joinville', 'Araquari'],
      defaultWarehouseId: warehouse.id,
      notes: 'Técnico criado para validação online da caixa.',
    }, { transaction });

    await createUser({
      name: 'Bruno Lima',
      email: 'bruno@superinfra.local',
      password: 'Bruno@123',
      role: 'tecnico',
      technicianId: bruno.id,
      warehouseIds: [warehouse.id],
      cityAccess: ['Joinville', 'Araquari'],
    }, transaction);

    const carlos = await Technician.create({
      name: 'Carlos Souza',
      email: 'carlos@superinfra.local',
      phone: '(47) 99999-0002',
      type: 'interno',
      status: 'ativo',
      serviceCities: ['Joinville'],
      defaultWarehouseId: warehouse.id,
      notes: 'Segundo técnico para teste de usuários.',
    }, { transaction });

    await createUser({
      name: 'Carlos Souza',
      email: 'carlos@superinfra.local',
      password: 'Carlos@123',
      role: 'tecnico',
      technicianId: carlos.id,
      warehouseIds: [warehouse.id],
      cityAccess: ['Joinville'],
    }, transaction);

    const onu = await createMaterial({
      sku: 'ONU-GPON-SUPER',
      name: 'ONU GPON',
      category: 'onu',
      unit: 'un',
      requiresSerial: true,
      unitCost: 120,
      commercialName: 'ONU GPON Super Infra',
      brand: 'Super Infra',
      model: 'GPON-1GE',
    }, transaction);

    const roteador = await createMaterial({
      sku: 'ROTEADOR-WIFI-SUPER',
      name: 'Roteador Wi-Fi',
      category: 'roteador',
      unit: 'un',
      requiresSerial: true,
      unitCost: 180,
      commercialName: 'Roteador Wi-Fi Super Infra',
      brand: 'Super Infra',
      model: 'Wi-Fi 5',
    }, transaction);

    const cabo = await createMaterial({
      sku: 'CABO-DROP-FTTH',
      name: 'Cabo Drop FTTH',
      category: 'drop',
      unit: 'm',
      requiresSerial: false,
      unitCost: 1.35,
      commercialName: 'Cabo Drop FTTH',
    }, transaction);

    const conector = await createMaterial({
      sku: 'CONECTOR-APC',
      name: 'Conector APC',
      category: 'conector',
      unit: 'un',
      requiresSerial: false,
      unitCost: 2.5,
      commercialName: 'Conector APC',
    }, transaction);

    const esticador = await createMaterial({
      sku: 'ESTICADOR-DROP',
      name: 'Esticador Drop',
      category: 'esticador',
      unit: 'un',
      requiresSerial: false,
      unitCost: 3,
      commercialName: 'Esticador Drop',
    }, transaction);

    const batch = await StockBatch.create({
      receiptNumber: 'NF-SUPER-ONLINE-001',
      sourceCompany: 'Super Infra',
      receivedAt: new Date(),
      cycle: 'extra',
      status: 'confirmado',
      fiscalDocumentType: 'nota_fiscal',
      fiscalDocumentNumber: 'NF-ONLINE-001',
      fiscalIssuer: 'Super Infra',
      receivedByName: 'Administrador Super Infra',
      conferenceStatus: 'conferido',
      warehouseLocation: 'Estoque Central',
      warehouseId: warehouse.id,
      totalItems: 1195,
      totalValue: money((12 * 120) + (8 * 180) + (1000 * 1.35) + (120 * 2.5) + (55 * 3)),
      notes: 'Carga inicial online após limpeza dos dados de teste.',
      createdById: admin.id,
    }, { transaction });

    await StockBatchItem.bulkCreate([
      {
        batchId: batch.id,
        materialId: onu.id,
        quantity: 12,
        unitCost: 120,
        totalCost: 1440,
        serialNumbers: [
          'ONU-BRUNO-001',
          'ONU-BRUNO-002',
          'ONU-BRUNO-003',
          'ONU-CARLOS-001',
          'ONU-ESTOQUE-001',
          'ONU-ESTOQUE-002'
        ],
        warehouseId: warehouse.id,
      },
      {
        batchId: batch.id,
        materialId: roteador.id,
        quantity: 8,
        unitCost: 180,
        totalCost: 1440,
        serialNumbers: [
          'ROT-BRUNO-001',
          'ROT-CARLOS-001',
          'ROT-ESTOQUE-001'
        ],
        warehouseId: warehouse.id,
      },
      {
        batchId: batch.id,
        materialId: cabo.id,
        quantity: 1000,
        unitCost: 1.35,
        totalCost: 1350,
        warehouseId: warehouse.id,
      },
      {
        batchId: batch.id,
        materialId: conector.id,
        quantity: 120,
        unitCost: 2.5,
        totalCost: 300,
        warehouseId: warehouse.id,
      },
      {
        batchId: batch.id,
        materialId: esticador.id,
        quantity: 55,
        unitCost: 3,
        totalCost: 165,
        warehouseId: warehouse.id,
      },
    ], { transaction });

    await createBalance({ material: cabo, ownerType: 'estoque', quantity: 650, warehouseId: warehouse.id }, transaction);
    await createBalance({ material: conector, ownerType: 'estoque', quantity: 85, warehouseId: warehouse.id }, transaction);
    await createBalance({ material: esticador, ownerType: 'estoque', quantity: 40, warehouseId: warehouse.id }, transaction);

    await createBalance({ material: cabo, ownerType: 'tecnico', technicianId: bruno.id, quantity: 200 }, transaction);
    await createBalance({ material: conector, ownerType: 'tecnico', technicianId: bruno.id, quantity: 20 }, transaction);
    await createBalance({ material: esticador, ownerType: 'tecnico', technicianId: bruno.id, quantity: 10 }, transaction);

    await createBalance({ material: cabo, ownerType: 'tecnico', technicianId: carlos.id, quantity: 150 }, transaction);
    await createBalance({ material: conector, ownerType: 'tecnico', technicianId: carlos.id, quantity: 15 }, transaction);
    await createBalance({ material: esticador, ownerType: 'tecnico', technicianId: carlos.id, quantity: 5 }, transaction);

    const brunoAssets = [];
    for (const serialNumber of ['ONU-BRUNO-001', 'ONU-BRUNO-002', 'ONU-BRUNO-003']) {
      brunoAssets.push(await createAssetForTechnician({ material: onu, serialNumber, technician: bruno, unitCost: 120 }, transaction));
    }

    brunoAssets.push(await createAssetForTechnician({
      material: roteador,
      serialNumber: 'ROT-BRUNO-001',
      technician: bruno,
      unitCost: 180,
    }, transaction));

    const carlosAssets = [];
    carlosAssets.push(await createAssetForTechnician({
      material: onu,
      serialNumber: 'ONU-CARLOS-001',
      technician: carlos,
      unitCost: 120,
    }, transaction));

    carlosAssets.push(await createAssetForTechnician({
      material: roteador,
      serialNumber: 'ROT-CARLOS-001',
      technician: carlos,
      unitCost: 180,
    }, transaction));

    const transfers = [
      {
        technician: bruno,
        number: 'TR-SUPER-BRUNO-001',
        assets: brunoAssets,
        consumables: [
          { material: cabo, quantity: 200 },
          { material: conector, quantity: 20 },
          { material: esticador, quantity: 10 },
        ],
      },
      {
        technician: carlos,
        number: 'TR-SUPER-CARLOS-001',
        assets: carlosAssets,
        consumables: [
          { material: cabo, quantity: 150 },
          { material: conector, quantity: 15 },
          { material: esticador, quantity: 5 },
        ],
      },
    ];

    for (const transferData of transfers) {
      const totalConsumables = transferData.consumables.reduce((sum, item) => {
        return sum + Number(item.quantity || 0);
      }, 0);

      const transfer = await Transfer.create({
        transferNumber: transferData.number,
        status: 'pendente_assinatura',
        deliveredAt: new Date(),
        technicianId: transferData.technician.id,
        createdById: admin.id,
        warehouseId: warehouse.id,
        totalQuantity: transferData.assets.length + totalConsumables,
        totalValue: 0,
        notes: `Carga inicial entregue ao técnico ${transferData.technician.name}.`,
        stampText: 'SUPER INFRA - Conferido e entregue ao técnico.',
      }, { transaction });

      for (const asset of transferData.assets) {
        await TransferItem.create({
          transferId: transfer.id,
          materialId: asset.materialId,
          assetId: asset.id,
          quantity: 1,
          serialNumber: asset.serialNumber,
          unitCost: asset.acquisitionCost,
          totalCost: asset.acquisitionCost,
        }, { transaction });

        await StockMovement.create({
          type: 'transferencia_tecnico',
          materialId: asset.materialId,
          assetId: asset.id,
          quantity: 1,
          serialNumber: asset.serialNumber,
          fromOwnerType: 'estoque',
          toOwnerType: 'tecnico',
          fromWarehouseId: warehouse.id,
          toTechnicianId: transferData.technician.id,
          reference: transferData.number,
          notes: `Carga inicial: ${asset.serialNumber} transferido para ${transferData.technician.name}.`,
          createdById: admin.id,
        }, { transaction });
      }

      for (const item of transferData.consumables) {
        await TransferItem.create({
          transferId: transfer.id,
          materialId: item.material.id,
          quantity: item.quantity,
          unitCost: item.material.unitCost,
          totalCost: money(item.quantity * item.material.unitCost),
        }, { transaction });

        await StockMovement.create({
          type: 'transferencia_tecnico',
          materialId: item.material.id,
          quantity: item.quantity,
          fromOwnerType: 'estoque',
          toOwnerType: 'tecnico',
          fromWarehouseId: warehouse.id,
          toTechnicianId: transferData.technician.id,
          reference: transferData.number,
          notes: `Carga inicial: ${item.quantity} ${item.material.unit} de ${item.material.name} para ${transferData.technician.name}.`,
          createdById: admin.id,
        }, { transaction });
      }
    }

    console.log('');
    console.log('Base online limpa e recriada com sucesso.');
    console.log('');
    console.log('Usuários criados:');
    console.log('Admin: admin@superinfra.local / Admin@123');
    console.log('Estoquista: estoque@superinfra.local / Estoque@123');
    console.log('Técnico Bruno: bruno@superinfra.local / Bruno@123');
    console.log('Técnico Carlos: carlos@superinfra.local / Carlos@123');
    console.log('');
  });

  const brunoTech = await Technician.findOne({ where: { email: 'bruno@superinfra.local' } });
  const carlosTech = await Technician.findOne({ where: { email: 'carlos@superinfra.local' } });

  const brunoAssetsCount = await SerializedAsset.count({
    where: { ownerType: 'tecnico', technicianId: brunoTech.id },
  });

  const carlosAssetsCount = await SerializedAsset.count({
    where: { ownerType: 'tecnico', technicianId: carlosTech.id },
  });

  const brunoBalances = await StockBalance.findAll({
    where: { ownerType: 'tecnico', technicianId: brunoTech.id },
    include: [Material],
  });

  const carlosBalances = await StockBalance.findAll({
    where: { ownerType: 'tecnico', technicianId: carlosTech.id },
    include: [Material],
  });

  console.log('Validação final:');
  console.log('Bruno - seriais:', brunoAssetsCount);
  console.log('Bruno - consumíveis:', brunoBalances.map((b) => `${b.Material.name}: ${b.quantity}`).join(' | '));
  console.log('Carlos - seriais:', carlosAssetsCount);
  console.log('Carlos - consumíveis:', carlosBalances.map((b) => `${b.Material.name}: ${b.quantity}`).join(' | '));
}

main()
  .catch((error) => {
    console.error('Erro:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
