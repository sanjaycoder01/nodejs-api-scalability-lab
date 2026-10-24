/**
 * Seed products in batches (default: 1,000,000).
 *
 * Safety: does NOT clear the collection unless --clear (or SEED_CLEAR=1).
 * Resume: if documents already exist, continues from the next productId.
 *
 * Usage:
 *   npm run seed
 *   npm run seed -- --count=100000
 *   npm run seed:clear
 */
require("dotenv").config();

const { MongoClient } = require("mongodb");
const {
  getProductsCollection,
  ensureProductIndexes,
  buildProductDocument,
} = require("../src/models/products.model");

const DEFAULT_COUNT = 1_000_000;
const DEFAULT_BATCH = 5_000;

const CATEGORIES = [
  "electronics",
  "clothing",
  "home",
  "sports",
  "books",
  "toys",
];

const SEARCH_TERMS = ["phone", "laptop", "shoes", "chair", "novel", "puzzle"];

function parseArgs(argv) {
  const args = {
    clear: process.env.SEED_CLEAR === "1",
    count: Number(process.env.SEED_COUNT || DEFAULT_COUNT),
    batch: Number(process.env.SEED_BATCH || DEFAULT_BATCH),
  };

  for (const arg of argv) {
    if (arg === "--clear") {
      args.clear = true;
    } else if (arg.startsWith("--count=")) {
      args.count = Number(arg.slice("--count=".length));
    } else if (arg.startsWith("--batch=")) {
      args.batch = Number(arg.slice("--batch=".length));
    }
  }

  if (!Number.isInteger(args.count) || args.count < 1) {
    throw new Error("--count must be a positive integer");
  }
  if (!Number.isInteger(args.batch) || args.batch < 1 || args.batch > 50_000) {
    throw new Error("--batch must be an integer between 1 and 50000");
  }

  return args;
}

function formatProductId(n) {
  return `prod-${String(n).padStart(7, "0")}`;
}

function parseProductNumber(productId) {
  const match = /^prod-(\d+)$/.exec(productId || "");
  return match ? Number(match[1]) : 0;
}

function buildProduct(n) {
  const category = CATEGORIES[(n - 1) % CATEGORIES.length];
  const term = SEARCH_TERMS[(n - 1) % SEARCH_TERMS.length];
  // Sprinkle searchable terms into names for later search benchmarks.
  const name =
    n % 20 === 0
      ? `${term} Product ${n}`
      : `Product ${n}`;

  return buildProductDocument({
    productId: formatProductId(n),
    name,
    category,
    price: Number((9.99 + (n % 50) * 2.5).toFixed(2)),
    description: `Sample ${category} ${term} item number ${n}`,
    inStock: n % 7 !== 0,
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = (seconds % 60).toFixed(1);
  return `${minutes}m ${rem}s`;
}

async function getMaxProductNumber(products) {
  // Numeric max so mixed paddings (prod-001 vs prod-0000001) resume correctly.
  const [row] = await products
    .aggregate([
      {
        $project: {
          n: {
            $convert: {
              input: { $substrBytes: ["$productId", 5, 20] },
              to: "int",
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      { $group: { _id: null, max: { $max: "$n" } } },
    ])
    .toArray();

  return row?.max || 0;
}

async function printStorageStats(db, products) {
  const count = await products.estimatedDocumentCount();
  let stats;

  try {
    stats = await db.command({ collStats: products.collectionName });
  } catch {
    stats = null;
  }

  console.log("--- collection stats ---");
  console.log(`documents: ${count.toLocaleString()}`);
  if (stats) {
    console.log(`storageSize: ${formatBytes(stats.storageSize)}`);
    console.log(`totalIndexSize: ${formatBytes(stats.totalIndexSize)}`);
    console.log(
      `size (data): ${formatBytes(stats.size)} | avgObjSize: ${formatBytes(stats.avgObjSize)}`
    );
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri || !dbName) {
    console.error("MONGODB_URI and MONGODB_DB must be set in .env");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  const startedAt = Date.now();

  try {
    await client.connect();
    const db = client.db(dbName);
    const products = getProductsCollection(db);

    console.log(
      `Seed target=${args.count.toLocaleString()} batch=${args.batch.toLocaleString()} clear=${args.clear}`
    );

    if (args.clear) {
      const deleted = await products.deleteMany({});
      console.log(`Cleared ${deleted.deletedCount.toLocaleString()} existing products.`);
    }

    await ensureProductIndexes(db);

    const existingCount = await products.estimatedDocumentCount();
    const maxNumber = await getMaxProductNumber(products);

    if (!args.clear && existingCount >= args.count) {
      console.log(
        `Collection already has ${existingCount.toLocaleString()} docs (>= target). Nothing to do.`
      );
      console.log("Re-run with --clear (npm run seed:clear) to wipe and reseed.");
      await printStorageStats(db, products);
      return;
    }

    const startNumber = Math.max(maxNumber, 0) + 1;
    const endNumber = args.count;

    if (startNumber > endNumber) {
      console.log("Nothing to insert (start > target).");
      await printStorageStats(db, products);
      return;
    }

    console.log(
      `Inserting productIds ${formatProductId(startNumber)} … ${formatProductId(endNumber)}`
    );
    if (existingCount > 0 && !args.clear) {
      console.log(
        `Resuming with ${existingCount.toLocaleString()} docs already present.`
      );
    }

    let inserted = 0;
    let batchNum = 0;

    for (let from = startNumber; from <= endNumber; from += args.batch) {
      const to = Math.min(from + args.batch - 1, endNumber);
      const docs = [];
      for (let n = from; n <= to; n += 1) {
        docs.push(buildProduct(n));
      }

      batchNum += 1;
      const result = await products.insertMany(docs, { ordered: false });
      inserted += result.insertedCount;

      const elapsed = Date.now() - startedAt;
      const remaining = endNumber - to;
      const rate = inserted / (elapsed / 1000);
      const eta =
        rate > 0 ? formatDuration((remaining / rate) * 1000) : "n/a";

      console.log(
        `batch ${batchNum}: inserted ${result.insertedCount.toLocaleString()} ` +
          `(${formatProductId(from)}…${formatProductId(to)}) | ` +
          `total new ${inserted.toLocaleString()} | ` +
          `${rate.toFixed(0)} docs/s | eta ${eta}`
      );
    }

    const elapsed = Date.now() - startedAt;
    const finalCount = await products.estimatedDocumentCount();

    console.log("--- seed complete ---");
    console.log(`inserted this run: ${inserted.toLocaleString()}`);
    console.log(`elapsed: ${formatDuration(elapsed)}`);
    console.log(
      `avg rate: ${(inserted / (elapsed / 1000)).toFixed(0)} docs/s`
    );
    console.log(`collection count: ${finalCount.toLocaleString()}`);
    await printStorageStats(db, products);
  } catch (error) {
    if (error.code === 11000 || error.writeErrors) {
      console.error(
        "Duplicate productId during seed. Use --clear or resume from a higher id."
      );
    }
    console.error("Seed failed:", error.message || error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
