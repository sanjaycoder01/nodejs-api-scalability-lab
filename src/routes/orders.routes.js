const express = require("express");
const { createOrdersController } = require("../controllers/orders.controller");

function createOrdersRoutes(ordersService) {
  const router = express.Router();
  const controller = createOrdersController(ordersService);

  // Static paths only — no /:id collision concerns.
  router.get("/", controller.getOrders);
  router.get("/with-product", controller.getOrdersUnwound);
  router.get("/delivered", controller.getDeliveredTotals);
  router.get("/pending", controller.getPendingOrders);
  return router;
}

module.exports = { createOrdersRoutes };
