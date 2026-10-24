export const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3000";

export const CATEGORIES = [
  "electronics",
  "clothing",
  "home",
  "sports",
  "books",
  "toys",
];

export const SEARCH_TERMS = ["phone", "laptop", "shoes", "chair", "novel", "puzzle"];

/** @param {number} maxN inclusive upper bound (default 1M seed) */
export function randomProductId(maxN = 1_000_000) {
  const n = Math.floor(Math.random() * maxN) + 1;
  return `prod-${String(n).padStart(7, "0")}`;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
