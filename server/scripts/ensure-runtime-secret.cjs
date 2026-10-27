const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const runtimeDir = path.join(__dirname, '../.runtime');
const secretPath = path.join(runtimeDir, 'jwt-secret');
fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });

let created = false;
try {
  fs.writeFileSync(secretPath, crypto.randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 });
  created = true;
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}

const value = fs.readFileSync(secretPath, 'utf8').trim();
if (value.length < 32) throw new Error('Persisted runtime JWT secret is invalid.');
console.log(JSON.stringify({ runtimeJwtSecret: 'ready', created }));
