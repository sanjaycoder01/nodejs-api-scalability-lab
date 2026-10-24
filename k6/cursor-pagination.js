import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL } from "./lib/config.js";

const LIMIT = Number(__ENV.LIMIT || 50);

export const options = {
  scenarios: {
    cursor_pagination: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 25 },
        { duration: "30s", target: 200 },
        { duration: "60s", target: 500 },
      ],
      gracefulRampDown: "0s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    "http_req_duration{name:cursor_page1}": ["p(95)<3000"],
    "http_req_duration{name:cursor_page2}": ["p(95)<3000"],
  },
};

export default function cursorPagination() {
  const page1 = http.get(`${BASE_URL}/products?limit=${LIMIT}`, {
    tags: { name: "cursor_page1" },
  });

  const page1Ok = check(page1, {
    "page1 status 200": (r) => r.status === 200,
    "page1 has data array": (r) => {
      try {
        return Array.isArray(r.json("data"));
      } catch {
        return false;
      }
    },
  });

  if (!page1Ok || page1.status !== 200) {
    sleep(0.1);
    return;
  }

  let nextCursor;
  try {
    nextCursor = page1.json("nextCursor");
  } catch {
    nextCursor = null;
  }

  if (nextCursor) {
    const page2 = http.get(
      `${BASE_URL}/products?limit=${LIMIT}&cursor=${encodeURIComponent(nextCursor)}`,
      { tags: { name: "cursor_page2" } }
    );

    check(page2, {
      "page2 status 200": (r) => r.status === 200,
      "page2 advances past page1": (r) => {
        try {
          const body = r.json();
          const firstId = body.data?.[0]?.productId;
          const page1First = page1.json("data")?.[0]?.productId;
          return !firstId || !page1First || firstId !== page1First;
        } catch {
          return false;
        }
      },
    });
  }

  sleep(Number(__ENV.K6_SLEEP || 0.05));
}
