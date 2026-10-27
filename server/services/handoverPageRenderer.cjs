const path = require("node:path");

async function renderHandoverPages(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length > 10 * 1024 * 1024) {
    throw new Error("Handover file exceeds 10 MB.");
  }

  if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
    const sharp = require("sharp");
    const { data, info } = await sharp(bytes, { limitInputPixels: 16000000 })
      .rotate()
      .resize({ width: 1800, height: 2400, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    return [{ buffer: data, width: info.width, height: info.height }];
  }

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const base = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const assetDirectory = (name) => path.join(base, name).replace(/\\/g, "/") + "/";
  const task = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    cMapUrl: assetDirectory("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: assetDirectory("standard_fonts"),
    wasmUrl: assetDirectory("wasm"),
  });

  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error("Handover documents may contain at most 20 pages.");
    const pages = [];
    let total = 0;
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const size = page.getViewport({ scale: 1 });
      if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
        throw new Error("Invalid handover page size.");
      }
      const viewport = page.getViewport({ scale: Math.min(2, 1800 / size.width, 2400 / size.height) });
      const canvas = pdf.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvasContext: canvas.context, viewport }).promise;
        const rendered = canvas.canvas.toBuffer("image/png");
        total += rendered.length;
        if (total > 50 * 1024 * 1024) throw new Error("Handover page images exceed the processing limit.");
        pages.push({ buffer: rendered, width: canvas.canvas.width, height: canvas.canvas.height });
      } finally {
        pdf.canvasFactory.destroy(canvas);
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

module.exports = { renderHandoverPages };
