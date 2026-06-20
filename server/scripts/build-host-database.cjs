const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const pool = require('../db');

const outputDirectory = path.join(__dirname, '../../hosting/Mysql_host');
const outputFile = path.join(outputDirectory, 'riana_cims_host.sql');
const safeSeedTables = new Set(['departments', 'subsidiaries', 'feedback_questions']);

async function run() {
  const database = process.env.DATABASE_NAME || 'riana_cims';
  const [tables] = await pool.query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`);
  const parts = ['-- RIANA CIMS MySQL hosting database', `-- Generated ${new Date().toISOString()}`, '-- Complete schema with sanitized reference data; no credentials or customer records.', 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS = 0;', `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, `USE \`${database}\`;`, ''];
  for (const { TABLE_NAME: table } of tables) {
    const [creationRows] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
    parts.push(`DROP TABLE IF EXISTS \`${table}\`;`, `${creationRows[0]['Create Table']};`, '');
    if (!safeSeedTables.has(table)) continue;
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
    for (const row of rows) {
      if (table === 'subsidiaries') row.default_escalation_matrix = null;
      const columns = Object.keys(row).map((column) => `\`${column}\``).join(', ');
      const values = Object.values(row).map((value) => pool.escape(value)).join(', ');
      parts.push(`INSERT INTO \`${table}\` (${columns}) VALUES (${values});`);
    }
    if (rows.length) parts.push('');
  }
  parts.push('SET FOREIGN_KEY_CHECKS = 1;', '');
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(outputFile, parts.join('\n'), 'utf8');
  console.log(JSON.stringify({ outputFile, tables: tables.length, seededTables: [...safeSeedTables] }, null, 2));
}

run().catch((error) => { console.error(`Host database export failed: ${error.message}`); process.exitCode = 1; }).finally(() => pool.end());
