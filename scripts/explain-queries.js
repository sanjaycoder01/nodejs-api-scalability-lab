/**
 * Compare MongoDB execution plans for the lab's main query shapes.
 *
 * Usage:
 *   npm run explain
 *
 * Prints stage type, index used, docs examined vs returned, and millis.
 */
require("dotenv").config();

const { MongoClient } = require("mongodb");
const {
  getProductsCollection,
  buildSearchFilter,
  buildTextSearchFilter,
  buildListFilter,
  LIST_PROJECTION,
  PRODUCT_PROJECTION,
} = require("../src/models/products.model");

function walkStages(stage, acc = []) {
  if (!stage || typeof stage !== "object") return acc;
  if (stage.stage) acc.push(stage.stage);
  if (stage.inputStage) walkStages(stage.inputStage, acc);
  if (Array.isArray(stage.inputStages)) {
    for (const s of stage.inputStages) walkStages(s, acc);
  }
  if (stage.shards) {
    for (const shard of stage.shards) {
      if (shard.winningPlan) walkStages(shard.winningPlan, acc);
    }
  }
  return acc;
}

function summarizeExplain(label, explainDoc) {
  const stats = explainDoc.executionStats || {};
  const winning =
    explainDoc.queryPlanner?.winningPlan ||
    explainDoc.queryPlanner?.winningPlan?.inputStage ||
    {};
  const stages = walkStages(
    explainDoc.queryPlanner?.winningPlan || winning
  );
  const execStages = walkStages(stats.executionStages || {});

  const indexName =
    stats.executionStages?.indexName ||
    stats.executionStages?.inputStage?.indexName ||
    findIndexName(stats.executionStages) ||
    "(n/a)";

  return {
    label,
    stages: [...new Set([...stages, ...execStages])].join(" → ") || "(unknown)",
    index: indexName,
    nReturned: stats.nReturned ?? "(n/a)",
    docsExamined: stats.totalDocsExamined ?? "(n/a)",
    keysExamined: stats.totalKeysExamined ?? "(n/a)",
    millis: stats.executionTimeMillis ?? "(n/a)",
  };
}

function findIndexName(node) {
  if (!node || typeof node !== "object") return null;
  if (node.indexName) return node.indexName;
  for (const key of Object.keys(node)) {
    const found = findIndexName(node[key]);
    if (found) return found;
  }
  return null;
}

function printRow(row) {
  console.log(`\n=== ${row.label} ===`);
  console.log(`  stages:       ${row.stages}`);
  console.log(`  index:        ${row.index}`);
  console.log(`  nReturned:    ${row.nReturned}`);
  console.log(`  docsExamined: ${row.docsExamined}`);
  console.log(`  keysExamined: ${row.keysExamined}`);
  console.log(`  millis:       ${row.millis}`);
}

async function explainFind(products, label, filter, options = {}) {
  const cursor = products.find(filter, options);
  const explainDoc = await cursor.explain("executionStats");
  return summarizeExplain(label, explainDoc);
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
  const dbName = process.env.MONGODB_DB || "api_scalability_lab";

  const client = new MongoClient(uri);
  await client.connect();
  const products = getProductsCollection(client.db(dbName));

  const count = await products.estimatedDocumentCount();
  console.log(`Connected to ${dbName}.products (~${count} docs)`);
  console.log("Running explain(\"executionStats\") on lab query shapes…");

  const cases = [];

  cases.push(
    await explainFind(
      products,
      "get-by-id (productId)",
      { productId: "prod-0000001" },
      { projection: PRODUCT_PROJECTION, limit: 1 }
    )
  );

  cases.push(
    await explainFind(
      products,
      "list cursor page (productId > X, limit 20)",
      { productId: { $gt: "prod-0000100" } },
      {
        projection: LIST_PROJECTION,
        sort: { productId: 1 },
        limit: 20,
      }
    )
  );

  cases.push(
    await explainFind(
      products,
      "list offset deep skip (skip 100000, limit 20)",
      {},
      {
        projection: LIST_PROJECTION,
        sort: { productId: 1 },
        skip: 100_000,
        limit: 20,
      }
    )
  );

  cases.push(
    await explainFind(
      products,
      "category + price sorted by productId (weaker plan)",
      buildListFilter({
        category: "electronics",
        minPrice: 20,
        maxPrice: 50,
      }),
      {
        projection: LIST_PROJECTION,
        sort: { productId: 1 },
        limit: 20,
      }
    )
  );

  cases.push(
    await explainFind(
      products,
      "category + price sorted by category,price (idx_category_price)",
      buildListFilter({
        category: "electronics",
        minPrice: 20,
        maxPrice: 50,
      }),
      {
        projection: LIST_PROJECTION,
        sort: { category: 1, price: 1 },
        limit: 20,
      }
    )
  );

  cases.push(
    await explainFind(
      products,
      "search regex $or (mode=regex) — slow path",
      buildSearchFilter("phone"),
      {
        projection: LIST_PROJECTION,
        sort: { productId: 1 },
        limit: 20,
      }
    )
  );

  cases.push(
    await explainFind(
      products,
      "search $text sorted by productId (weaker plan)",
      buildTextSearchFilter("phone"),
      {
        projection: LIST_PROJECTION,
        sort: { productId: 1 },
        limit: 20,
      }
    )
  );

  cases.push(
    await explainFind(
      products,
      "search $text sorted by textScore (default path)",
      buildTextSearchFilter("phone"),
      {
        projection: LIST_PROJECTION,
        sort: { score: { $meta: "textScore" } },
        limit: 20,
      }
    )
  );

  for (const row of cases) printRow(row);

  console.log("\nTips:");
  console.log("  - Prefer IXSCAN / TEXT over COLLSCAN");
  console.log("  - docsExamined should be close to nReturned for selective queries");
  console.log("  - Deep skip examines many keys even with an index — use cursor instead");
  console.log("  - Re-run after index or query changes, then compare with npm run k6:baseline");

  await client.close();
}

main().catch((err) => {
  console.error("explain failed:", err.message);
  process.exit(1);
});
