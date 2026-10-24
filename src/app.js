const express = require("express");
const { createProductsService } = require("./services/products.service");
const { createProductsRoutes } = require("./routes/products.routes");
const { createOrdersService } = require("./services/orders.service");
const { createOrdersRoutes } = require("./routes/orders.routes");

function createApp(db) {
  const app = express();

  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const productsService = createProductsService(db);
  const ordersService = createOrdersService(db);

  app.use("/products", createProductsRoutes(productsService));
  app.use("/orders", createOrdersRoutes(ordersService));

  app.use((err, req, res, next) => {
    console.error(err);

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({ message: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
