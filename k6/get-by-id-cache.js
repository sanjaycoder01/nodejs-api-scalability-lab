/**
 * Warm get-by-id traffic — good for showing Redis HIT vs Mongo MISS latency.
 *
 * Repeats the same productId so after the first miss, most reads are cache hits
 * (when CACHE_ENABLED=1 and Redis is up).
 *
 *   npm run k6:cache
 *   CACHE_ENABLED=0 npm start   # then re-run to compare without Redis cache
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, randomProductId } from "./lib/config.js";

const PRODUCT_ID = __ENV.PRODUCT_ID || randomProductId(500);

export const options = {
  scenarios: {
    cache_lookups: {
      executor: "constant-vus",
      vus: Number(__ENV.K6_VUS || 20),
      duration: __ENV.K6_DURATION || "1m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function getByIdCache() {
  const res = http.get(`${BASE_URL}/products/${PRODUCT_ID}`, {
    tags: { name: "get_by_id" },
  });

  check(res, {
    "status 200": (r) => r.status === 200,
  });

  sleep(Number(__ENV.K6_SLEEP || 0.05));
}
