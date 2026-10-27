const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const sharp = require("sharp");
const { jsPDF } = require("../../node_modules/jspdf");
const {
  renderHandoverPages,
  createHandoverSupportingDocuments,
} = require("./handoverSupportingDocuments");

test("all PDF pages become nonblank PNG images with readable document content", async () => {
  const pdf = new jsPDF();
  pdf.text("Signed Installation Handover", 20, 30);
  pdf.addPage();
  pdf.text("Second page signature and devices", 20, 30);
  const pages = await renderHandoverPages(
    Buffer.from(pdf.output("arraybuffer")),
  );
  assert.equal(pages.length, 2);
  for (const page of pages) {
    const metadata = await sharp(Buffer.from(page.buffer)).metadata();
    const stats = await sharp(Buffer.from(page.buffer)).stats();
    assert.equal(metadata.format, "png");
    assert.ok(page.width > 500 && page.height > 500);
    assert.ok(stats.channels[0].min < 100);
  }
});
test("image handovers are normalized and invalid documents fail explicitly", async () => {
  const source = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#cc0000" },
  })
    .png()
    .toBuffer();
  const pages = await renderHandoverPages(source);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].width, 100);
  await assert.rejects(
    renderHandoverPages(Buffer.from("%PDF-invalid")),
    /PDF|document/i,
  );
});
test("private supporting image writes associate each installed asset and are cleaned after rollback", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cims-handover-test-"));
  const service = createHandoverSupportingDocuments({ uploadRoot: root });
  const queries = [];
  const db = {
    query: async (sql, args) => {
      queries.push({ sql, args });
      return sql.startsWith("SELECT a.id")
        ? [[{ id: "asset", subsidiary_id: "subsidiary", branch_id: null }]]
        : sql.startsWith('SELECT id FROM uploaded_files') ? [[]]
        : [{ insertId: 12 }];
    },
  };
  const image = await sharp({
    create: { width: 50, height: 60, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const count = await service.save(
    db,
    { user: { id: "technician" }, headers: {} },
    "installation",
    "signed.pdf",
    [{ buffer: image, width: 50, height: 60 }],
  );
  assert.equal(count, 1);
  const insert = queries.find((q) =>
    q.sql.startsWith("INSERT INTO uploaded_files"),
  );
  assert.equal(insert.args[0], "subsidiary");
  assert.equal(insert.args[7], "asset");
  const stored = path.join(root, insert.args[5]);
  await fs.access(stored);
  await service.cleanup();
  await assert.rejects(fs.access(stored));
});
