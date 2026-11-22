const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { renderCompanyPwaIcon } = require('./companyPwaIcon');

const source = path.resolve(__dirname, '../../public/Riana_mark_transparent.png');

for (const size of [180, 192, 512]) {
  test(`transparent ${size}px PWA icon preserves alpha and centres the original mark`, async () => {
    const original = fs.readFileSync(source);
    const icon = await renderCompanyPwaIcon(source, size);
    const { data, info } = await sharp(icon).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    let left = size, top = size, right = -1, bottom = -1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (data[i + 3] > 0) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
      assert.ok(!(data[i + 3] > 200 && Math.max(data[i], data[i + 1], data[i + 2]) < 15), 'no opaque black rectangle');
    }
    assert.equal(data[3], 0, 'transparent corner');
    assert.equal(data[data.length - 1], 0, 'transparent opposite corner');
    assert.ok(Math.abs(left - (size - 1 - right)) <= 2, 'horizontal centring');
    assert.ok(Math.abs(top - (size - 1 - bottom)) <= 2, 'vertical centring');
    assert.deepEqual(fs.readFileSync(source), original, 'source pixels remain unchanged');
  });
}

test('maskable icon fills the whole canvas in splash teal and keeps artwork in the circular safe zone', async () => {
  const size = 512;
  const { data } = await sharp(await renderCompanyPwaIcon(source, size, 'maskable')).raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    assert.equal(data[i + 3], 255);
    if (data[i] !== 8 || data[i + 1] !== 111 || data[i + 2] !== 118) {
      assert.ok(Math.hypot(x - (size - 1) / 2, y - (size - 1) / 2) < size * 0.4, 'artwork inside Android safe zone');
    }
  }
  assert.deepEqual([...data.subarray(0, 4)], [8, 111, 118, 255]);
});

test('PWA renderer restricts sizes and purposes', async () => {
  await assert.rejects(renderCompanyPwaIcon(source, 1024), RangeError);
  await assert.rejects(renderCompanyPwaIcon(source, 512, 'other'), RangeError);
});
