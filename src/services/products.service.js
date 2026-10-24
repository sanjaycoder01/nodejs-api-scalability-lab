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

function createProductsService(db) {
  const products = getProductsCollection(db);

  async function getProductById(id) {
    return products.findOne({ productId: id }, { projection: PRODUCT_PROJECTION });
  }

  async function queryProducts({
    filter = {},
    offset,
    limit,
    cursor,
    sort = { productId: 1 },
    projection = LIST_PROJECTION,
  } = {}) {
    const query = { ...filter };

    if (cursor) {
      query.productId = query.productId
        ? { ...query.productId, $gt: cursor }
        : { $gt: cursor };
    }

    let cursorQuery = products
      .find(query)
      .project(projection)
      .sort(sort)
      .limit(limit);

    if (!cursor && Number.isInteger(offset) && offset > 0) {
      cursorQuery = cursorQuery.skip(offset);
    }

    const data = await cursorQuery.toArray();
    const nextCursor =
      data.length === limit ? data[data.length - 1].productId : null;

    return { data, nextCursor };
  }

  async function getProducts({
    offset = 0,
    limit = 20,
    cursor,
    category,
    minPrice,
    maxPrice,
    sort,
  } = {}) {
    const filter = buildListFilter({ category, minPrice, maxPrice });
    return queryProducts({
      filter,
      offset,
      limit,
      cursor,
      sort: sort || { productId: 1 },
      projection: LIST_PROJECTION,
    });
  }

  async function searchProducts({
    q,
    offset = 0,
    limit = 20,
    cursor,
    mode = "text",
  } = {}) {
    const filter =
      mode === "text" ? buildTextSearchFilter(q) : buildSearchFilter(q);

    // $text + sort by productId forces a large fetch+sort. Prefer textScore
    // when not using a productId cursor.
    const sort =
      mode === "text" && !cursor
        ? { score: { $meta: "textScore" } }
        : { productId: 1 };

    return queryProducts({
      filter,
      offset,
      limit,
      cursor,
      sort,
      projection: LIST_PROJECTION,
    });
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

  return { getProductById, getProducts, searchProducts, createProduct };
}

module.exports = { createProductsService };
