const {
  getProductsCollection,
  PRODUCT_PROJECTION,
  LIST_PROJECTION,
  validateProductInput,
  buildProductDocument,
  buildSearchFilter,
  buildTextSearchFilter,
  buildListFilter,
} = require("../models/products.model");

/**
 * Cursor (keyset) pagination:
 * - Pages are ordered by productId ascending (stable, indexed).
 * - Page 1: no cursor → first `limit` rows.
 * - Later pages: cursor = last productId from the previous page →
 *   only rows with productId > cursor.
 * - nextCursor is null when the page is not full (no more results).
 *
 * This avoids MongoDB skip()/offset, which gets slower on deep pages.
 */
function createProductsService(db) {
  const products = getProductsCollection(db);

  async function getProductById(id) {
    return products.findOne(
      { productId: id },
      { projection: PRODUCT_PROJECTION }
    );
  }

  /**
   * Shared find for list + search.
   * @param {object} filter Mongo filter (category, $text, regex, …)
   * @param {string} [cursor] Exclusive lower bound on productId
   * @param {number} limit Page size
   */
  async function findPage({ filter = {}, cursor, limit }) {
    const query = { ...filter };

    // Keyset: resume strictly after the last id from the previous page.
    if (cursor) {
      query.productId = { $gt: cursor };
    }

    const data = await products
      .find(query)
      .project(LIST_PROJECTION)
      .sort({ productId: 1 })
      .limit(limit)
      .toArray();

    const nextCursor =
      data.length === limit ? data[data.length - 1].productId : null;

    return { data, nextCursor };
  }

  async function getProducts({
    limit = 20,
    cursor,
    category,
    minPrice,
    maxPrice,
  } = {}) {
    const filter = buildListFilter({ category, minPrice, maxPrice });
    return findPage({ filter, cursor, limit });
  }

  /**
   * Search uses the same productId cursor as list so clients paginate
   * one way for every collection endpoint.
   *
   * mode=text  → $text / idx_text_search (default)
   * mode=regex → case-insensitive $regex on name|category|description
   *              (intentionally slower; kept for lab comparisons)
   */
  async function searchProducts({
    q,
    limit = 20,
    cursor,
    mode = "text",
  } = {}) {
    const filter =
      mode === "text" ? buildTextSearchFilter(q) : buildSearchFilter(q);

    return findPage({ filter, cursor, limit });
  }

  /**
   * One row per category: total product count and average price.
   * Sorted by totalProducts descending.
   */
  async function getCategoryAnalytics() {
    const rows = await products
      .aggregate([
        { $match: { price: { $gte: 0 } } },
        {
          $group: {
            _id: "$category",
            totalProducts: { $sum: 1 },
            averagePrice: { $avg: "$price" },
          },
        },
        { $sort: { totalProducts: -1 } },
      ])
      .toArray();

    return rows.map((row) => ({
      category: row._id,
      totalProducts: row.totalProducts,
      averagePrice: Math.round(row.averagePrice * 100) / 100,
    }));
  }

  async function createProduct(input) {
    const validation = validateProductInput(input);

    if (!validation.ok) {
      const error = new Error(validation.errors.join("; "));
      error.statusCode = 400;
      error.errors = validation.errors;
      throw error;
    }

    const doc = buildProductDocument(input);

    try {
      await products.insertOne(doc);
    } catch (error) {
      if (error.code === 11000) {
        const duplicate = new Error(
          `Product with productId "${doc.productId}" already exists`
        );
        duplicate.statusCode = 409;
        throw duplicate;
      }
      throw error;
    }

    const { _id, ...product } = doc;
    return product;
  }

  return {
    getProductById,
    getProducts,
    searchProducts,
    getCategoryAnalytics,
    createProduct,
  };
}

module.exports = { createProductsService };
