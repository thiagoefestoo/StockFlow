
require('dotenv').config();



const sequelize = require('./config/db');

const {

  User,

  Technician,

  Material,

  SerializedAsset,

  StockBalance,

  StockMovement,

} = require('./app/models');



async function getOrCreateMaterial(data) {

  const [material] = await Material.findOrCreate({

    where: { sku: data.sku },

    defaults: data,

  });



  await material.update({

    name: data.name,

    category: data.category,

    unit: data.unit,

    requiresSerial: data.requiresSerial,

    unitCost: data.unitCost,

    active: true,

  });



  return material;

}



async function addBalance({ material, technician, quantity, admin }) {

  const [balance] = await StockBalance.findOrCreate({

    where: {

      materialId: material.id,

      ownerType: 'tecnico',

      technicianId: technician.id,

      warehouseId: null,

    },

    defaults: {

      quantity: 0,

      warehouseId: null,

    },

  });



  balance.quantity = Number(balance.quantity || 0) + Number(quantity);

  await balance.save();



  await StockMovement.create({

    type: 'transferencia_tecnico',

    materialId: material.id,

    quantity,

    fromOwnerType: 'estoque',

    toOwnerType: 'tecnico',

    toTechnicianId: technician.id,

    reference: 'CARGA-INICIAL-BRUNO',

    notes: `Carga inicial adicionada manualmente para ${technician.name}.`,

    createdById: admin?.id || null,

  });

}



async function addSerials({ material, technician, serials, admin }) {

  for (const serialNumber of serials) {

    const serial = String(serialNumber).trim();

    if (!serial) continue;



    const existing = await SerializedAsset.findOne({ where: { serialNumber: serial } });



    if (existing) {

      existing.materialId = material.id;

      existing.ownerType = 'tecnico';

      existing.status = 'com_tecnico';

      existing.technicianId = technician.id;

      existing.custodyStartedAt = existing.custodyStartedAt || new Date();

      existing.lastMovementAt = new Date();

      existing.acquisitionCost = existing.acquisitionCost || material.unitCost || 0;

      existing.notes = `Serial vinculado manualmente à caixa de ${technician.name}.`;

      await existing.save();

    } else {

      const asset = await SerializedAsset.create({

        materialId: material.id,

        serialNumber: serial,

        ownerType: 'tecnico',

        status: 'com_tecnico',

        technicianId: technician.id,

        acquisitionCost: material.unitCost || 0,

        custodyStartedAt: new Date(),

        lastMovementAt: new Date(),

        notes: `Serial criado manualmente para a caixa de ${technician.name}.`,

      });



      await StockMovement.create({

        type: 'transferencia_tecnico',

        materialId: material.id,

        assetId: asset.id,

        quantity: 1,

        serialNumber: serial,

        fromOwnerType: 'estoque',

        toOwnerType: 'tecnico',

        toTechnicianId: technician.id,

        reference: 'CARGA-INICIAL-BRUNO',

        notes: `Serial criado e vinculado manualmente à caixa de ${technician.name}.`,

        createdById: admin?.id || null,

      });

    }

  }

}



async function main() {

  await sequelize.authenticate();



  const admin = await User.findOne({ where: { email: 'admin@local.com' } });



  const brunoUser = await User.findOne({

    where: { email: 'bruno@superinfra.local' },

  });



  let technician = null;



  if (brunoUser?.technicianId) {

    technician = await Technician.findByPk(brunoUser.technicianId);

  }



  if (!technician) {

    technician = await Technician.findOne({ where: { name: 'Bruno Lima' } });

  }



  if (!technician) {

    throw new Error('Técnico Bruno Lima não encontrado. Crie/sincronize o técnico antes de adicionar itens.');

  }



  const onu = await getOrCreateMaterial({

    sku: 'ONU-SUPERINFRA',

    name: 'ONU Fibra',

    category: 'onu',

    unit: 'un',

    requiresSerial: true,

    unitCost: 120,

  });



  const cabo = await getOrCreateMaterial({

    sku: 'CABO-DROP',

    name: 'Cabo Drop',

    category: 'cabo',

    unit: 'm',

    requiresSerial: false,

    unitCost: 1.5,

  });



  const conector = await getOrCreateMaterial({

    sku: 'CONECTOR-APC',

    name: 'Conector APC',

    category: 'conector',

    unit: 'un',

    requiresSerial: false,

    unitCost: 2.5,

  });



  const esticador = await getOrCreateMaterial({

    sku: 'ESTICADOR-DROP',

    name: 'Esticador Drop',

    category: 'esticador',

    unit: 'un',

    requiresSerial: false,

    unitCost: 3,

  });



  await addSerials({

    material: onu,

    technician,

    admin,

    serials: [

      'ONU-BRUNO-001',

      'ONU-BRUNO-002',

      'ONU-BRUNO-003',

    ],

  });



  await addBalance({ material: cabo, technician, quantity: 200, admin });

  await addBalance({ material: conector, technician, quantity: 20, admin });

  await addBalance({ material: esticador, technician, quantity: 10, admin });



  console.log('Itens adicionados com sucesso para Bruno Lima.');

  console.log('Técnico ID:', technician.id);

  console.log('Conta:', brunoUser?.email || 'sem usuário vinculado localizado');

}



main()

  .catch((error) => {

    console.error('Erro:', error.message);

    process.exitCode = 1;

  })

  .finally(async () => {

    await sequelize.close();

  });

