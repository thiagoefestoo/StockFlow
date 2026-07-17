require('dotenv').config();

function list(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const databaseUrl = process.env.DATABASE_URL || '';
const looksLikeNeon = /neon\.tech|neon\.postgres|pooler/i.test(databaseUrl);
const urlRequiresSsl = /sslmode=require/i.test(databaseUrl);

const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const corsOrigins = [
  ...list(process.env.CORS_ORIGIN, defaultCorsOrigins),
  ...list(process.env.FRONTEND_URL, []),
];

module.exports = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 3000),
  databaseUrl,
  dbSsl: bool(process.env.DB_SSL, isProduction || looksLikeNeon || urlRequiresSsl),
  dbSync: bool(process.env.DB_SYNC, false),
  dbLog: bool(process.env.DB_LOG, false),
  dbPoolMax: Number(process.env.DB_POOL_MAX || 5),
  dbPoolMin: Number(process.env.DB_POOL_MIN || 0),
  dbPoolIdle: Number(process.env.DB_POOL_IDLE || 10000),
  dbPoolAcquire: Number(process.env.DB_POOL_ACQUIRE || 30000),
  jwtSecret: process.env.JWT_SECRET || 'telecomstock-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  setupAdminKey: process.env.SETUP_ADMIN_KEY || 'criar-admin-telecomstock',
  autoCreateAdmin: bool(process.env.AUTO_CREATE_ADMIN, !isProduction),
  defaultAdminName: process.env.DEFAULT_ADMIN_NAME || 'Administrador',
  defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'admin@local.com',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
  corsOrigins,
  corsAllowVercelPreviews: bool(process.env.CORS_ALLOW_VERCEL_PREVIEWS, false),
  autoIntelligenceMinutes: Number(process.env.TELECOMSTOCK_AUTO_INTELLIGENCE_MINUTES || 0),
  uploadPublicBaseUrl: process.env.UPLOAD_PUBLIC_BASE_URL || '',
  approvalAdminMinAmount: Number(process.env.APPROVAL_ADMIN_MIN_AMOUNT || 500),
};
