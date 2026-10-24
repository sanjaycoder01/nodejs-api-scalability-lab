const { getOrdersCollection } = require("../models/orders.model");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function clampLimit(limit) {
  const n = Number.isInteger(limit) ? limit : DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}

/**
 * Orders ↔ products join lab ($lookup).
 *
 * Join key: orders.productId === products.productId
 * (products already has unique idx_productId_unique — that is what
 * Mongo uses on the foreign side of the lookup.)
 */
function createOrdersService(db) {
  const orders = getOrdersCollection(db);

  /** Orders + matching products in `productDetails` (always an array). */
  async function listOrdersWithProducts({ limit = DEFAULT_LIMIT } = {}) {
    const pageSize = clampLimit(limit);

    return orders
      .aggregate([
        { $limit: pageSize },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "productId",
            as: "productDetails",
          },
        },
        { $project: { _id: 0 } },
      ])
      .toArray();
  }

  /**
   * Same join, but $unwind turns productDetails into one object.
   * preserveNullAndEmptyArrays keeps orders whose product is missing.
   */
  async function listOrdersUnwound({ limit = DEFAULT_LIMIT } = {}) {
    const pageSize = clampLimit(limit);

    return orders
      .aggregate([
        { $limit: pageSize },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "productId",
            as: "productDetails",
          },
        },
        {
          $unwind: {
            path: "$productDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            orderId: 1,
            productId: 1,
            customerId: 1,
            quantity: 1,
            status: 1,
            productDetails: {
              productId: "$productDetails.productId",
              name: "$productDetails.name",
              category: "$productDetails.category",
              price: "$productDetails.price",
            },
          },
        },
      ])
      .toArray();
  }

  /**
   * Delivered orders with line total = price × quantity.
   * $match runs first so $lookup only joins the filtered subset.
   */
  async function listDeliveredOrderTotals({ limit = DEFAULT_LIMIT } = {}) {
    const pageSize = clampLimit(limit);

    return orders
      .aggregate([
        { $match: { status: "delivered" } },
        { $limit: pageSize },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "productId",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $addFields: {
            totalPrice: {
              $multiply: ["$product.price", "$quantity"],
            },
          },
        },
        {
          $project: {
            _id: 0,
            orderId: 1,
            customerId: 1,
            productName: "$product.name",
            quantity: 1,
            unitPrice: "$product.price",
            totalPrice: 1,
            status: 1,
          },
        },
      ])
      .toArray();
  }

  /** Pending orders joined to product (same pattern as delivered totals). */
  async function getPendingOrders({ limit = DEFAULT_LIMIT } = {}) {
    const pageSize = clampLimit(limit);

    return orders
      .aggregate([
        { $match: { status: "pending" } },
        { $limit: pageSize },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "productId",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            _id: 0,
            orderId: 1,
            productId: 1,
            productName: "$product.name",
            price: "$product.price",
            quantity: 1,
          },
        },
      ])
      .toArray();
  }

  return {
    listOrdersWithProducts,
    listOrdersUnwound,
    listDeliveredOrderTotals,
    getPendingOrders,
  };
}

module.exports = { createOrdersService };
