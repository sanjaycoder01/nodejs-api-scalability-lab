/**
 * Verify the baseline products API.
 * Expects the server to already be running on PORT (default 3000).
 */
const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;

async function check(name, path, assertFn, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let body;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${name}: non-JSON response: ${text}`);
  }

  assertFn(res, body);
  console.log(`✓ ${name}`);
  return body;
}

async function main() {
  const uniqueId = `verify-${Date.now()}`;

  try {
    await check("GET /health", "/health", (res, body) => {
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (body.status !== "ok") {
        throw new Error(`unexpected body ${JSON.stringify(body)}`);
      }
    });

    await check(
      "GET /products offset pagination",
      "/products?offset=0&limit=20",
      (res, body) => {
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (
          body.offset !== 0 ||
          body.limit !== 20 ||
          typeof body.count !== "number" ||
          !Array.isArray(body.data) ||
          !("nextCursor" in body)
        ) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      }
    );

    await check(
      "GET /products invalid empty cursor",
      "/products?limit=5&cursor=",
      (res, body) => {
        if (res.status !== 400) throw new Error(`status ${res.status}`);
        if (!body.message) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      }
    );

    const page1 = await check(
      "GET /products cursor page 1",
      "/products?limit=5",
      (res, body) => {
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (body.limit !== 5 || body.data.length > 5) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
        if (body.data.length === 5 && !body.nextCursor) {
          throw new Error("expected nextCursor when page is full");
        }
      }
    );

    if (page1.nextCursor) {
      await check(
        "GET /products cursor page 2",
        `/products?limit=5&cursor=${encodeURIComponent(page1.nextCursor)}`,
        (res, body) => {
          if (res.status !== 200) throw new Error(`status ${res.status}`);
          if (body.data[0]?.productId === page1.data[0]?.productId) {
            throw new Error("cursor page overlapped with previous page");
          }
        }
      );
    }

    await check(
      "GET /products/search default mode=text",
      "/products/search?q=phone&limit=10",
      (res, body) => {
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (body.q !== "phone" || body.mode !== "text" || !Array.isArray(body.data)) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
        if (body.data.some((p) => Object.prototype.hasOwnProperty.call(p, "description"))) {
          throw new Error("list/search should omit description (LIST_PROJECTION)");
        }
      }
    );

    await check(
      "GET /products/search mode=regex",
      "/products/search?q=electronics&mode=regex&limit=10",
      (res, body) => {
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (body.mode !== "regex" || !Array.isArray(body.data)) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
        if (body.count > 0) {
          const hit = body.data.every(
            (p) =>
              /electronics/i.test(p.name) ||
              /electronics/i.test(p.category)
          );
          if (!hit) throw new Error("search results did not match q");
        }
      }
    );

    await check(
      "GET /products?category=",
      "/products?category=electronics&limit=10",
      (res, body) => {
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (body.category !== "electronics") {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
        if (body.data.some((p) => p.category !== "electronics")) {
          throw new Error("category filter returned wrong rows");
        }
      }
    );

    await check(
      "GET /products category+price",
      "/products?category=electronics&minPrice=20&maxPrice=50&limit=10",
      (res, body) => {
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (
          body.data.some(
            (p) =>
              p.category !== "electronics" || p.price < 20 || p.price > 50
          )
        ) {
          throw new Error("price/category filter returned wrong rows");
        }
      }
    );

    await check(
      "GET /products sort=-createdAt",
      "/products?sort=-createdAt&limit=5",
      (res, body) => {
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (body.sort !== "-createdAt") {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      }
    );

    await check(
      "GET /products sort=name",
      "/products?sort=name&limit=5",
      (res, body) => {
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (body.sort !== "name") {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      }
    );

    await check(
      "GET /products price without category",
      "/products?minPrice=10&limit=5",
      (res, body) => {
        if (res.status !== 400) throw new Error(`status ${res.status}`);
        if (!/category is required/i.test(body.message || "")) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      }
    );

    await check(
      "GET /products/search missing q",
      "/products/search",
      (res, body) => {
        if (res.status !== 400) throw new Error(`status ${res.status}`);
        if (!/q is required/i.test(body.message || "")) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      }
    );

    await check(
      "GET /products/:id not found",
      "/products/does-not-exist-xyz",
      (res, body) => {
        if (res.status !== 404) throw new Error(`status ${res.status}`);
        if (body.message !== "Product not found") {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      }
    );

    await check(
      "POST /products invalid body",
      "/products",
      (res, body) => {
        if (res.status !== 400) throw new Error(`status ${res.status}`);
        if (!body.message) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Missing fields" }),
      }
    );

    await check(
      "POST /products create",
      "/products",
      (res, body) => {
        if (res.status !== 201) throw new Error(`status ${res.status}`);
        if (body.productId !== uniqueId) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: uniqueId,
          name: "Verify Product",
          category: "electronics",
          price: 19.99,
          description: "Created by verify-api",
          inStock: true,
        }),
      }
    );

    await check(
      "POST /products duplicate productId",
      "/products",
      (res, body) => {
        if (res.status !== 409) throw new Error(`status ${res.status}`);
        if (!/already exists/i.test(body.message || "")) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: uniqueId,
          name: "Duplicate",
          category: "electronics",
          price: 1,
        }),
      }
    );

    await check(
      "GET /products/:id",
      `/products/${encodeURIComponent(uniqueId)}`,
      (res, body) => {
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (body.productId !== uniqueId) {
          throw new Error(`unexpected body ${JSON.stringify(body)}`);
        }
      }
    );

    console.log("\nBaseline API verification passed.");
  } catch (error) {
    console.error("\nBaseline API verification failed:", error.message);
    process.exit(1);
  }
}

main();
