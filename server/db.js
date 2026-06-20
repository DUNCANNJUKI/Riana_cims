const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'riana_cims',
  port: process.env.DATABASE_PORT || 3306,
  waitForConnections: true,
  connectionLimit: Number(process.env.DATABASE_POOL_SIZE || 30),
  maxIdle: Number(process.env.DATABASE_POOL_IDLE || 15),
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  queueLimit: 0
});

module.exports = pool;
