const path = require('path');
const fs = require('fs');

const deployedRelease = () => {
  try {
    const release = fs.readFileSync(path.join(__dirname, '.runtime', 'app-release'), 'utf8').trim();
    if (/^[a-f0-9]{40}$/i.test(release)) return release;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return process.env.APP_RELEASE || 'unversioned';
};

module.exports = {
  apps: [
    {
      name: 'riana-cims',
      cwd: path.join(__dirname, 'server'),
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10000,
      max_memory_restart: '750M',
      time: true,
      env_production: { NODE_ENV: 'production', PORT: 8081, APP_RELEASE: deployedRelease() },
    },
    {
      name: 'riana-cims-web',
      cwd: __dirname,
      script: path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js'),
      args: ['--host', '0.0.0.0'],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10000,
      max_memory_restart: '750M',
      time: true,
      env: { NODE_ENV: 'development' },
    },
  ],
};
