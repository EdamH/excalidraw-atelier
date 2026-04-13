#!/usr/bin/env node
// smoke-tests/save.test.mjs
//
// Smoke test for the scene save path. Covers the two halves of the bug that
// motivated it: the client-side dedupe signal must detect moves, and the
// server-side roundtrip must persist them.
//
// Prerequisites:
//   - docker compose up -d (healthy stack on http://localhost:4100)
//   - alice@team.com / pw seeded (docker-compose ADMIN_EMAILS defaults to alice)
//
// Usage:
//   node smoke-tests/save.test.mjs
//
// Env overrides:
//   BASE_URL        default http://localhost:4100
//   TEST_EMAIL      default alice@team.com
//   TEST_PASSWORD   default pw

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

async function req(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
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
  return { status: res.status, body: parsed };
}

// Mirror of the dedupe signal in
// frontend/src/hooks/useExcalidrawPersistence.ts (onChange).
// Must stay in sync with that file — if you change one, change the other.
function computeSignal(elements) {
  let signal = elements.length * 31;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] ?? {};
    signal = (signal * 31 + (el.version ?? 0)) | 0;
    const id = el.id ?? "";
    for (let j = 0; j < id.length; j++) {
      signal = (signal * 31 + id.charCodeAt(j)) | 0;
    }
  }
  return signal;
}

function testSignalDedupe() {
  console.log("\n[signal dedupe: detects moves, reorders, adds, deletes]");
  const a = { id: "a", version: 1 };
  const b = { id: "b", version: 1 };
  const aMoved = { id: "a", version: 2 };

  check("empty array is deterministic", computeSignal([]) === computeSignal([]));
  check(
    "same elements same order → same signal",
    computeSignal([a, b]) === computeSignal([a, b]),
  );
  check(
    "move (version bump) → different signal (the actual bug fix)",
    computeSignal([a, b]) !== computeSignal([aMoved, b]),
  );
  check(
    "reorder (z-order change) → different signal",
    computeSignal([a, b]) !== computeSignal([b, a]),
  );
  check(
    "add element → different signal",
    computeSignal([a]) !== computeSignal([a, b]),
  );
  check(
    "delete element → different signal",
    computeSignal([a, b]) !== computeSignal([a]),
  );
}

async function login() {
  const { status, body } = await req("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  if (status !== 200 || !body?.token) {
    throw new Error(
      `Login failed (${status}). Seed the user first:\n` +
        `  docker compose exec backend node dist/scripts/createUser.js ${EMAIL} ${PASSWORD} "Alice"`,
    );
  }
  return body.token;
}

function makeRect({ x, y, version }) {
  return {
    type: "rectangle",
    id: "smoke-rect-1",
    x,
    y,
    width: 200,
    height: 100,
    angle: 0,
    strokeColor: "#1a0e2e",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 12345,
    version,
    versionNonce: version,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

async function testServerRoundtrip(token) {
  console.log("\n[server roundtrip: create → save → move → save → read]");

  const create = await req("/api/scenes", {
    method: "POST",
    token,
    body: { title: `smoke-test ${new Date().toISOString()}` },
  });
  check(
    "POST /api/scenes returns 2xx",
    create.status >= 200 && create.status < 300,
    `got ${create.status}: ${JSON.stringify(create.body)}`,
  );
  const id = create.body?._id;
  check("scene has _id", !!id);
  if (!id) return;

  const initial = {
    elements: [makeRect({ x: 100, y: 100, version: 1 })],
    appState: { viewBackgroundColor: "#FAF7F0" },
  };
  const save1 = await req(`/api/scenes/${id}`, {
    method: "PUT",
    token,
    body: initial,
  });
  check(
    "initial save returns 200",
    save1.status === 200,
    `got ${save1.status}: ${JSON.stringify(save1.body)}`,
  );

  // Simulate a pure move: same element id, new coords, bumped version.
  // This is the operation shape that the reference-equality dedupe used to
  // swallow — now the hash-based dedupe (and the server) should both honor it.
  const moved = {
    elements: [makeRect({ x: 500, y: 500, version: 2 })],
    appState: initial.appState,
  };
  const save2 = await req(`/api/scenes/${id}`, {
    method: "PUT",
    token,
    body: moved,
  });
  check(
    "move save returns 200",
    save2.status === 200,
    `got ${save2.status}: ${JSON.stringify(save2.body)}`,
  );

  const read = await req(`/api/scenes/${id}`, { token });
  check("GET /api/scenes/:id returns 200", read.status === 200);
  const el = read.body?.elements?.[0];
  check("scene persisted a rectangle", el?.type === "rectangle");
  check(
    "server persisted moved x = 500",
    el?.x === 500,
    `got x=${el?.x}`,
  );
  check(
    "server persisted moved y = 500",
    el?.y === 500,
    `got y=${el?.y}`,
  );
  check(
    "server persisted bumped version = 2",
    el?.version === 2,
    `got version=${el?.version}`,
  );

  // Soft-delete so we don't pile up smoke-test scenes on the home page.
  // (Hard delete requires the scene to already be trashed.)
  const del = await req(`/api/scenes/${id}`, { method: "DELETE", token });
  check(
    "cleanup: soft delete returns 2xx",
    del.status >= 200 && del.status < 300,
    `got ${del.status}`,
  );

  // First save after creation should embed quotaUsage in the response
  // because lastSnapshotAt is null and the snapshot claim succeeds.
  // Subsequent saves within the 5-min window should NOT embed quotaUsage.
  return { firstSaveResponse: save1 };
}

async function testFirstSaveCarriesQuotaUsage(token) {
  console.log("\n[PUT /scenes/:id embeds quotaUsage on first save (snapshot fires)]");

  const create = await req("/api/scenes", {
    method: "POST",
    token,
    body: { title: `quota-usage-probe ${new Date().toISOString()}` },
  });
  const id = create.body?._id;
  if (!id) {
    check("created probe scene", false, "no _id");
    return;
  }

  const initial = {
    elements: [makeRect({ x: 0, y: 0, version: 1 })],
    appState: { viewBackgroundColor: "#FAF7F0" },
  };
  const save1 = await req(`/api/scenes/${id}`, {
    method: "PUT",
    token,
    body: initial,
  });
  check("first PUT 200", save1.status === 200);
  check(
    "first PUT response carries quotaUsage (snapshot fired)",
    save1.body?.quotaUsage && typeof save1.body.quotaUsage.used === "number",
    `body=${JSON.stringify(save1.body)}`,
  );
  if (save1.body?.quotaUsage) {
    check(
      "quotaUsage.over === false (well under quota)",
      save1.body.quotaUsage.over === false,
    );
    check(
      "quotaUsage.limit defaults to 500 MB",
      save1.body.quotaUsage.limit === 500 * 1024 * 1024,
      `got limit=${save1.body.quotaUsage.limit}`,
    );
  }

  // Second PUT immediately after — within 5-min snapshot window, so
  // quotaUsage should NOT be present (avoiding the per-keystroke perf cliff).
  const moved = {
    elements: [makeRect({ x: 5, y: 5, version: 2 })],
    appState: initial.appState,
  };
  const save2 = await req(`/api/scenes/${id}`, {
    method: "PUT",
    token,
    body: moved,
  });
  check("second PUT 200", save2.status === 200);
  check(
    "second PUT response OMITS quotaUsage (snapshot throttled)",
    save2.body?.quotaUsage === undefined,
    `body=${JSON.stringify(save2.body)}`,
  );

  // cleanup
  await req(`/api/scenes/${id}`, { method: "DELETE", token });
}

async function testUserStats(token) {
  console.log("\n[GET /users/me/stats shape]");
  const { status, body } = await req("/api/users/me/stats", { token });
  check("returns 200", status === 200);
  check("has sceneCount (number)", typeof body?.sceneCount === "number");
  check("has totalElements (number)", typeof body?.totalElements === "number");
  check("has totalBytes (number)", typeof body?.totalBytes === "number");
  check(
    "has quotaUsage with used/limit/over",
    body?.quotaUsage &&
      typeof body.quotaUsage.used === "number" &&
      typeof body.quotaUsage.limit === "number" &&
      typeof body.quotaUsage.over === "boolean",
  );
  check(
    "largestScene is null or shaped {id,title,size}",
    body?.largestScene === null ||
      (typeof body?.largestScene?.id === "string" &&
        typeof body?.largestScene?.title === "string" &&
        typeof body?.largestScene?.size === "number"),
  );
  check(
    "oldestScene is null or shaped {id,title,createdAt}",
    body?.oldestScene === null ||
      (typeof body?.oldestScene?.id === "string" &&
        typeof body?.oldestScene?.title === "string" &&
        typeof body?.oldestScene?.createdAt === "string"),
  );
  check(
    "newestScene is null or shaped {id,title,createdAt}",
    body?.newestScene === null ||
      (typeof body?.newestScene?.id === "string" &&
        typeof body?.newestScene?.title === "string" &&
        typeof body?.newestScene?.createdAt === "string"),
  );
}

async function testAdminEndpoints(token) {
  console.log("\n[admin: stats / scenes / quota override]");

  // Stats
  const stats = await req("/api/admin/stats", { token });
  check("GET /admin/stats returns 200", stats.status === 200);
  check("admin stats has sceneCount", typeof stats.body?.sceneCount === "number");
  check("admin stats has userCount", typeof stats.body?.userCount === "number");
  check("admin stats has perUser[]", Array.isArray(stats.body?.perUser));
  check(
    "admin stats has storageHealth enum",
    ["ok", "warning", "critical"].includes(stats.body?.storageHealth),
  );

  // Cross-endpoint consistency: per-user totalBytes for the caller (alice)
  // must match /users/me/stats totalBytes for the same user. This catches
  // double-counting bugs in either pipeline.
  const me = await req("/api/users/me/stats", { token });
  const aliceFromAdmin = stats.body?.perUser?.find?.(
    (u) => u.email === EMAIL,
  );
  check(
    "admin/stats and users/me/stats agree on caller totalBytes",
    aliceFromAdmin && aliceFromAdmin.totalBytes === me.body?.totalBytes,
    `admin=${aliceFromAdmin?.totalBytes}, self=${me.body?.totalBytes}`,
  );

  // Scenes list
  const adminScenes = await req("/api/admin/scenes", { token });
  check("GET /admin/scenes returns 200", adminScenes.status === 200);
  check("admin/scenes returns an array", Array.isArray(adminScenes.body));
  if (Array.isArray(adminScenes.body) && adminScenes.body.length > 0) {
    const sample = adminScenes.body[0];
    check("admin scene has _id", typeof sample._id === "string");
    check("admin scene has ownerName", typeof sample.ownerName === "string");
    check(
      "admin scene has lastEditedById field (nullable, contract fix)",
      "lastEditedById" in sample,
    );
  }

  // Quota override roundtrip — set bob's quota to 0, verify shape, restore.
  const bob = stats.body?.perUser?.find?.((u) => u.email === "bob@team.com");
  if (!bob) {
    check("bob exists for quota override test", false, "no bob in perUser");
    return;
  }
  const originalQuota = bob.quotaLimit;

  const patched = await req(`/api/admin/users/${bob.userId}/quota`, {
    method: "PATCH",
    token,
    body: { storageQuota: 0 },
  });
  check("PATCH /admin/users/:id/quota returns 200", patched.status === 200);
  check("response has id", typeof patched.body?.id === "string");
  check("response has email", typeof patched.body?.email === "string");
  check("response has createdAt", typeof patched.body?.createdAt === "string");
  check("response has isAdmin (boolean)", typeof patched.body?.isAdmin === "boolean");
  check("response has updated storageQuota", patched.body?.storageQuota === 0);

  // Validation: negative
  const bad = await req(`/api/admin/users/${bob.userId}/quota`, {
    method: "PATCH",
    token,
    body: { storageQuota: -1 },
  });
  check("PATCH with negative quota returns 400", bad.status === 400);

  // Validation: too large
  const tooBig = await req(`/api/admin/users/${bob.userId}/quota`, {
    method: "PATCH",
    token,
    body: { storageQuota: 100 * 1024 * 1024 * 1024 }, // 100 GB
  });
  check("PATCH with quota > 10 GB returns 400", tooBig.status === 400);

  // Now use bob's zeroed quota to verify hard-block on POST /scenes.
  // Bob's password is always "pw" — password change tests use a dedicated user.
  const bobLogin = await req("/api/auth/login", {
    method: "POST",
    body: { email: "bob@team.com", password: "pw" },
  });
  if (bobLogin.status !== 200) {
    check("bob login (precondition)", false, `got ${bobLogin.status}`);
  } else {
    const bobToken = bobLogin.body.token;
    const bobCreate = await req("/api/scenes", {
      method: "POST",
      token: bobToken,
      body: { title: "should-be-blocked" },
    });
    check(
      "POST /scenes returns 413 when over quota",
      bobCreate.status === 413,
      `got ${bobCreate.status}: ${JSON.stringify(bobCreate.body)}`,
    );
  }

  // Restore bob's quota.
  const restore = await req(`/api/admin/users/${bob.userId}/quota`, {
    method: "PATCH",
    token,
    body: { storageQuota: originalQuota },
  });
  check("restore bob's quota returns 200", restore.status === 200);
}

async function testPasswordChange() {
  console.log("\n[POST /auth/change-password roundtrip]");

  // Use a dedicated user that no other test suite touches. This avoids any
  // cross-test password sabotage. The user is created via the admin API
  // (409 is fine if already exists from a previous run).
  const pwTestEmail = "pwtest@team.com";
  const initialPw = "initial-password";
  const changedPw = "changed-password";

  // Ensure the user exists (admin creates, 409 = already exists = fine)
  const createRes = await req("/api/admin/users", {
    method: "POST",
    token: await login(), // alice (admin)
    body: { email: pwTestEmail, password: initialPw, name: "PwTest" },
  });
  check("pwtest user exists", createRes.status === 201 || createRes.status === 409);

  // Login — try initial password first, then changed (from a previous run)
  let pwTestLogin = await req("/api/auth/login", {
    method: "POST",
    body: { email: pwTestEmail, password: initialPw },
  });
  let currentPw = initialPw;
  if (pwTestLogin.status !== 200) {
    pwTestLogin = await req("/api/auth/login", {
      method: "POST",
      body: { email: pwTestEmail, password: changedPw },
    });
    currentPw = changedPw;
  }
  if (pwTestLogin.status !== 200) {
    check("pwtest login (precondition)", false, `got ${pwTestLogin.status}`);
    return;
  }
  const pwTestToken = pwTestLogin.body.token;

  // If we're on changedPw from a previous run, restore to initialPw first
  if (currentPw === changedPw) {
    await req("/api/auth/change-password", {
      method: "POST",
      token: pwTestToken,
      body: { currentPassword: changedPw, newPassword: initialPw },
    });
    currentPw = initialPw;
    // Re-login to get a fresh token
    const reLogin = await req("/api/auth/login", {
      method: "POST",
      body: { email: pwTestEmail, password: initialPw },
    });
    if (reLogin.status !== 200) {
      check("pwtest re-login after restore", false);
      return;
    }
  }

  // Wrong current password rejected
  const wrong = await req("/api/auth/change-password", {
    method: "POST",
    token: pwTestToken,
    body: { currentPassword: "definitely-wrong", newPassword: changedPw },
  });
  check("wrong current password returns 401", wrong.status === 401);

  // Too-short new password rejected
  const tooShort = await req("/api/auth/change-password", {
    method: "POST",
    token: pwTestToken,
    body: { currentPassword: currentPw, newPassword: "abc" },
  });
  check("new password < 6 chars returns 400", tooShort.status === 400);

  // Valid change
  const ok = await req("/api/auth/change-password", {
    method: "POST",
    token: pwTestToken,
    body: { currentPassword: currentPw, newPassword: changedPw },
  });
  check("valid change returns 200", ok.status === 200);
  check("response has ok: true", ok.body?.ok === true);

  // Login with new password works
  const newLogin = await req("/api/auth/login", {
    method: "POST",
    body: { email: pwTestEmail, password: changedPw },
  });
  check("login with changed password works", newLogin.status === 200);

  // Old token still valid (we don't invalidate JWTs)
  const meOld = await req("/api/me", { token: pwTestToken });
  check("pre-change JWT still valid (no invalidation)", meOld.status === 200);

  // Restore to initialPw so the test is idempotent
  const restoreToken = newLogin.body?.token ?? pwTestToken;
  const restore = await req("/api/auth/change-password", {
    method: "POST",
    token: restoreToken,
    body: { currentPassword: changedPw, newPassword: initialPw },
  });
  check("restore password returns 200", restore.status === 200);
}

async function main() {
  console.log(`→ smoke test against ${BASE}`);

  testSignalDedupe();

  let token;
  try {
    token = await login();
    console.log("\n✓ logged in as", EMAIL);
  } catch (err) {
    console.error("\n✗ login failed:", err.message);
    process.exit(1);
  }

  try {
    await testServerRoundtrip(token);
    await testFirstSaveCarriesQuotaUsage(token);
    await testUserStats(token);
    await testAdminEndpoints(token);
    await testPasswordChange();
  } catch (err) {
    console.error("\n! unexpected error during smoke test:", err);
    failed++;
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
