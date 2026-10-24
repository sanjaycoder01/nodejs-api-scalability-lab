const { DEFAULT_LIMIT, MAX_LIMIT } = require("../models/products.model");

function parseLimit(raw) {
  return Number(raw ?? DEFAULT_LIMIT);
}

function parseOptionalNumber(raw, name) {
  if (raw === undefined) return { value: undefined };
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { error: `Invalid ${name}` };
  }
  return { value };
}

/**
 * Cursor is optional (omit on first page).
 * If `cursor` is present it must be a non-empty string (last productId).
 * `offset` is rejected — use cursor instead.
 */
function parseCursorPagination(query) {
  if (Object.prototype.hasOwnProperty.call(query, "offset")) {
    return {
      error:
        "offset pagination is not supported; use cursor (pass nextCursor from the previous response)",
    };
  }

  const limit = parseLimit(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { error: "Invalid limit" };
  }

  const cursorProvided = Object.prototype.hasOwnProperty.call(query, "cursor");
  if (!cursorProvided) {
    return { limit, cursor: undefined };
  }

  const cursor = String(query.cursor).trim();
  if (!cursor) {
    return { error: "Invalid cursor" };
  }

  return { limit, cursor };
}

function createProductsController(productsService) {
  async function getProductById(req, res, next) {
    try {
      const product = await productsService.getProductById(req.params.id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      next(error);
    }
  }

  async function getProducts(req, res, next) {
    try {
      const pagination = parseCursorPagination(req.query);
      if (pagination.error) {
        return res.status(400).json({ message: pagination.error });
      }

      const category =
        typeof req.query.category === "string" && req.query.category.trim()
          ? req.query.category.trim()
          : undefined;

      const minParsed = parseOptionalNumber(req.query.minPrice, "minPrice");
      if (minParsed.error) {
        return res.status(400).json({ message: minParsed.error });
      }
      const maxParsed = parseOptionalNumber(req.query.maxPrice, "maxPrice");
      if (maxParsed.error) {
        return res.status(400).json({ message: maxParsed.error });
      }

      const minPrice = minParsed.value;
      const maxPrice = maxParsed.value;

      if (
        minPrice !== undefined &&
        maxPrice !== undefined &&
        minPrice > maxPrice
      ) {
        return res.status(400).json({
          message: "minPrice cannot be greater than maxPrice",
        });
      }

      if ((minPrice !== undefined || maxPrice !== undefined) && !category) {
        return res.status(400).json({
          message: "category is required when using minPrice or maxPrice",
        });
      }

      const { data, nextCursor } = await productsService.getProducts({
        cursor: pagination.cursor,
        limit: pagination.limit,
        category,
        minPrice,
        maxPrice,
      });

      res.json({
        limit: pagination.limit,
        count: data.length,
        nextCursor,
        ...(category ? { category } : {}),
        ...(minPrice !== undefined ? { minPrice } : {}),
        ...(maxPrice !== undefined ? { maxPrice } : {}),
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async function searchProducts(req, res, next) {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

      if (!q) {
        return res.status(400).json({
          message: "Query parameter q is required",
        });
      }

      if (q.length > 100) {
        return res.status(400).json({
          message: "Query parameter q must be at most 100 characters",
        });
      }

      const modeRaw =
        typeof req.query.mode === "string" ? req.query.mode.trim() : "text";
      const mode =
        modeRaw === "text" ? "text" : modeRaw === "regex" ? "regex" : null;

      if (!mode) {
        return res.status(400).json({
          message: 'Invalid mode. Allowed: "regex", "text"',
        });
      }

      const pagination = parseCursorPagination(req.query);
      if (pagination.error) {
        return res.status(400).json({ message: pagination.error });
      }

      // Same cursor contract as GET /products: omit cursor on page 1,
      // then pass nextCursor until it comes back null.
      const { data, nextCursor } = await productsService.searchProducts({
        q,
        mode,
        cursor: pagination.cursor,
        limit: pagination.limit,
      });

      res.json({
        q,
        mode,
        limit: pagination.limit,
        count: data.length,
        nextCursor,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async function getCategories(req, res, next) {
    try {
      const data = await productsService.getCategoryAnalytics();
      res.json({ count: data.length, data });
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

  return {
    getProductById,
    getProducts,
    searchProducts,
    getCategories,
    createProduct,
  };
}

module.exports = { createProductsController };
