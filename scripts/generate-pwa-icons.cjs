const fs = require('node:fs/promises');
const path = require('node:path');
const { renderCompanyPwaIcon } = require('../server/services/companyPwaIcon');
const sharp = require('../server/node_modules/sharp');
const appleSizes = require('./pwa-startup-sizes.json');

const light = '#eff7fa';
const dark = '#101d29';

async function startupImage(source, width, height, logoHeight, background) {
  const mark = await sharp(source).resize({ height: logoHeight, kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background } })
    .composite([{ input: mark, gravity: 'centre' }]).png({ compressionLevel: 9 }).toBuffer();
}

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
  const colorSource = path.join(root, 'public/Riana_mark_color_trimmed.png');
  await sharp(colorSource).resize({ height: 128 }).png({ compressionLevel: 9 })
    .toFile(path.join(output, 'startup-mark-v3.png'));
  for (const [purpose, size, ratio, background] of [
    ['any', 192, 0.56, '#00000000'],
    ['any', 512, 0.56, '#00000000'],
    ['maskable', 512, 0.50, light],
    ['touch', 180, 0.56, light],
  ]) {
    const icon = await startupImage(colorSource, size, size, Math.round(size * ratio), background);
    await fs.writeFile(path.join(output, `startup-${purpose}-${size}-v3.png`), icon);
  }
  for (const [width, height, scale] of appleSizes) {
    for (const [theme, color] of [['light', light], ['dark', dark]]) {
      const image = await startupImage(colorSource, width * scale, height * scale, 64 * scale, color);
      await fs.writeFile(path.join(output, `ios-${width}x${height}-${scale}x-${theme}-v3.png`), image);
    }
  }
  console.log('Exported versioned RIANA PWA icons and iOS portrait launch images.');
}

generate().catch(error => { console.error(error.message); process.exitCode = 1; });
