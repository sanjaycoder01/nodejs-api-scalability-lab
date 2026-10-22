const express = require("express");
const {
  createProductsController,
} = require("../controllers/products.controller");

function createProductsRoutes(productsService) {
  const router = express.Router();
  const controller = createProductsController(productsService);

  router.get("/", controller.getProducts);
  router.post("/", controller.createProduct);
  router.get("/:id", controller.getProductById);

  return router;
}

module.exports = { createProductsRoutes };
