require('dotenv').config();
const quantityResponseMiddleware = require('./app/middlewares/quantityResponseMiddleware');
const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/db');
const env = require('./config/env');
require('./app/models');
const { startAutoIntelligence } = require('./app/services/intelligenceService');
const { ensureBootstrapAdmin } = require('./app/services/adminBootstrapService');
const { ensureRuntimeSchema } = require('./app/services/runtimeSchemaService');

const app = express();

app.set('trust proxy', 1);

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function isVercelOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (env.corsOrigins.includes('*') || env.corsOrigins.includes(normalized)) return true;
  if (env.corsAllowVercelPreviews && isVercelOrigin(normalized)) return true;
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    // Requisições sem Origin incluem health checks, aplicativos nativos e o proxy da Vercel.
    if (isAllowedOrigin(origin)) return callback(null, true);
    const error = new Error(`Origem não permitida pelo CORS: ${origin}`);
    error.statusCode = 403;
    return callback(error);
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Accept', 'Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
  exposedHeaders: ['Content-Disposition', 'Content-Length'],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

// CORS precisa ser o primeiro middleware para que respostas OPTIONS e erros posteriores
// também recebam os cabeçalhos necessários.
app.use(cors(corsOptions));
app.use(quantityResponseMiddleware);

app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => res.json({ success: true, message: 'Super Infra API online.', environment: env.nodeEnv }));
app.get('/api/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    return res.json({
      success: true,
      status: 'online',
      database: 'connected',
      environment: env.nodeEnv,
      cors: {
        requestOrigin: normalizeOrigin(req.headers.origin || ''),
        requestOriginAllowed: isAllowedOrigin(req.headers.origin),
        vercelPreviewsAllowed: env.corsAllowVercelPreviews,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ success: false, status: 'offline', error: error.message });
  }
});

app.use('/api/auth', require('./app/routes/authRoutes'));
app.use('/api/users', require('./app/routes/userRoutes'));
app.use('/api/materials', require('./app/routes/materialRoutes'));
app.use('/api/companies', require('./app/routes/companyRoutes'));
app.use('/api/warehouses', require('./app/routes/warehouseRoutes'));
app.use('/api/technicians', require('./app/routes/technicianRoutes'));
app.use('/api/technicians/:technicianId/tools', require('./app/routes/technicianToolRoutes'));
app.use('/api/batches', require('./app/routes/batchRoutes'));
app.use('/api/stock', require('./app/routes/stockRoutes'));
app.use('/api/transfers', require('./app/routes/transferRoutes'));
app.use('/api/material-requests', require('./app/routes/materialRequestRoutes'));
app.use('/api/approvals', require('./app/routes/approvalRoutes'));
app.use('/api/operations', require('./app/routes/operationsRoutes'));
app.use('/api/service-orders', require('./app/routes/serviceOrderRoutes'));
app.use('/api/notifications', require('./app/routes/notificationRoutes'));
app.use('/api/audit', require('./app/routes/auditRoutes'));
app.use('/api/bi', require('./app/routes/biRoutes'));

app.use((err, req, res, next) => {
  console.error('Erro:', err.message);
  const status = err.statusCode || err.status || 500;
  return res.status(status).json({ success: false, message: err.message || 'Erro interno.' });
});
app.use((req, res) => res.status(404).json({ success: false, message: `Rota não encontrada: ${req.method} ${req.originalUrl}` }));

async function start() {
  try {
    await sequelize.authenticate();
    await ensureRuntimeSchema();
    if (env.dbSync) await sequelize.sync({ alter: true });
    await ensureBootstrapAdmin();
    startAutoIntelligence(env.autoIntelligenceMinutes);
    app.listen(env.port, () => {
      console.log(`🚀 Super Infra API na porta ${env.port}`);
      console.log(`🔗 Health: http://localhost:${env.port}/api/health`);
    });
  } catch (error) {
    console.error('Falha ao iniciar:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start, isAllowedOrigin, normalizeOrigin };
