const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const firstConfiguredValue = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const databaseConfig = {
  host: firstConfiguredValue('DATABASE_HOST', 'DB_HOST') || 'localhost',
  user: firstConfiguredValue('DATABASE_USER', 'DB_USER') || 'root',
  password: firstConfiguredValue('DATABASE_PASSWORD', 'DB_PASSWORD', 'DB_PASS') || '',
  database: firstConfiguredValue('DATABASE_NAME', 'DB_NAME') || 'riana_cims',
  port: Number(firstConfiguredValue('DATABASE_PORT', 'DB_PORT') || 3306),
};

if (process.env.NODE_ENV === 'production') {
  const missing = [];
  if (!firstConfiguredValue('DATABASE_HOST', 'DB_HOST')) missing.push('DATABASE_HOST or DB_HOST');
  if (!firstConfiguredValue('DATABASE_NAME', 'DB_NAME')) missing.push('DATABASE_NAME or DB_NAME');
  if (!firstConfiguredValue('DATABASE_USER', 'DB_USER')) missing.push('DATABASE_USER or DB_USER');
  if (!firstConfiguredValue('DATABASE_PASSWORD', 'DB_PASSWORD', 'DB_PASS')) {
    missing.push('DATABASE_PASSWORD, DB_PASSWORD, or DB_PASS');
  }
  if (missing.length) {
    throw new Error(`Missing required production database configuration: ${missing.join('; ')}`);
  }
}

const pool = mysql.createPool({
  ...databaseConfig,
  waitForConnections: true,
  connectionLimit: Number(process.env.DATABASE_POOL_SIZE || 30),
  maxIdle: Number(process.env.DATABASE_POOL_IDLE || 15),
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  queueLimit: 0
});

module.exports = pool;
