const path = require('path');

module.exports = {
  apps: [{
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
    env_production: { NODE_ENV: 'production', PORT: 8081 },
  }],
};
