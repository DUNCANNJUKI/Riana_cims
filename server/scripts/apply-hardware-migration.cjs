const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "../../.env.local") });
const pool = require("../db");
const { createDatabaseBackup } = require("../services/databaseBackup");

async function run() {
  const first = (...names) =>
    names
      .map((name) => process.env[name])
      .find((value) => value !== undefined && value !== "");
  const host = first("DATABASE_HOST", "DB_HOST") || "localhost";
  if (
    !process.argv.includes("--apply-local") ||
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "::1"].includes(host)
  )
    throw new Error(
      "This command requires --apply-local and a local development database. Apply the reviewed SQL separately during an approved production rollout.",
    );
  const database = first("DATABASE_NAME", "DB_NAME") || "riana_cims";
  const migrationId = "20261012_hardware_inventory";
  const connection = await mysql.createConnection({
    host,
    database,
    user: first("DATABASE_USER", "DB_USER") || "root",
    password: first("DATABASE_PASSWORD", "DB_PASSWORD", "DB_PASS") || "",
    port: Number(first("DATABASE_PORT", "DB_PORT") || 3306),
    multipleStatements: true,
  });
  const lockName = `hardware_migration_${crypto.createHash("sha256").update(database).digest("hex").slice(0, 32)}`;
  try {
    const [[lock]] = await connection.query(
      "SELECT GET_LOCK(?,30) AS acquired",
      [lockName],
    );
    if (!lock.acquired)
      throw new Error("Another hardware migration is running.");
    const [[historyTable]] = await connection.query(
      "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='migration_history'",
    );
    if (historyTable.total) {
      const [[applied]] = await connection.query(
        "SELECT COUNT(*) AS total FROM migration_history WHERE migration_id=?",
        [migrationId],
      );
      if (applied.total) {
        console.log(
          JSON.stringify({ migration: migrationId, alreadyApplied: true }),
        );
        return;
      }
    }
    const allowedRoles = [
      "SuperAdmin",
      "Admin",
      "Management",
      "Finance",
      "Developer",
      "Teamlead",
      "Sales",
      "User",
      "InventoryOfficer",
    ];
    const [roles] = await connection.query(
      "SELECT DISTINCT role FROM user_profiles",
    );
    if (roles.some((row) => !allowedRoles.includes(row.role)))
      throw new Error(
        "Unexpected existing role. Review the enum extension before applying.",
      );
    const counts = async () => {
      const result = {};
      for (const table of [
        "clients",
        "installations",
        "client_assignments",
        "handover_uploads",
        "user_profiles",
      ]) {
        const [[row]] = await connection.query(
          `SELECT COUNT(*) AS total FROM ${table}`,
        );
        result[table] = Number(row.total);
      }
      return result;
    };
    const before = await counts();
    // Reuse the existing consistent-snapshot backup, including its DB_NAME alias through this assignment.
    process.env.DATABASE_NAME = database;
    const backup = await createDatabaseBackup(pool);
    if (backup.status !== "success" || !backup.tableCount)
      throw new Error("A verified nonempty backup is required.");
    const backupPath = path.join(__dirname, "../backups", backup.fileName);
    const backupSha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(backupPath))
      .digest("hex");
    await connection.query(
      fs.readFileSync(
        path.join(__dirname, "../migrations", `${migrationId}.sql`),
        "utf8",
      ),
    );
    await connection.query(
      "CREATE TABLE IF NOT EXISTS migration_history (migration_id VARCHAR(100) PRIMARY KEY,description VARCHAR(255) NOT NULL,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );
    await connection.query(
      "INSERT INTO migration_history (migration_id,description) VALUES (?,?)",
      [migrationId, "Additive Marezi hardware and inventory lifecycle schema"],
    );
    const after = await counts();
    console.log(
      JSON.stringify({
        migration: migrationId,
        backup: backup.fileName,
        backupSha256,
        before,
        after,
        existingRowCountsPreserved:
          JSON.stringify(before) === JSON.stringify(after),
      }),
    );
  } finally {
    await connection
      .query("SELECT RELEASE_LOCK(?)", [lockName])
      .catch(() => {});
    await connection.end();
  }
}
run()
  .catch((error) => {
    console.error("Hardware migration failed:", error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
