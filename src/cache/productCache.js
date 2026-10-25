/**
 * Product lookup cache helpers (cache-aside).
 *
 * Key layout: product:<productId>  e.g. product:prod-002
 * Values are JSON strings of the product document (same shape as the API).
 *
 * If Redis is down or CACHE_ENABLED=0, all helpers no-op so Mongo remains
 * the source of truth and the API stays available.
 */
const { redisClient } = require("../config/redis");

const CACHE_ENABLED = process.env.CACHE_ENABLED !== "0";
const DEFAULT_TTL_SECONDS = 60;

function productCacheKey(productId) {
  return `product:${productId}`;
}

function ttlSeconds() {
  const n = Number(process.env.PRODUCT_CACHE_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TTL_SECONDS;
}

function canUseCache() {
  return CACHE_ENABLED && redisClient.isOpen;
}

/** @returns {Promise<object|null>} parsed product or null on miss / error */
async function getCachedProduct(productId) {
  if (!canUseCache()) return null;

  try {
    const raw = await redisClient.get(productCacheKey(productId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error("product cache get failed:", error.message);
    return null;
  }
}

/** Store product JSON with TTL. Failures are logged, never thrown. */
async function setCachedProduct(productId, product) {
  if (!canUseCache() || !product) return;

  try {
    await redisClient.set(productCacheKey(productId), JSON.stringify(product), {
      EX: ttlSeconds(),
    });
  } catch (error) {
    console.error("product cache set failed:", error.message);
  }
}

/** Drop a key after writes so the next read refreshes from Mongo. */
async function invalidateProductCache(productId) {
  if (!canUseCache()) return;

  try {
    await redisClient.del(productCacheKey(productId));
  } catch (error) {
    console.error("product cache invalidate failed:", error.message);
  }
}

module.exports = {
  productCacheKey,
  ttlSeconds,
  getCachedProduct,
  setCachedProduct,
  invalidateProductCache,
};
