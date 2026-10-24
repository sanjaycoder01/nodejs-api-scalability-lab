const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function parseLimit(raw) {
  const value = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    return { error: `Invalid limit (1–${MAX_LIMIT})` };
  }
  return { value };
}

function createOrdersController(ordersService) {
  async function getOrders(req, res, next) {
    try {
      const limit = parseLimit(req.query.limit);
      if (limit.error) {
        return res.status(400).json({ message: limit.error });
      }

      const data = await ordersService.listOrdersWithProducts({
        limit: limit.value,
      });
      res.json({ limit: limit.value, count: data.length, data });
    } catch (error) {
      next(error);
    }
  }

  async function getOrdersUnwound(req, res, next) {
    try {
      const limit = parseLimit(req.query.limit);
      if (limit.error) {
        return res.status(400).json({ message: limit.error });
      }

      const data = await ordersService.listOrdersUnwound({
        limit: limit.value,
      });
      res.json({ limit: limit.value, count: data.length, data });
    } catch (error) {
      next(error);
    }
  }

  async function getDeliveredTotals(req, res, next) {
    try {
      const limit = parseLimit(req.query.limit);
      if (limit.error) {
        return res.status(400).json({ message: limit.error });
      }

      const data = await ordersService.listDeliveredOrderTotals({
        limit: limit.value,
      });
      res.json({ limit: limit.value, count: data.length, data });
    } catch (error) {
      next(error);
    }
  }

  async function getPendingOrders(req, res, next) {
    try {
      const limit = parseLimit(req.query.limit);
      if (limit.error) {
        return res.status(400).json({ message: limit.error });
      }

      const data = await ordersService.getPendingOrders({
        limit: limit.value,
      });
      res.json({ limit: limit.value, count: data.length, data });
    } catch (error) {
      next(error);
    }
  }

  return { getOrders, getOrdersUnwound, getDeliveredTotals, getPendingOrders };
}

module.exports = { createOrdersController };
