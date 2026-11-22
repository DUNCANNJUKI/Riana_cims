const fs = require('node:fs/promises');
const path = require('node:path');
const { renderCompanyPwaIcon } = require('../server/services/companyPwaIcon');

// Export the current bundled original without AI redrawing or changing its colours.
async function generate() {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'public/Riana_mark_transparent.png');
  const output = path.join(root, 'public/pwa');
  await fs.mkdir(output, { recursive: true });
  await fs.copyFile(source, path.join(output, 'company-logo-transparent-v2.png'));
  for (const [size, purpose] of [[192, 'any'], [512, 'any'], [512, 'maskable']]) {
    await fs.writeFile(path.join(output, `company-${purpose}-${size}-v2.png`), await renderCompanyPwaIcon(source, size, purpose));
  }
  console.log('Exported original transparent logo, 192/512 transparent PNGs and teal maskable PNG.');
}

generate().catch(error => { console.error(error.message); process.exitCode = 1; });
