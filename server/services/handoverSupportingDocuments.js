const { fork } = require("node:child_process");
const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const {
  safeMkdirForRelativePath,
  safeUnlink,
} = require("./privateFileStorage");
const { sanitizeOriginalName } = require("./fileValidation");
const { logSuccess } = require("./auditService");
const { renderHandoverPages: renderInProcess } = require("./handoverPageRenderer.cjs");

let rendering = 0;
const renderHandoverPages = (buffer) => {
  if (buffer.length > 10 * 1024 * 1024)
    return Promise.reject(
      Object.assign(new Error("Handover file exceeds 10 MB."), { status: 413 }),
    );
  if (rendering >= 2)
    return Promise.reject(
      Object.assign(
        new Error("Handover image processing is busy. Please retry shortly."),
        { status: 503 },
      ),
    );
  rendering++;
  return new Promise((resolve, reject) => {
    // Native image decoders run outside the API process so decoder crashes cannot stop it.
    const worker = fork(path.join(__dirname, "handoverImageWorker.cjs"), [], {
      serialization: "advanced",
      execArgv: ["--max-old-space-size=256"],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      windowsHide: true,
    });
    let done = false;
    let fallbackStarted = false;
    const finish = (error, pages) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      rendering--;
      worker.kill();
      if (error) reject(Object.assign(error, { status: error.status || 422 }));
      else resolve(pages);
    };
    const fallbackToInProcess = (workerError) => {
      if (fallbackStarted || process.env.HANDOVER_RENDER_FALLBACK === "false") return finish(workerError);
      fallbackStarted = true;
      console.warn(`Handover renderer worker stopped; using bounded in-process fallback: ${workerError.message}`);
      renderInProcess(buffer).then((pages) => finish(null, pages)).catch((error) => {
        error.message = `Handover image processing failed: ${error.message}`;
        finish(error);
      });
    };
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "Handover image processing timed out. Please use a smaller document.",
          ),
        ),
      30000,
    );
    worker.once("message", (result) =>
      result.error
        ? finish(new Error(result.error))
        : finish(null, result.pages),
    );
    worker.once("error", fallbackToInProcess);
    worker.once("exit", (code, signal) => {
      if (!done)
        fallbackToInProcess(new Error(`Handover image processing stopped (${signal || code || "unknown"}).`));
    });
    worker.send({ buffer });
  });
};
const createHandoverSupportingDocuments = (config) => {
  const savedPaths = [];
  const cleanup = async () => {
    await Promise.all(savedPaths.map((p) => safeUnlink(p)));
  };
  const save = async (db, req, installationId, fileName, pages) => {
    let created=0;
    const [assets] = await db.query(
      "SELECT a.id,a.subsidiary_id,i.branch_id FROM hardware_assets a JOIN installations i ON i.id=a.installation_id WHERE a.installation_id=? AND a.status='Installed' AND a.deleted_at IS NULL ORDER BY a.id FOR UPDATE",
      [installationId],
    );
    const bytes =
      pages.reduce((n, p) => n + p.buffer.length, 0) * assets.length;
    if (bytes > 100 * 1024 * 1024)
      throw Object.assign(
        new Error(
          "Supporting images exceed 100 MB for this installation. Reduce the document size.",
        ),
        { status: 413 },
      );
    for (const asset of assets)
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const buffer = Buffer.from(page.buffer);
        const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
        const originalName = `${sanitizeOriginalName(fileName).slice(0, 180)} - page ${index + 1}.png`;
        const [[existing]] = await db.query(`SELECT id FROM uploaded_files
          WHERE related_entity_type='hardware_asset' AND related_entity_id=?
          AND file_category='handover_attachment' AND original_name=? AND checksum_sha256=?
          AND status='active' AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,[asset.id,originalName,checksum]);
        if(existing) continue;
        const storedName = `${crypto.randomUUID()}.png`;
        const relativePath = path.posix.join(
          "organizations",
          asset.subsidiary_id,
          "handover",
          "hardware_asset",
          asset.id,
          "images",
          "original",
          storedName,
        );
        const absolute = await safeMkdirForRelativePath(relativePath, config);
        try {
          await fs.writeFile(absolute, buffer, { flag: "wx", mode: 0o640 });
        } catch (error) {
          if (error.code !== "EEXIST") await safeUnlink(absolute);
          throw error;
        }
        savedPaths.push(absolute);
        const [result] = await db.query(
          `INSERT INTO uploaded_files (organization_id,branch_id,uploaded_by,original_name,stored_name,relative_path,mime_type,detected_mime_type,extension,file_size,file_category,related_entity_type,related_entity_id,visibility,status,checksum_sha256,image_width,image_height) VALUES (?,?,?,?,?,?,'image/png','image/png','png',?,'handover_attachment','hardware_asset',?,'private','active',?,?,?)`,
          [
            asset.subsidiary_id,
            asset.branch_id,
            req.user.id,
            originalName,
            storedName,
            relativePath,
            buffer.length,
            asset.id,
            checksum,
            page.width,
            page.height,
          ],
        );
        created++;
        await logSuccess(db, req, {
          action: "HARDWARE_HANDOVER_IMAGE_CAPTURED",
          category: "files",
          module: "Inventory",
          entity_type: "hardware_asset",
          entity_id: asset.id,
          description:
            "Installation handover page captured as a private supporting image.",
          metadata: {
            file_id: result.insertId,
            installation_id: installationId,
            page: index + 1,
          },
        });
      }
    return created;
  };
  return { save, cleanup };
};
module.exports = { renderHandoverPages, createHandoverSupportingDocuments };
