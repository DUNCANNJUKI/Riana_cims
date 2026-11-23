const test = require('node:test');
const assert = require('node:assert/strict');

test('watermarks stay between report headers and footers for portrait and landscape pages', async () => {
  const { watermarkBox, DOCUMENT_LAYOUT } = await import('./documentBranding.mjs');
  for (const [width, height] of [[210, 297], [297, 210], [215.9, 279.4], [279.4, 215.9]]) {
    const box = watermarkBox(width, height);
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    assert.ok(box.y >= DOCUMENT_LAYOUT.firstPageContentTop);
    assert.ok(box.y + box.height <= height - DOCUMENT_LAYOUT.autoTableBottomMargin + 0.01);
    assert.ok(Math.abs(box.height / box.width - (297 / 210) * 0.4) < 0.001);
  }
});
