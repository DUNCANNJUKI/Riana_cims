const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const services = [
  { name: 'CIMS API + Developers API', cwd: path.join(root, 'server'), args: ['start'] },
  { name: 'CIMS web', cwd: root, args: ['run', 'dev', '--', '--host', '0.0.0.0'] },
];

const children = services.map(({ name, cwd, args }) => {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', ['npm', ...args].join(' ')] : args;
  const child = spawn(command, commandArgs, { cwd, env: process.env, stdio: 'inherit' });
  child.on('exit', (code) => {
    if (code) console.error(`${name} exited with code ${code}.`);
  });
  return child;
});

const shutdown = () => children.forEach((child) => !child.killed && child.kill());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);
