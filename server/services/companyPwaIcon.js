const sharp = require('sharp');

const SPLASH_TEAL = '#086f76';

// Keep the source artwork and alpha; only trim empty canvas, scale uniformly and centre.
async function renderCompanyPwaIcon(source, size, purpose = 'any') {
  if (![180, 192, 512].includes(size)) throw new RangeError('Unsupported PWA icon size.');
  if (!['any', 'maskable'].includes(purpose)) throw new RangeError('Unsupported PWA icon purpose.');
  const artwork = await sharp(source, { limitInputPixels: 16000000, failOn: 'none' })
    .rotate().ensureAlpha().trim({ background: '#00000000', threshold: 0 }).png().toBuffer();
  const { width, height } = await sharp(artwork).metadata();
  // A rectangle inside this radius remains intact under every compliant Android mask.
  const scale = purpose === 'maskable'
    ? size * 0.76 / Math.hypot(width, height)
    : size * 0.76 / Math.max(width, height);
  const logoWidth = Math.max(1, Math.floor(width * scale));
  const logoHeight = Math.max(1, Math.floor(height * scale));
  const logo = await sharp(artwork).resize(logoWidth, logoHeight, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: {
    width: size, height: size, channels: 4,
    background: purpose === 'maskable' ? SPLASH_TEAL : { r: 0, g: 0, b: 0, alpha: 0 },
  } }).composite([{ input: logo, gravity: 'centre' }]).png().toBuffer();
}

module.exports = { renderCompanyPwaIcon, SPLASH_TEAL };
