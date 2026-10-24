require("dotenv").config();

const { connectDB, client } = require("./config/mongodb");
const { ensureProductIndexes } = require("./models/products.model");
const { ensureOrderIndexes } = require("./models/orders.model");
const { createApp } = require("./app");

async function startServer() {
  try {
    const db = await connectDB();
    await ensureProductIndexes(db);
    await ensureOrderIndexes(db);
    const app = createApp(db);

    const server = app.listen(process.env.PORT || 3000, () => {
      console.log(`API running on port ${process.env.PORT || 3000}`);
    });

    async function shutdown() {
      server.close(async () => {
        await client.close();
        process.exit(0);
      });
    }

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    console.error("Failed to start server:", error);
    await client.close().catch(() => {});
    process.exit(1);
  }
}

startServer();
