const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

redisClient.on("error", (error) => {
  console.error("Redis error:", error.message);
});

async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("Redis connected successfully");
  }
  return redisClient;
}

async function disconnectRedis() {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
}

module.exports = {
  redisClient,
  connectRedis,
  disconnectRedis,
};
