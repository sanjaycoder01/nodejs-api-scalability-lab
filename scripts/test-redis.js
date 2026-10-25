/**
 * Smoke-test Redis connectivity (Phase 3 step 4).
 *
 * Usage:
 *   npm run redis:up
 *   npm run test:redis
 */
require("dotenv").config();

const { redisClient, connectRedis, disconnectRedis } = require("../src/config/redis");

async function main() {
  try {
    await connectRedis();

    await redisClient.set("scalability:test", "connected");
    const value = await redisClient.get("scalability:test");

    console.log("Redis connection successful:", value);
  } finally {
    await disconnectRedis();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
