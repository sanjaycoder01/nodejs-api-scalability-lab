/**
 * Load test: GET /products/:id with Redis cache-aside.
 *
 * VU mode (default):
 *   K6_VUS=50 K6_DURATION=2m npm run k6:cache:load:local
 *
 * Fixed RPS mode (set K6_RATE):
 *   K6_RATE=500 K6_DURATION=5m K6_VUS=2000 HOT_POOL=10000 npm run k6:cache:load:local
 *
 * Env:
 *   K6_RATE     — requests per second (uses constant-arrival-rate)
 *   K6_VUS      — max VUs (arrival-rate) or target VUs (ramping)
 *   K6_DURATION — hold duration
 *   HOT_POOL    — distinct productIds (default 20)
 *   ID_PAD      — zero-pad width (default 3 → prod-001)
 *   PRODUCT_ID  — pin to one id
 *   K6_SLEEP    — only used in VU mode (ignored when K6_RATE set)
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { BASE_URL } from "./lib/config.js";

const hotPool = Number(__ENV.HOT_POOL || 20);
const idPad = Number(__ENV.ID_PAD || 3);
const fixedId = __ENV.PRODUCT_ID || "";
const rate = Number(__ENV.K6_RATE || 0);
const maxVUs = Number(__ENV.K6_VUS || (rate > 0 ? 2000 : 50));
const hold = __ENV.K6_DURATION || (rate > 0 ? "5m" : "2m");

const cacheHits = new Counter("cache_hits");
const cacheMisses = new Counter("cache_misses");
const getByIdTrend = new Trend("get_by_id_duration", true);

function productIdAt(i) {
  if (fixedId) return fixedId;
  const n = (i % hotPool) + 1;
  return `prod-${String(n).padStart(idPad, "0")}`;
}

const scenario =
  rate > 0
    ? {
        // Exact RPS target; k6 spawns up to maxVUs as needed.
        executor: "constant-arrival-rate",
        rate,
        timeUnit: "1s",
        duration: hold,
        preAllocatedVUs: Math.min(maxVUs, Math.max(rate, 50)),
        maxVUs,
      }
    : {
        executor: "ramping-vus",
        startVUs: 0,
        stages: [
          { duration: "15s", target: maxVUs },
          { duration: hold, target: maxVUs },
          { duration: "15s", target: 0 },
        ],
        gracefulRampDown: "10s",
      };

export const options = {
  scenarios: {
    product_cache_load: scenario,
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    "http_req_duration{name:get_by_id}": ["p(95)<1000"],
    checks: ["rate>0.90"],
  },
};

export default function productCacheLoad() {
  const id = productIdAt(__ITER + __VU);
  const res = http.get(`${BASE_URL}/products/${id}`, {
    tags: { name: "get_by_id" },
  });

  getByIdTrend.add(res.timings.duration);

  const xCache = (
    res.headers["X-Cache"] ||
    res.headers["x-cache"] ||
    ""
  ).toUpperCase();
  if (xCache === "HIT") cacheHits.add(1);
  else if (xCache === "MISS") cacheMisses.add(1);

  check(res, {
    "status 200": (r) => r.status === 200,
    "has productId": (r) => {
      try {
        return r.json("productId") === id;
      } catch {
        return false;
      }
    },
  });

  // Arrival-rate mode already paces to K6_RATE — do not sleep.
  if (rate <= 0) {
    sleep(Number(__ENV.K6_SLEEP || 0.05));
  }
}

export function handleSummary(data) {
  const hits = data.metrics.cache_hits?.values?.count || 0;
  const misses = data.metrics.cache_misses?.values?.count || 0;
  const total = hits + misses;
  const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : "n/a";
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"];
  const rps = data.metrics.http_reqs?.values?.rate;

  const lines = [
    "",
    "=== product-cache-load summary ===",
    rate > 0 ? `  target rate:   ${rate}/s for ${hold}` : "",
    rps != null ? `  actual http_reqs: ${rps.toFixed(1)}/s` : "",
    `  X-Cache HIT:   ${hits}`,
    `  X-Cache MISS:  ${misses}`,
    `  hit rate:      ${hitRate}%`,
    p95 != null ? `  http p(95):    ${p95.toFixed(2)} ms` : "",
    "  Tip: CACHE_ENABLED=0 + restart API to compare Mongo-only.",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  return { stdout: lines };
}
