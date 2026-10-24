/**
 * Round 2 — 5 minute stress (same endpoint mix as baseline).
 *
 * Stages:
 *   0–30s   → 100 VUs
 *   30–60s  → 300 VUs
 *   60–240s → 2000 VUs
 *   240–300s → 5000 VUs
 *
 * Actual requests/sec is NOT fixed by VU count — see README / console
 * `http_reqs` rate. Rough estimate when the API stays healthy:
 *   RPS ≈ VUs / iteration_duration
 *   (default sleep 0.3s + ~0.1s work ≈ ~2.5 iters/VU/s → ~1 req/iter)
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import {
  BASE_URL,
  pick,
  CATEGORIES,
  SEARCH_TERMS,
  randomProductId,
} from "./lib/config.js";

export const options = {
  scenarios: {
    round2: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "30s", target: 300 },
        { duration: "180s", target: 2000 },
        { duration: "60s", target: 5000 },
      ],
      gracefulRampDown: "10s",
    },
  },
  // Expect degradation at 2k–5k VUs on a single Node process — track, don't fail the whole run.
  thresholds: {
    http_req_failed: ["rate<0.25"],
    http_req_duration: ["p(95)<10000"],
  },
};

const listCursorTrend = new Trend("list_cursor_pages", true);

export default function round2() {
  const roll = Math.random();

  if (roll < 0.05) {
    check(http.get(`${BASE_URL}/health`, { tags: { name: "health" } }), {
      "health ok": (r) => r.status === 200,
    });
  } else if (roll < 0.25) {
    const offset = Math.floor(Math.random() * 50_000) * 20;
    check(
      http.get(`${BASE_URL}/products?offset=${offset}&limit=20`, {
        tags: { name: "list" },
      }),
      { "list ok": (r) => r.status === 200 }
    );
  } else if (roll < 0.4) {
    const category = pick(CATEGORIES);
    const minPrice = 10 + Math.floor(Math.random() * 30);
    const maxPrice = minPrice + 20 + Math.floor(Math.random() * 50);
    check(
      http.get(
        `${BASE_URL}/products?category=${category}&minPrice=${minPrice}&maxPrice=${maxPrice}&limit=20`,
        { tags: { name: "list_category_price" } }
      ),
      { "category+price ok": (r) => r.status === 200 }
    );
  } else if (roll < 0.52) {
    const page1 = http.get(`${BASE_URL}/products?limit=20`, {
      tags: { name: "list_cursor" },
    });
    if (page1.status === 200) {
      let body;
      try {
        body = page1.json();
      } catch {
        body = null;
      }
      if (body?.nextCursor) {
        const page2 = http.get(
          `${BASE_URL}/products?limit=20&cursor=${encodeURIComponent(body.nextCursor)}`,
          { tags: { name: "list_cursor" } }
        );
        listCursorTrend.add(page2.timings.duration);
        check(page2, { "cursor page2 ok": (r) => r.status === 200 });
      }
    }
  } else if (roll < 0.72) {
    const q = pick(SEARCH_TERMS);
    check(
      http.get(`${BASE_URL}/products/search?q=${q}&limit=20`, {
        tags: { name: "search_text" },
      }),
      { "search text ok": (r) => r.status === 200 }
    );
  } else if (roll < 0.82) {
    const q = pick(SEARCH_TERMS);
    check(
      http.get(`${BASE_URL}/products/search?q=${q}&mode=regex&limit=20`, {
        tags: { name: "search_regex" },
      }),
      { "search regex ok": (r) => r.status === 200 }
    );
  } else {
    const id = randomProductId();
    const res = http.get(`${BASE_URL}/products/${id}`, {
      tags: { name: "get_by_id" },
    });
    check(res, {
      "get by id ok": (r) => r.status === 200 || r.status === 404,
    });
  }

  sleep(Number(__ENV.K6_SLEEP || 0.3));
}
