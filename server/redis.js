const Redis = require("ioredis");
require("dotenv").config();

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
});

redis.on("connect", () => console.log("✅ Redis connected!"));
redis.on("error", (err) => console.error("❌ Redis error:", err.message));

module.exports = redis;