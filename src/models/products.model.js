const COLLECTION = "products";

/** Full document shape for get-by-id / create responses. */
const PRODUCT_PROJECTION = {
  _id: 0,
  productId: 1,
  name: 1,
  category: 1,
  price: 1,
  description: 1,
  inStock: 1,
  createdAt: 1,
  updatedAt: 1,
};

/** Slimmer payload for list + search (less I/O and JSON size). */
const LIST_PROJECTION = {
  _id: 0,
  productId: 1,
  name: 1,
  category: 1,
  price: 1,
  inStock: 1,
  createdAt: 1,
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

/**
 * Indexes for lookup, filter, search, and pagination.
 * - productId: unique get-by-id + cursor pagination sort key
 * - category / name: filters and prefix-friendly scans
 * - category + price: filtered range queries
 * - createdAt: recent-first listing
 * - text: search across name, category, description
 */
const PRODUCT_INDEXES = [
  {
    key: { productId: 1 },
    options: { unique: true, name: "idx_productId_unique" },
  },
  { key: { category: 1 }, options: { name: "idx_category" } },
  { key: { name: 1 }, options: { name: "idx_name" } },
  { key: { category: 1, price: 1 }, options: { name: "idx_category_price" } },
  { key: { createdAt: -1 }, options: { name: "idx_createdAt_desc" } },
  {
    key: { name: "text", category: "text", description: "text" },
    options: {
      name: "idx_text_search",
      weights: { name: 10, category: 5, description: 1 },
    },
  },
];

function getProductsCollection(db) {
  return db.collection(COLLECTION);
}

async function ensureProductIndexes(db) {
  const products = getProductsCollection(db);

  for (const { key, options } of PRODUCT_INDEXES) {
    await products.createIndex(key, options);
  }

  console.log("Product indexes ensured");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchFilter(q) {
  const trimmed = q.trim();
  const pattern = escapeRegex(trimmed);

  return {
    $or: [
      { name: { $regex: pattern, $options: "i" } },
      { category: { $regex: pattern, $options: "i" } },
      { description: { $regex: pattern, $options: "i" } },
    ],
  };
}

/** Uses idx_text_search via $text. */
function buildTextSearchFilter(q) {
  return { $text: { $search: q.trim() } };
}

/**
 * Equality/range filters for list queries.
 * - category alone → idx_category
 * - category + price range → idx_category_price
 */
function buildListFilter({ category, minPrice, maxPrice } = {}) {
  const filter = {};

  if (category) {
    filter.category = category;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }

  return filter;
}

function validateProductInput(input) {
  const errors = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Body must be a JSON object"] };
  }

  const { productId, name, category, price, description, inStock } = input;

  if (typeof productId !== "string" || productId.trim().length === 0) {
    errors.push("productId is required and must be a non-empty string");
  } else if (productId.trim().length > 64) {
    errors.push("productId must be at most 64 characters");
  }

  if (typeof name !== "string" || name.trim().length === 0) {
    errors.push("name is required and must be a non-empty string");
  } else if (name.trim().length > 200) {
    errors.push("name must be at most 200 characters");
  }

  if (typeof category !== "string" || category.trim().length === 0) {
    errors.push("category is required and must be a non-empty string");
  } else if (category.trim().length > 64) {
    errors.push("category must be at most 64 characters");
  }

  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    errors.push("price is required and must be a non-negative number");
  }

  if (
    description !== undefined &&
    (typeof description !== "string" || description.length > 2000)
  ) {
    errors.push("description must be a string of at most 2000 characters");
  }

  if (inStock !== undefined && typeof inStock !== "boolean") {
    errors.push("inStock must be a boolean");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, errors: [] };
}

function buildProductDocument(input) {
  const now = new Date();

  return {
    productId: input.productId.trim(),
    name: input.name.trim(),
    category: input.category.trim(),
    price: Number(input.price),
    description:
      typeof input.description === "string" ? input.description.trim() : "",
    inStock: typeof input.inStock === "boolean" ? input.inStock : true,
    createdAt: now,
    updatedAt: now,
  };
}

module.exports = {
  COLLECTION,
  PRODUCT_PROJECTION,
  LIST_PROJECTION,
  PRODUCT_INDEXES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getProductsCollection,
  ensureProductIndexes,
  buildSearchFilter,
  buildTextSearchFilter,
  buildListFilter,
  validateProductInput,
  buildProductDocument,
};
