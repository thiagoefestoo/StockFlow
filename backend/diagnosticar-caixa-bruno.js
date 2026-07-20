require('dotenv').config();

const sequelize = require('./config/db');
const {
  User,
  Technician,
  Material,
  SerializedAsset,
  StockBalance,
} = require('./app/models');

async function main() {
  await sequelize.authenticate();
  console.log('Conectado ao Neon.');

  const email = 'bruno@superinfra.local';

  const user = await User.findOne({ where: { email } });
  const technician = await Technician.findOne({ where: { email } });

  console.log('');
  console.log('Usuário Bruno:');
  console.log(user ? {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    technicianId: user.technicianId,
    status: user.status
  } : 'NÃO ENCONTRADO');

  console.log('');
  console.log('Técnico Bruno:');
  console.log(technician ? {
    id: technician.id,
    name: technician.name,
    email: technician.email,
    status: technician.status,
    serviceCities: technician.serviceCities,
    defaultWarehouseId: technician.defaultWarehouseId
  } : 'NÃO ENCONTRADO');

  if (!technician) {
    console.log('Sem técnico, não dá para consultar caixa.');
    return;
  }

  const serials = await SerializedAsset.findAll({
    where: {
      ownerType: 'tecnico',
      technicianId: technician.id,
    },
    include: [Material],
  });

  const balances = await StockBalance.findAll({
    where: {
      ownerType: 'tecnico',
      technicianId: technician.id,
    },
    include: [Material],
  });

  console.log('');
  console.log('Seriais na caixa do Bruno:', serials.length);
  for (const item of serials) {
    console.log('-', item.serialNumber, '|', item.Material?.name, '| status:', item.status);
  }

  console.log('');
  console.log('Materiais consumíveis na caixa do Bruno:', balances.length);
  for (const item of balances) {
    console.log('-', item.Material?.name, '| quantidade:', item.quantity);
  }
}

main()
  .catch((error) => {
    console.error('Erro:', error);
  })
  .finally(async () => {
    await sequelize.close();
  });
