const fs = require("node:fs");
const path = require("node:path");
const pool = require("../db");
async function main() {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "../migrations/20261014_equipment_serial_requirements.sql",
    ),
    "utf8",
  );
  try {
    await pool.query(sql);
    console.log(
      "Equipment serial requirements table is ready. Existing inventory and installations were preserved.",
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
