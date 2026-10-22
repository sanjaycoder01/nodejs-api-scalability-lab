/**
 * Phase 2 — Verify the baseline API.
 * Expects the server to already be running on PORT (default 3000).
 */
const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;

async function check(name, path, assertFn) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json();
  assertFn(res, body);
  console.log(`✓ ${name}`);
  return body;
}

async function main() {
  try {
    await check("GET /health", "/health", (res, body) => {
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (body.status !== "ok") throw new Error(`unexpected body ${JSON.stringify(body)}`);
    });

    await check("GET /products", "/products", (res, body) => {
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (
        body.offset !== 0 ||
        body.limit !== 20 ||
        typeof body.count !== "number" ||
        !Array.isArray(body.data)
      ) {
        throw new Error(`unexpected body ${JSON.stringify(body)}`);
      }
    });

    await check("GET /products?offset=20&limit=10", "/products?offset=20&limit=10", (res, body) => {
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (body.offset !== 20 || body.limit !== 10) {
        throw new Error(`unexpected body ${JSON.stringify(body)}`);
      }
    });

    console.log("\nPhase 2 verification passed.");
  } catch (error) {
    console.error("\nPhase 2 verification failed:", error.message);
    process.exit(1);
  }
}

main();
