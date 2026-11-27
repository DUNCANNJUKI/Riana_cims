const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const localFile = path.join(root, '.env.local');
const configured = fs.existsSync(localFile)
  ? require('../server/node_modules/dotenv').parse(fs.readFileSync(localFile)) : {};
const suffix = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const env = {
  ...process.env,
  HARDWARE_TEST_HOST: '127.0.0.1',
  HARDWARE_TEST_DATABASE: `cims_hardware_test_hw_${suffix}`,
  SCHEDULING_TEST_DATABASE: `cims_hardware_test_sc_${suffix}`,
  BUSINESS_TEST_DATABASE: `cims_hardware_test_biz_${suffix}`,
  HARDWARE_TEST_USER: process.env.HARDWARE_TEST_USER || configured.DATABASE_USER || configured.DB_USER || 'root',
  HARDWARE_TEST_PASSWORD: process.env.HARDWARE_TEST_PASSWORD ?? configured.DATABASE_PASSWORD ?? configured.DB_PASSWORD ?? configured.DB_PASS ?? '',
};
console.log(`Disposable local databases: ${env.HARDWARE_TEST_DATABASE}, ${env.SCHEDULING_TEST_DATABASE}, ${env.BUSINESS_TEST_DATABASE}`);
console.log('Test databases are retained for inspection; existing databases are never reused or dropped.');
const result = spawnSync(process.execPath, ['--test', 'server/services/hardwareMySql.test.js', 'server/services/schedulingMySql.test.js', 'server/services/businessOverviewMySql.test.js'], {
  cwd: root, env, stdio: 'inherit', timeout: 260000,
});
if (result.error) console.error(`Isolated tests could not finish: ${result.error.code || 'PROCESS_ERROR'}`);
process.exitCode = result.status ?? 1;
