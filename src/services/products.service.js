const {
  getProductsCollection,
  PRODUCT_PROJECTION,
  validateProductInput,
  buildProductDocument,
} = require("../models/products.model");

function createProductsService(db) {
  const products = getProductsCollection(db);

  async function getProductById(id) {
    return products.findOne({ productId: id });
  }

  async function getProducts(offset = 0, limit = 500) {
    return products
      .find({})
      .project(PRODUCT_PROJECTION)
      .skip(offset)
      .limit(limit)
      .toArray();
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

  return { getProductById, getProducts, createProduct };
}

module.exports = { createProductsService };
