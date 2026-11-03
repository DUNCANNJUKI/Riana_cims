const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const release = path.join(root, 'release');
fs.rmSync(release, { recursive: true, force: true });
fs.mkdirSync(release, { recursive: true });

fs.cpSync(path.join(root, 'dist'), path.join(release, 'dist'), { recursive: true });
fs.cpSync(path.join(root, 'CRMS', 'dist'), path.join(release, 'CRMS', 'dist'), { recursive: true });
fs.cpSync(path.join(root, 'server'), path.join(release, 'server'), {
  recursive: true,
  filter: (source) => {
    const name = path.basename(source);
    return !['node_modules', 'backups', 'uploads', 'private_uploads', 'tmp', 'tests', '.runtime'].includes(name)
      && !/\.(?:test|spec)\.(?:c?js|mjs)$/i.test(name);
  },
});
for (const file of ['ecosystem.config.cjs', '.env.example', 'README.md']) {
  fs.copyFileSync(path.join(root, file), path.join(release, file));
}
fs.cpSync(path.join(root, 'hosting'), path.join(release, 'hosting'), { recursive: true });
console.log(`Host release staged at ${release}`);
