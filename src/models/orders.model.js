const COLLECTION = "orders";

const ORDER_INDEXES = [
  {
    key: { orderId: 1 },
    options: { unique: true, name: "idx_orderId_unique" },
  },
  // Speeds filters on status and joins that start from orders.
  { key: { status: 1 }, options: { name: "idx_order_status" } },
  { key: { productId: 1 }, options: { name: "idx_order_productId" } },
];

function getOrdersCollection(db) {
  return db.collection(COLLECTION);
}

async function ensureOrderIndexes(db) {
  const orders = getOrdersCollection(db);

  for (const { key, options } of ORDER_INDEXES) {
    await orders.createIndex(key, options);
  }

  console.log("Order indexes ensured");
}

module.exports = {
  COLLECTION,
  getOrdersCollection,
  ensureOrderIndexes,
};
