const pool = require("./db");
const { uploadToS3 } = require("./aws");

// ── Backup messages to S3 ──
async function backupMessages() {
  try {
    console.log("🔄 Starting DB backup...");

    const result = await pool.query(
      "SELECT * FROM messages ORDER BY created_at DESC LIMIT 1000"
    );

    const backup = {
      timestamp: new Date().toISOString(),
      total: result.rows.length,
      messages: result.rows,
    };

    const key = `backups/messages-${new Date().toISOString().split("T")[0]}.json`;
    await uploadToS3(key, JSON.stringify(backup, null, 2));

    console.log(`✅ DB backup complete — ${result.rows.length} messages backed up`);
  } catch (err) {
    console.error("❌ Backup failed:", err.message);
  }
}

// ── Backup users to S3 ──
async function backupUsers() {
  try {
    const result = await pool.query(
      "SELECT id, username, email, avatar, created_at FROM users"
    );

    const backup = {
      timestamp: new Date().toISOString(),
      total: result.rows.length,
      users: result.rows,
    };

    const key = `backups/users-${new Date().toISOString().split("T")[0]}.json`;
    await uploadToS3(key, JSON.stringify(backup, null, 2));

    console.log(`✅ Users backup complete — ${result.rows.length} users backed up`);
  } catch (err) {
    console.error("❌ Users backup failed:", err.message);
  }
}

// ── Run full backup ──
async function runBackup() {
  await backupMessages();
  await backupUsers();
}

module.exports = { runBackup };