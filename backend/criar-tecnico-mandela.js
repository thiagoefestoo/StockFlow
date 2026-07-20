require('dotenv').config();

const bcrypt = require('bcryptjs');
const sequelize = require('./config/db');
const { User, Technician } = require('./app/models');

async function main() {
  await sequelize.authenticate();
  console.log('Conectado ao banco Neon.');

  const nome = 'Mandela';
  const email = 'mandela@superinfra.com';
  const senha = '123456789';

  let technician = await Technician.findOne({ where: { email } });

  if (!technician) {
    technician = await Technician.create({
      name: nome,
      email,
      phone: '',
      type: 'interno',
      status: 'ativo',
      serviceCities: [],
      defaultWarehouseId: null,
      notes: 'Técnico criado via comando PowerShell.',
    });

    console.log('Técnico criado:', technician.name);
  } else {
    await technician.update({
      name: technician.name || nome,
      status: 'ativo',
    });

    console.log('Técnico já existia. Dados atualizados.');
  }

  const passwordHash = await bcrypt.hash(senha, 10);

  let user = await User.findOne({ where: { email } });

  const data = {
    name: nome,
    email,
    role: 'tecnico',
    status: 'ativo',
    technicianId: technician.id,
    passwordHash,
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    warehouseIds: [],
    cityAccess: [],
    notes: 'Usuário técnico criado via comando PowerShell.',
  };

  if (user) {
    await user.update(data);
    console.log('Usuário técnico atualizado com nova senha.');
  } else {
    user = await User.create(data);
    console.log('Usuário técnico criado.');
  }

  console.log('');
  console.log('Login criado com sucesso:');
  console.log('E-mail:', email);
  console.log('Senha:', senha);
  console.log('Perfil: tecnico');
  console.log('Técnico vinculado ID:', technician.id);
}

main()
  .catch((error) => {
    console.error('Erro:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
