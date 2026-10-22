const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI, {
  maxPoolSize: 50,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
});

async function connectDB() {
  await client.connect();

  const db = client.db(process.env.MONGODB_DB);

  await db.command({ ping: 1 });

  console.log("MongoDB connected successfully");

  return db;
}

module.exports = { connectDB, client };
