const {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  resolveSort,
} = require("../models/products.model");

function parseLimit(raw) {
  return Number(raw ?? DEFAULT_LIMIT);
}

function parseOffset(raw) {
  return Number(raw ?? 0);
}

function parseOptionalNumber(raw, name) {
  if (raw === undefined) return { value: undefined };
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { error: `Invalid ${name}` };
  }
  return { value };
}

function validatePagination({ offset, limit, cursor, cursorProvided }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return "Invalid limit";
  }

  if (cursorProvided) {
    if (typeof cursor !== "string" || cursor.trim().length === 0) {
      return "Invalid cursor";
    }
    return null;
  }

  if (!Number.isInteger(offset) || offset < 0) {
    return "Invalid offset";
  }

  return null;
}

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
      const cursorProvided = Object.prototype.hasOwnProperty.call(
        req.query,
        "cursor"
      );
      const cursor = cursorProvided ? String(req.query.cursor) : undefined;
      const offset = parseOffset(req.query.offset);
      const limit = parseLimit(req.query.limit);

      const paginationError = validatePagination({
        offset,
        limit,
        cursor,
        cursorProvided,
      });
      if (paginationError) {
        return res.status(400).json({ message: paginationError });
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

      const sortResolved = resolveSort(req.query.sort);
      if (sortResolved.error) {
        return res.status(400).json({ message: sortResolved.error });
      }

      if (cursorProvided && !sortResolved.supportsCursor) {
        return res.status(400).json({
          message:
            "cursor pagination requires sort=productId (default). Use offset with other sort values.",
        });
      }

      // No explicit sort + category filter → order by category/price so
      // idx_category_price can be used (productId sort blocks that index).
      const sortProvided =
        typeof req.query.sort === "string" && req.query.sort.trim().length > 0;
      let listSort = sortResolved.sort;
      let listSortKey = sortResolved.key;
      if (!cursorProvided && category && !sortProvided) {
        listSort = { category: 1, price: 1 };
        listSortKey = "category,price";
      }

      const { data, nextCursor } = await productsService.getProducts(
        cursorProvided
          ? {
              cursor: cursor.trim(),
              limit,
              category,
              minPrice,
              maxPrice,
              sort: listSort,
            }
          : {
              offset,
              limit,
              category,
              minPrice,
              maxPrice,
              sort: listSort,
            }
      );

      const meta = {
        limit,
        count: data.length,
        nextCursor,
        sort: listSortKey,
        ...(category ? { category } : {}),
        ...(minPrice !== undefined ? { minPrice } : {}),
        ...(maxPrice !== undefined ? { maxPrice } : {}),
        data,
      };

      if (cursorProvided) {
        return res.json(meta);
      }

      res.json({ offset, ...meta });
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
      const mode = modeRaw === "text" ? "text" : modeRaw === "regex" ? "regex" : null;

      if (!mode) {
        return res.status(400).json({
          message: 'Invalid mode. Allowed: "regex", "text"',
        });
      }

      const cursorProvided = Object.prototype.hasOwnProperty.call(
        req.query,
        "cursor"
      );
      const cursor = cursorProvided ? String(req.query.cursor) : undefined;
      const offset = parseOffset(req.query.offset);
      const limit = parseLimit(req.query.limit);

      const validationError = validatePagination({
        offset,
        limit,
        cursor,
        cursorProvided,
      });

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const { data, nextCursor } = await productsService.searchProducts(
        cursorProvided
          ? { q, cursor: cursor.trim(), limit, mode }
          : { q, offset, limit, mode }
      );

      if (cursorProvided) {
        return res.json({
          q,
          mode,
          limit,
          count: data.length,
          nextCursor,
          data,
        });
      }

      res.json({
        q,
        mode,
        offset,
        limit,
        count: data.length,
        nextCursor,
        data,
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

  return { getProductById, getProducts, searchProducts, createProduct };
}

module.exports = { createProductsController };
