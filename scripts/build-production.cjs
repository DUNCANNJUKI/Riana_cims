const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'dist');
const forbiddenProductionMarkers = [
  'http://localhost:8081/api',
  'react/jsx-dev-runtime',
];

const listJavaScriptFiles = (directory) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolute);
  }
  return files;
};

const verifyProductionOutput = () => {
  for (const file of listJavaScriptFiles(outputDirectory)) {
    const content = fs.readFileSync(file, 'utf8');
    const marker = forbiddenProductionMarkers.find((candidate) => content.includes(candidate));
    if (marker) {
      throw new Error(`Production build contains forbidden marker "${marker}" in ${path.relative(root, file)}.`);
    }
  }
};

const run = async () => {
  // Set these before importing Vite/React so ignored local environment files
  // cannot accidentally produce a development bundle for deployment.
  process.env.NODE_ENV = 'production';
  process.env.BABEL_ENV = 'production';

  const { build } = await import('vite');
  await build({ mode: 'production' });
  verifyProductionOutput();
  console.log('Production bundle verification passed.');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
