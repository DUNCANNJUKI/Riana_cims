const test = require('node:test');
const assert = require('node:assert/strict');

test('production database configuration accepts the Truehost DB_PASS alias', async () => {
  const keys = [
    'NODE_ENV',
    'DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD',
    'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_PASS',
  ];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  let pool;

  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DATABASE_HOST: '',
      DATABASE_PORT: '',
      DATABASE_NAME: '',
      DATABASE_USER: '',
      DATABASE_PASSWORD: '',
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_NAME: 'truehost_config_test',
      DB_USER: 'truehost_config_test',
      DB_PASS: 'test-only-password-sentinel',
    });

    const databaseModule = require.resolve('../db');
    delete require.cache[databaseModule];
    pool = require(databaseModule);

    const connectionConfig = pool.pool.config.connectionConfig;
    assert.equal(connectionConfig.password, 'test-only-password-sentinel');
    assert.equal(connectionConfig.database, 'truehost_config_test');
    assert.equal(connectionConfig.user, 'truehost_config_test');
  } finally {
    if (pool) await pool.end();
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    delete require.cache[require.resolve('../db')];
  }
});
