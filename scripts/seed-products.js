/**
 * Insert 500 sample products for local testing.
 * Clears the products collection first so re-runs are safe.
 * Usage: npm run seed
 */
require("dotenv").config();

const { MongoClient } = require("mongodb");
const {
  getProductsCollection,
  ensureProductIndexes,
  buildProductDocument,
} = require("../src/models/products.model");

const COUNT = 500;
const CATEGORIES = [
  "electronics",
  "clothing",
  "home",
  "sports",
  "books",
  "toys",
];

function buildProducts(count) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const category = CATEGORIES[i % CATEGORIES.length];

    return buildProductDocument({
      productId: `prod-${String(n).padStart(3, "0")}`,
      name: `Product ${n}`,
      category,
      price: Number((9.99 + (n % 50) * 2.5).toFixed(2)),
      description: `Sample ${category} item number ${n}`,
      inStock: n % 7 !== 0,
    });
  });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri || !dbName) {
    console.error("MONGODB_URI and MONGODB_DB must be set in .env");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    await ensureProductIndexes(db);

    const products = getProductsCollection(db);
    const deleted = await products.deleteMany({});
    console.log(`Cleared ${deleted.deletedCount} existing products.`);

    const docs = buildProducts(COUNT);
    const result = await products.insertMany(docs, { ordered: false });

    const total = await products.countDocuments();
    console.log(`Inserted ${result.insertedCount} products.`);
    console.log(`Collection now has ${total} documents.`);
    console.log(`Sample ids: ${docs[0].productId} … ${docs[docs.length - 1].productId}`);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
