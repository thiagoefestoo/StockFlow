const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

async function ensureNotificationSchema(queryInterface) {
  const notifications = await queryInterface.describeTable('notifications').catch(() => null);
  if (!notifications) return;

  if (!notifications.userId) {
    await queryInterface.addColumn('notifications', 'userId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    console.log('✅ Coluna notifications.userId criada para notificações individuais.');
  }

  try {
    const [rows] = await sequelize.query(`
      SELECT type_name.typname AS enum_name
      FROM pg_type type_name
      JOIN pg_enum enum_value ON type_name.oid = enum_value.enumtypid
      JOIN pg_attribute column_info ON column_info.atttypid = type_name.oid
      JOIN pg_class table_info ON table_info.oid = column_info.attrelid
      WHERE table_info.relname = 'notifications'
        AND column_info.attname = 'role'
      LIMIT 1
    `);
    const enumName = rows?.[0]?.enum_name;
    if (enumName) {
      const escapedEnumName = String(enumName).replace(/"/g, '""');
      await sequelize.query(`ALTER TYPE "${escapedEnumName}" ADD VALUE IF NOT EXISTS 'estoquista'`);
      console.log('✅ Perfil estoquista habilitado nas notificações.');
    }
  } catch (error) {
    console.warn('⚠️ Não foi possível atualizar o enum de notificações:', error.message);
  }
}

async function ensureTechnicianToolsSchema(queryInterface) {
  let tools = await queryInterface.describeTable('technician_tools').catch(() => null);

  if (!tools) {
    await queryInterface.createTable('technician_tools', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      technicianId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'technicians', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(160), allowNull: false },
      serialNumber: { type: DataTypes.STRING(140), allowNull: false },
      brand: { type: DataTypes.STRING(100), allowNull: true },
      referenceValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('com_tecnico', 'substituida', 'perdida', 'desgaste', 'devolvida'),
        allowNull: false,
        defaultValue: 'com_tecnico',
      },
      deliveredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      removedAt: { type: DataTypes.DATE, allowNull: true },
      removalReason: { type: DataTypes.TEXT, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      createdById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      removedById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('technician_tools', ['technicianId']);
    await queryInterface.addIndex('technician_tools', ['serialNumber']);
    console.log('✅ Tabela technician_tools criada para ficha e custódia de ferramentas.');
    tools = await queryInterface.describeTable('technician_tools').catch(() => null);
  }

  if (!tools) return;

  const missingColumns = [
    ['brand', { type: DataTypes.STRING(100), allowNull: true }],
    ['referenceValue', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }],
    ['deliveredAt', { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }],
    ['removedAt', { type: DataTypes.DATE, allowNull: true }],
    ['removalReason', { type: DataTypes.TEXT, allowNull: true }],
    ['notes', { type: DataTypes.TEXT, allowNull: true }],
    ['createdById', { type: DataTypes.INTEGER, allowNull: true }],
    ['removedById', { type: DataTypes.INTEGER, allowNull: true }],
  ];

  for (const [column, definition] of missingColumns) {
    if (!tools[column]) {
      await queryInterface.addColumn('technician_tools', column, definition);
      console.log(`✅ Coluna technician_tools.${column} criada.`);
    }
  }
}

async function ensureTransferItemLossSchema(queryInterface) {
  const transferItems = await queryInterface.describeTable('transfer_items').catch(() => null);
  if (!transferItems) return;

  const missingColumns = [
    ['itemType', { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'material' }],
    ['itemDescription', { type: DataTypes.STRING(200), allowNull: true }],
    ['technicianToolId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'technician_tools', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    }],
  ];

  for (const [column, definition] of missingColumns) {
    if (!transferItems[column]) {
      await queryInterface.addColumn('transfer_items', column, definition);
      console.log(`✅ Coluna transfer_items.${column} criada para perdas de ferramentas.`);
    }
  }
}


async function ensureTechnicianCompanySchema(queryInterface) {
  const technicians = await queryInterface.describeTable('technicians').catch(() => null);
  if (!technicians) return;

  if (!technicians.companyId) {
    await queryInterface.addColumn('technicians', 'companyId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'contractor_companies', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('technicians', ['companyId']).catch(() => null);
    console.log('✅ Coluna technicians.companyId criada para salvar a empresa do técnico.');
  }
}

async function ensureTechnicianToolDocumentsSchema(queryInterface) {
  let documents = await queryInterface.describeTable('technician_tool_documents').catch(() => null);

  if (!documents) {
    await queryInterface.createTable('technician_tool_documents', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      technicianId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'technicians', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      documentName: { type: DataTypes.STRING(255), allowNull: false },
      documentData: { type: DataTypes.TEXT('long'), allowNull: false },
      signedAt: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      toolCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      createdById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('technician_tool_documents', ['technicianId']);
    await queryInterface.addIndex('technician_tool_documents', ['createdAt']);
    console.log('✅ Tabela technician_tool_documents criada para termos assinados de ferramentas.');
    documents = await queryInterface.describeTable('technician_tool_documents').catch(() => null);
  }

  if (!documents) return;

  const missingColumns = [
    ['signedAt', { type: DataTypes.DATE, allowNull: true }],
    ['notes', { type: DataTypes.TEXT, allowNull: true }],
    ['toolCount', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
    ['totalValue', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }],
    ['createdById', { type: DataTypes.INTEGER, allowNull: true }],
  ];

  for (const [column, definition] of missingColumns) {
    if (!documents[column]) {
      await queryInterface.addColumn('technician_tool_documents', column, definition);
      console.log(`✅ Coluna technician_tool_documents.${column} criada.`);
    }
  }
}

async function ensureToolTransferSchema(queryInterface) {
  const transfers = await queryInterface.describeTable('transfers').catch(() => null);
  if (!transfers) return;

  if (!transfers.transferType) {
    await queryInterface.addColumn('transfers', 'transferType', {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'material',
    });
    console.log('✅ Coluna transfers.transferType criada para identificar transferência de ferramentas.');
  }

  if (!transfers.fromTechnicianId) {
    await queryInterface.addColumn('transfers', 'fromTechnicianId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'technicians', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('transfers', ['fromTechnicianId']).catch(() => null);
    console.log('✅ Coluna transfers.fromTechnicianId criada para origem de ferramentas.');
  }
}


async function ensureReverseLogisticsSchema(queryInterface) {
  const warehouses = await queryInterface.describeTable('warehouses').catch(() => null);
  if (warehouses && !warehouses.isReverseLogistics) {
    await queryInterface.addColumn('warehouses', 'isReverseLogistics', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addIndex('warehouses', ['isReverseLogistics']).catch(() => null);
    console.log('✅ Coluna warehouses.isReverseLogistics criada para separar estoques de logística reversa.');
  }

  // PostgreSQL exige inclusão explícita de novos valores em ENUMs existentes.
  await sequelize.query(`
    DO $$
    BEGIN
      ALTER TYPE enum_stock_movements_type ADD VALUE IF NOT EXISTS 'saida_logistica_reversa';
    EXCEPTION
      WHEN undefined_object THEN NULL;
    END $$;
  `).catch((error) => {
    console.warn('Não foi possível atualizar o enum de movimentações para logística reversa:', error.message);
  });
}


async function ensureIsolatedReverseLogisticsTables(queryInterface) {
  const entries = await queryInterface.describeTable('reverse_logistics_entries').catch(() => null);
  if (!entries) {
    await queryInterface.createTable('reverse_logistics_entries', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      reference: { type: DataTypes.STRING(140), allowNull: false, unique: true },
      sourceCompany: { type: DataTypes.STRING(180), allowNull: true },
      receivedAt: { type: DataTypes.DATEONLY, allowNull: false },
      documentType: { type: DataTypes.STRING(50), allowNull: true },
      documentNumber: { type: DataTypes.STRING(140), allowNull: true },
      documentDate: { type: DataTypes.DATEONLY, allowNull: true },
      receivedByName: { type: DataTypes.STRING(180), allowNull: true },
      proofAttachmentName: { type: DataTypes.STRING(255), allowNull: true },
      proofAttachmentData: { type: DataTypes.TEXT('long'), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      totalQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
      totalValue: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      warehouseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'warehouses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('reverse_logistics_entries', ['warehouseId', 'receivedAt']);
    console.log('✅ Tabela reverse_logistics_entries criada para entradas isoladas.');
  }

  const items = await queryInterface.describeTable('reverse_logistics_items').catch(() => null);
  if (!items) {
    await queryInterface.createTable('reverse_logistics_items', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      code: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(255), allowNull: false },
      serialNumber: { type: DataTypes.STRING(160), allowNull: true },
      quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
      unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'un' },
      unitCost: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      condition: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'usado' },
      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'em_estoque' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      exitedAt: { type: DataTypes.DATE, allowNull: true },
      warehouseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'warehouses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      entryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'reverse_logistics_entries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('reverse_logistics_items', ['warehouseId', 'status']);
    await queryInterface.addIndex('reverse_logistics_items', ['warehouseId', 'code']);
    await queryInterface.addIndex('reverse_logistics_items', ['serialNumber']);
    console.log('✅ Tabela reverse_logistics_items criada sem vínculo obrigatório com o catálogo.');
  }

  const exits = await queryInterface.describeTable('reverse_logistics_exits').catch(() => null);
  if (!exits) {
    await queryInterface.createTable('reverse_logistics_exits', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      reference: { type: DataTypes.STRING(140), allowNull: false, unique: true },
      supplierName: { type: DataTypes.STRING(180), allowNull: false },
      documentNumber: { type: DataTypes.STRING(140), allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      totalQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
      totalValue: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      warehouseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'warehouses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('reverse_logistics_exits', ['warehouseId', 'createdAt']);
    console.log('✅ Tabela reverse_logistics_exits criada para saídas isoladas.');
  }

  const exitItems = await queryInterface.describeTable('reverse_logistics_exit_items').catch(() => null);
  if (!exitItems) {
    await queryInterface.createTable('reverse_logistics_exit_items', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      code: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(255), allowNull: false },
      serialNumber: { type: DataTypes.STRING(160), allowNull: true },
      quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
      unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'un' },
      unitCost: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      totalCost: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      reverseItemId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'reverse_logistics_items', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      exitId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'reverse_logistics_exits', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('reverse_logistics_exit_items', ['exitId']);
    await queryInterface.addIndex('reverse_logistics_exit_items', ['reverseItemId']);
    console.log('✅ Tabela reverse_logistics_exit_items criada.');
  }
}

async function ensureServiceOrderEquipmentReplacementSchema(queryInterface) {
  const replacements = await queryInterface.describeTable('service_order_equipment_replacements').catch(() => null);
  if (replacements) return;

  await queryInterface.createTable('service_order_equipment_replacements', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    oldSerialNumber: { type: DataTypes.STRING(140), allowNull: false },
    newSerialNumber: { type: DataTypes.STRING(140), allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    serviceOrderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'service_orders', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    technicianId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'technicians', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    oldAssetId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'serialized_assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    newAssetId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'serialized_assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    oldMaterialId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'materials', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    newMaterialId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'materials', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    performedById: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('service_order_equipment_replacements', ['serviceOrderId', 'createdAt']);
  await queryInterface.addIndex('service_order_equipment_replacements', ['technicianId']);
  console.log('✅ Tabela service_order_equipment_replacements criada.');
}

async function ensureRuntimeSchema() {
  const queryInterface = sequelize.getQueryInterface();
  const users = await queryInterface.describeTable('users').catch(() => null);
  if (users && !users.modulePermissions) {
    await queryInterface.addColumn('users', 'modulePermissions', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    });
    console.log('✅ Coluna users.modulePermissions criada para controle de módulos.');
  }

  if (users) {
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION enforce_user_account_limit()
      RETURNS trigger AS $$
      BEGIN
        LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;
        IF (SELECT COUNT(*) FROM users) >= 30 THEN
          RAISE EXCEPTION 'Limite máximo de 30 contas atingido. Entre em contato com o Engenheiro de Software do Sistema para mais informações.'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS users_account_limit_30 ON users;
      CREATE TRIGGER users_account_limit_30
      BEFORE INSERT ON users
      FOR EACH ROW
      EXECUTE FUNCTION enforce_user_account_limit();
    `);
  }

  const technicians = await queryInterface.describeTable('technicians').catch(() => null);
  if (technicians && !technicians.transferApprovalLimit) {
    await queryInterface.addColumn('technicians', 'transferApprovalLimit', {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 500,
    });
    console.log('✅ Coluna technicians.transferApprovalLimit criada para limite individual de transferências.');
  }

  await ensureTechnicianCompanySchema(queryInterface);
  await ensureNotificationSchema(queryInterface);
  await ensureTechnicianToolsSchema(queryInterface);
  await ensureTechnicianToolDocumentsSchema(queryInterface);
  await ensureTransferItemLossSchema(queryInterface);
  await ensureToolTransferSchema(queryInterface);
  await ensureReverseLogisticsSchema(queryInterface);
  await ensureIsolatedReverseLogisticsTables(queryInterface);
  await ensureServiceOrderEquipmentReplacementSchema(queryInterface);
}

module.exports = { ensureRuntimeSchema };
