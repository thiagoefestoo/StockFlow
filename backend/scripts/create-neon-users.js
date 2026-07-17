require('dotenv').config();

const bcrypt = require('bcryptjs');
const sequelize = require('../config/db');
const { User, Technician, Warehouse } = require('../app/models');

function list(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function email(value) {
  return String(value || '').toLowerCase().trim();
}

async function ensureWarehouse() {
  const code = process.env.SEED_WAREHOUSE_CODE || 'SUPER-INFRA-MATRIZ';
  const name = process.env.SEED_WAREHOUSE_NAME || 'Estoque Super Infra';
  const city = process.env.SEED_WAREHOUSE_CITY || 'Joinville';
  const state = process.env.SEED_WAREHOUSE_STATE || 'SC';

  let warehouse = await Warehouse.findOne({ where: { code } });
  if (!warehouse) {
    warehouse = await Warehouse.create({
      code,
      name,
      city,
      state,
      region: process.env.SEED_WAREHOUSE_REGION || 'Matriz',
      responsibleName: process.env.SEED_STOCK_NAME || 'Estoquista Super Infra',
      status: 'ativo',
      approvalLimit: Number(process.env.SEED_WAREHOUSE_APPROVAL_LIMIT || 500),
      notes: 'Criado pelo script create-neon-users.js',
    });
    console.log(`✅ Estoque criado: ${warehouse.name} (${warehouse.code})`);
  } else {
    console.log(`ℹ️ Estoque já existe: ${warehouse.name} (${warehouse.code})`);
  }
  return warehouse;
}

async function upsertUser({ name, userEmail, password, role, technicianId = null, warehouseIds = [], cityAccess = [], approvalLimit = 0, jobTitle = null, phone = null }) {
  const normalizedEmail = email(userEmail);
  if (!normalizedEmail) throw new Error(`E-mail obrigatório para ${name}.`);
  if (!password || String(password).length < 6) throw new Error(`Senha de ${normalizedEmail} precisa ter pelo menos 6 caracteres.`);

  let user = await User.findOne({ where: { email: normalizedEmail } });
  const payload = {
    name,
    email: normalizedEmail,
    role,
    technicianId: role === 'tecnico' ? technicianId : null,
    status: 'ativo',
    phone,
    jobTitle,
    warehouseIds,
    cityAccess,
    approvalLimit: Number(approvalLimit || 0),
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    passwordHash: await bcrypt.hash(String(password), 10),
    blockedAt: null,
    blockedReason: null,
    deletedAt: null,
    deletedReason: null,
  };

  if (user) {
    await user.update(payload);
    console.log(`🔄 Usuário atualizado: ${normalizedEmail} (${role})`);
  } else {
    user = await User.create(payload);
    console.log(`✅ Usuário criado: ${normalizedEmail} (${role})`);
  }
  return user;
}

async function upsertTechnician({ name, userEmail, phone, cityAccess, warehouseId }) {
  const normalizedEmail = email(userEmail);
  let technician = await Technician.findOne({ where: { email: normalizedEmail } });
  const payload = {
    name,
    email: normalizedEmail,
    phone: phone || null,
    type: 'interno',
    status: 'ativo',
    serviceCities: cityAccess,
    defaultWarehouseId: warehouseId || null,
    notes: 'Criado pelo script create-neon-users.js',
  };

  if (technician) {
    await technician.update(payload);
    console.log(`🔄 Técnico atualizado: ${technician.name}`);
  } else {
    technician = await Technician.create(payload);
    console.log(`✅ Técnico criado: ${technician.name}`);
  }
  return technician;
}

(async () => {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL não encontrada. Configure backend/.env antes de executar.');
    }

    await sequelize.authenticate();
    console.log('✅ Conectado ao banco Neon.');

    const warehouse = await ensureWarehouse();
    const cities = list(process.env.SEED_TECH_CITIES || process.env.SEED_CITY_ACCESS || 'Joinville');

    await upsertUser({
      name: process.env.SEED_ADMIN_NAME || process.env.DEFAULT_ADMIN_NAME || 'Administrador',
      userEmail: process.env.SEED_ADMIN_EMAIL || process.env.DEFAULT_ADMIN_EMAIL || 'admin@local.com',
      password: process.env.SEED_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
      role: 'admin',
      jobTitle: 'Administrador do sistema',
      cityAccess: cities,
    });

    await upsertUser({
      name: process.env.SEED_STOCK_NAME || 'Estoquista Super Infra',
      userEmail: process.env.SEED_STOCK_EMAIL || 'estoque@superinfra.local',
      password: process.env.SEED_STOCK_PASSWORD || 'estoque123',
      role: 'estoquista',
      jobTitle: 'Estoquista',
      warehouseIds: [Number(warehouse.id)],
      cityAccess: cities,
      approvalLimit: Number(process.env.SEED_STOCK_APPROVAL_LIMIT || 500),
    });

    const techEmail = process.env.SEED_TECH_EMAIL || 'bruno@superinfra.local';
    const technician = await upsertTechnician({
      name: process.env.SEED_TECH_NAME || 'Bruno Lima',
      userEmail: techEmail,
      phone: process.env.SEED_TECH_PHONE || '',
      cityAccess: cities,
      warehouseId: warehouse.id,
    });

    await upsertUser({
      name: process.env.SEED_TECH_NAME || 'Bruno Lima',
      userEmail: techEmail,
      password: process.env.SEED_TECH_PASSWORD || 'tec123456',
      role: 'tecnico',
      technicianId: technician.id,
      jobTitle: 'Técnico de campo',
      warehouseIds: [Number(warehouse.id)],
      cityAccess: cities,
    });

    console.log('\n✅ Contas criadas/atualizadas com sucesso no banco Neon.');
    console.log('Admin:', process.env.SEED_ADMIN_EMAIL || process.env.DEFAULT_ADMIN_EMAIL || 'admin@local.com');
    console.log('Estoquista:', process.env.SEED_STOCK_EMAIL || 'estoque@superinfra.local');
    console.log('Técnico:', techEmail);
  } catch (error) {
    console.error('❌ Erro ao criar usuários:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
