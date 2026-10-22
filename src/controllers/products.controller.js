function createProductsController(productsService) {
  async function getProductById(req, res, next) {
    try {
      const product = await productsService.getProductById(req.params.id);

      if (!product) {
        return res.status(404).json({
          message: "Product not found",
        });
      }

      res.json(product);
    } catch (error) {
      next(error);
    }
  }

  async function getProducts(req, res, next) {
    try {
      const offset = Number(req.query.offset ?? 0);
      const limit = Number(req.query.limit ?? 500);

      if (
        !Number.isInteger(offset) ||
        !Number.isInteger(limit) ||
        offset < 0 ||
        limit < 1 ||
        limit > 500
      ) {
        return res.status(400).json({
          message: "Invalid offset or limit",
        });
      }

      const products = await productsService.getProducts(offset, limit);

      res.json({
        offset,
        limit,
        count: products.length,
        data: products,
      });
    } catch (error) {
      next(error);
    }
  }

  async function createProduct(req, res, next) {
    try {
      const product = await productsService.createProduct(req.body);
      res.status(201).json(product);
    } catch (error) {
      if (error.statusCode === 400 || error.statusCode === 409) {
        return res.status(error.statusCode).json({
          message: error.message,
          ...(error.errors ? { errors: error.errors } : {}),
        });
      }
      next(error);
    }
  }

  return { getProductById, getProducts, createProduct };
}

module.exports = { createProductsController };
