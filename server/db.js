const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || "foreseesnetwork",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  options: '-c timezone=Asia/Kolkata',
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ DB connection error:", err.message);
  } else {
    console.log("✅ DB connected successfully!");
    release();
  }
});

module.exports = pool;