const path = require('path');

module.exports = {
  apps: [{
    name: 'riana-cims',
    cwd: path.join(__dirname, 'server'),
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '750M',
    time: true,
    env_production: { NODE_ENV: 'production', VITE_API_PORT: 8081 },
  }],
};
