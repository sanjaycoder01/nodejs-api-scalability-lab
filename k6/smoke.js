import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, pick, CATEGORIES, SEARCH_TERMS, randomProductId } from "./lib/config.js";

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
  },
};

export default function smoke() {
  const tags = { name: "health" };
  check(http.get(`${BASE_URL}/health`, { tags }), {
    "health 200": (r) => r.status === 200,
  });

  check(
    http.get(`${BASE_URL}/products?limit=10`, { tags: { name: "list" } }),
    { "list 200": (r) => r.status === 200 }
  );

  const category = pick(CATEGORIES);
  check(
    http.get(
      `${BASE_URL}/products?category=${category}&minPrice=10&maxPrice=80&limit=10`,
      { tags: { name: "list_category_price" } }
    ),
    { "category+price 200": (r) => r.status === 200 }
  );

  const q = pick(SEARCH_TERMS);
  check(
    http.get(`${BASE_URL}/products/search?q=${q}&limit=10`, {
      tags: { name: "search_text" },
    }),
    { "search 200": (r) => r.status === 200 }
  );

  check(
    http.get(`${BASE_URL}/products/${randomProductId()}`, {
      tags: { name: "get_by_id" },
    }),
    (r) => r.status === 200 || r.status === 404
  );

  sleep(1);
}
