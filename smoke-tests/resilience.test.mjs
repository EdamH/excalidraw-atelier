#!/usr/bin/env node
// smoke-tests/resilience.test.mjs
//
// Smoke tests for the offline resilience & latency optimization features.
// Covers: ETag/304 caching, compression headers, scene save retry scenarios.
//
// Prerequisites:
//   - docker compose up -d (healthy stack on http://localhost:4100)
//   - alice@team.com / pw seeded
//
// Usage:
//   node smoke-tests/resilience.test.mjs

const BASE = process.env.BASE_URL ?? "http://localhost:4100";
const EMAIL = process.env.TEST_EMAIL ?? "alice@team.com";
const PASSWORD = process.env.TEST_PASSWORD ?? "pw";

let passed = 0;
let failed = 0;

function check(name, cond, details) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    if (details !== undefined) console.error(`    ${details}`);
    failed++;
  }
}

async function req(path, { method = "GET", token, body, headers: extraHeaders } = {}) {
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return {
    status: res.status,
    body: parsed,
    headers: res.headers,
  };
}

async function login() {
  const { status, body } = await req("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  check("login succeeds", status === 200, `status=${status}`);
  return body.token;
}

// ── ETag / 304 on GET /scenes ─────────────────────────────────────────────

async function testSceneListETag(token) {
  console.log("\n── ETag on GET /scenes ──");

  // First request — should return 200 + ETag header
  const r1 = await req("/api/scenes", { token });
  check("GET /scenes returns 200", r1.status === 200);
  const etag = r1.headers.get("etag");
  check("response includes ETag header", !!etag, `etag=${etag}`);
  const cacheControl = r1.headers.get("cache-control");
  check(
    "Cache-Control is private, no-cache",
    cacheControl === "private, no-cache",
    `cache-control=${cacheControl}`,
  );

  // Second request with If-None-Match — should return 304
  if (etag) {
    const r2 = await req("/api/scenes", {
      token,
      headers: { "If-None-Match": etag },
    });
    check("GET /scenes with matching ETag returns 304", r2.status === 304);
    check("304 response body is empty", r2.body === null || r2.body === "");
  }

  // Third request with wrong ETag — should return 200
  const r3 = await req("/api/scenes", {
    token,
    headers: { "If-None-Match": '"bogus-etag"' },
  });
  check("GET /scenes with wrong ETag returns 200", r3.status === 200);
}

// ── ETag / 304 on GET /scenes/:id ─────────────────────────────────────────

async function testSceneDetailETag(token) {
  console.log("\n── ETag on GET /scenes/:id ──");

  // Create a scene to test with
  const createRes = await req("/api/scenes", {
    method: "POST",
    token,
    body: {
      title: "ETag test scene",
      elements: [{ id: "e1", type: "rectangle", version: 1, versionNonce: 1 }],
      appState: {},
    },
  });
  check("create test scene", createRes.status === 200 || createRes.status === 201);
  const sceneId = createRes.body?._id;
  if (!sceneId) {
    console.error("  ✗ no scene id returned, skipping detail ETag tests");
    failed++;
    return;
  }

  // First request — 200 + ETag
  const r1 = await req(`/api/scenes/${sceneId}`, { token });
  check("GET /scenes/:id returns 200", r1.status === 200);
  const etag = r1.headers.get("etag");
  check("detail response includes ETag", !!etag, `etag=${etag}`);

  // Conditional request
  if (etag) {
    const r2 = await req(`/api/scenes/${sceneId}`, {
      token,
      headers: { "If-None-Match": etag },
    });
    check("GET /scenes/:id with matching ETag returns 304", r2.status === 304);
  }

  // Save changes — ETag should change
  await req(`/api/scenes/${sceneId}`, {
    method: "PUT",
    token,
    body: {
      elements: [
        { id: "e1", type: "rectangle", version: 2, versionNonce: 2 },
        { id: "e2", type: "ellipse", version: 1, versionNonce: 1 },
      ],
      appState: {},
    },
  });

  const r3 = await req(`/api/scenes/${sceneId}`, { token });
  const newEtag = r3.headers.get("etag");
  check("ETag changes after save", etag !== newEtag, `old=${etag} new=${newEtag}`);

  // Old ETag should now get 200
  if (etag) {
    const r4 = await req(`/api/scenes/${sceneId}`, {
      token,
      headers: { "If-None-Match": etag },
    });
    check("old ETag returns 200 after update", r4.status === 200);
  }

  // Cleanup
  await req(`/api/scenes/${sceneId}`, { method: "DELETE", token });
  await req(`/api/scenes/${sceneId}?hard=1`, { method: "DELETE", token });
}

// ── Compression ───────────────────────────────────────────────────────────

async function testCompression(token) {
  console.log("\n── Compression ──");

  const res = await fetch(`${BASE}/api/scenes`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Encoding": "gzip, deflate",
    },
  });
  const encoding = res.headers.get("content-encoding");
  // The compression middleware only compresses if the response is large enough
  // (default threshold: 1KB). With few scenes the response may be too small.
  // We just check that the middleware doesn't break the response.
  check("GET /scenes with Accept-Encoding succeeds", res.status === 200 || res.status === 304);
  const body = await res.json();
  check("response is valid JSON array", Array.isArray(body));
  if (encoding) {
    check("content-encoding header present", encoding === "gzip" || encoding === "deflate");
  } else {
    console.log("  · response too small for compression (expected)");
  }
}

// ── Autosave idempotency (retry scenario) ─────────────────────────────────

async function testAutosaveIdempotency(token) {
  console.log("\n── Autosave idempotency ──");

  // Create a scene
  const createRes = await req("/api/scenes", {
    method: "POST",
    token,
    body: {
      title: "Retry test scene",
      elements: [{ id: "r1", type: "rectangle", version: 1, versionNonce: 100 }],
      appState: {},
    },
  });
  const sceneId = createRes.body?._id;
  if (!sceneId) {
    console.error("  ✗ no scene id, skipping");
    failed++;
    return;
  }

  const payload = {
    elements: [
      { id: "r1", type: "rectangle", version: 2, versionNonce: 200 },
      { id: "r2", type: "text", version: 1, versionNonce: 300 },
    ],
    appState: { viewBackgroundColor: "#faf7f0" },
  };

  // Send the same save 3 times (simulating retry after failure)
  const s1 = await req(`/api/scenes/${sceneId}`, { method: "PUT", token, body: payload });
  const s2 = await req(`/api/scenes/${sceneId}`, { method: "PUT", token, body: payload });
  const s3 = await req(`/api/scenes/${sceneId}`, { method: "PUT", token, body: payload });

  check("first save succeeds", s1.status === 200);
  check("duplicate save #2 succeeds (idempotent)", s2.status === 200);
  check("duplicate save #3 succeeds (idempotent)", s3.status === 200);

  // Verify data integrity
  const detail = await req(`/api/scenes/${sceneId}`, { token });
  check("scene has correct element count after retries", detail.body?.elements?.length === 2);
  check("element version preserved", detail.body?.elements?.[0]?.version === 2);

  // Cleanup
  await req(`/api/scenes/${sceneId}`, { method: "DELETE", token });
  await req(`/api/scenes/${sceneId}?hard=1`, { method: "DELETE", token });
}

// ── Auth guard: expired/invalid token ─────────────────────────────────────

async function testAuthGuard() {
  console.log("\n── Auth guard ──");

  const r1 = await req("/api/scenes", {
    headers: { Authorization: "Bearer invalid-token-123" },
  });
  check("invalid token returns 401", r1.status === 401);

  const r2 = await req("/api/scenes");
  check("no token returns 401", r2.status === 401);
}

// ── Health check ──────────────────────────────────────────────────────────

async function testHealthz() {
  console.log("\n── Health check ──");
  const r = await req("/healthz");
  check("healthz returns 200", r.status === 200);
  check("healthz body is { ok: true }", r.body?.ok === true);
}

// ── Run all ───────────────────────────────────────────────────────────────

(async () => {
  console.log(`\nResilience smoke tests — ${BASE}\n`);

  try {
    await testHealthz();
    const token = await login();
    await testSceneListETag(token);
    await testSceneDetailETag(token);
    await testCompression(token);
    await testAutosaveIdempotency(token);
    await testAuthGuard();
  } catch (err) {
    console.error("\n  FATAL:", err.message);
    failed++;
  }

  console.log(`\n  ${passed} passed, ${failed} failed (${passed + failed} total)\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
