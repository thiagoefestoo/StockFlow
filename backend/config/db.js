const { Sequelize } = require('sequelize');
const env = require('./env');

if (!env.databaseUrl && env.isProduction) {
  throw new Error('DATABASE_URL não configurada. Configure a string de conexão do Neon no Render.');
}

if (!env.databaseUrl) {
  console.warn('⚠️ DATABASE_URL não configurada. Usando conexão local de desenvolvimento.');
}

const sequelize = new Sequelize(env.databaseUrl || 'postgres://user:pass@localhost:5432/telecomstock', {
  dialect: 'postgres',
  logging: env.dbLog ? console.log : false,
  protocol: 'postgres',
  pool: {
    max: env.dbPoolMax,
    min: env.dbPoolMin,
    idle: env.dbPoolIdle,
    acquire: env.dbPoolAcquire,
  },
  dialectOptions: env.dbSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
        keepAlive: true,
      }
    : {
        keepAlive: true,
      },
});

module.exports = sequelize;
