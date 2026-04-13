#!/usr/bin/env node
// smoke-tests/collab.test.mjs
//
// Smoke test for the realtime collaboration (Socket.IO) path.
// Covers: auth, room join, presence, element relay, pointer relay,
// viewer enforcement, metrics endpoint, and disconnect cleanup.
//
// Prerequisites:
//   - docker compose up -d (healthy stack on http://localhost:4100)
//   - ENABLE_COLLAB=true on the backend
//   - alice@team.com / pw (admin), bob@team.com / pw, carol@team.com / pw seeded
//
// Usage:
//   node smoke-tests/collab.test.mjs
//
// Env overrides:
//   BASE_URL   default http://localhost:4100

import { io } from "socket.io-client";

const BASE = process.env.BASE_URL ?? "http://localhost:4100";

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

async function login(email, password) {
  const { status, body } = await req("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (status !== 200 || !body?.token) {
    throw new Error(`Login failed for ${email} (${status})`);
  }
  return body.token;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      auth: { token },
      transports: ["websocket"],
      timeout: 5000,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket connect timeout"));
    }, 5000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForEvent(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for '${event}'`));
    }, timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

async function testCollabEnabled() {
  console.log("\n[collab: server availability]");
  const { status } = await req("/healthz");
  check("backend is healthy", status === 200);
}

async function testAuthRejectsNoToken() {
  console.log("\n[collab: auth rejects unauthenticated socket]");
  try {
    const socket = io(BASE, {
      auth: {},
      transports: ["websocket"],
      timeout: 3000,
      reconnection: false,
    });
    const err = await new Promise((resolve) => {
      socket.on("connect_error", resolve);
      setTimeout(() => resolve(null), 3000);
    });
    check("unauthenticated socket rejected", err !== null);
    socket.disconnect();
  } catch {
    check("unauthenticated socket rejected", true);
  }
}

async function testAuthRejectsInvalidToken() {
  console.log("\n[collab: auth rejects invalid token]");
  try {
    const socket = io(BASE, {
      auth: { token: "garbage.token.here" },
      transports: ["websocket"],
      timeout: 3000,
      reconnection: false,
    });
    const err = await new Promise((resolve) => {
      socket.on("connect_error", resolve);
      setTimeout(() => resolve(null), 3000);
    });
    check("invalid token rejected", err !== null);
    socket.disconnect();
  } catch {
    check("invalid token rejected", true);
  }
}

async function testJoinRoomAndPresence(aliceToken, bobToken) {
  console.log("\n[collab: room join + presence]");

  // Create a scene as alice
  const { status, body: scene } = await req("/api/scenes", {
    method: "POST",
    token: aliceToken,
    body: { title: "collab-smoke-test" },
  });
  check("scene created", (status === 200 || status === 201) && scene?._id, `status=${status}`);
  if (!scene?._id) return null;

  const sceneId = scene._id;

  // Share with bob as editor
  const { status: shareStatus } = await req(
    `/api/scenes/${sceneId}/shares`,
    { method: "POST", token: aliceToken, body: { email: "bob@team.com", role: "editor" } },
  );
  check("scene shared with bob", shareStatus === 200);

  // Alice joins room
  const aliceSocket = await connectSocket(aliceToken);
  const initPromise = waitForEvent(aliceSocket, "scene-init");
  aliceSocket.emit("join-room", { sceneId });
  const initData = await initPromise;
  check("alice receives scene-init", !!initData);
  check("scene-init has collaborators array", Array.isArray(initData.collaborators));
  check("alice is in collaborators", initData.collaborators.length >= 1);

  // Bob joins room — alice should get collaborator-joined
  const bobSocket = await connectSocket(bobToken);
  const joinedPromise = waitForEvent(aliceSocket, "collaborator-joined");
  const bobInitPromise = waitForEvent(bobSocket, "scene-init");
  bobSocket.emit("join-room", { sceneId });

  const [joinedData, bobInit] = await Promise.all([joinedPromise, bobInitPromise]);
  check("alice receives collaborator-joined", !!joinedData);
  check("collaborator-joined has userId", typeof joinedData.userId === "string");
  check("collaborator-joined has username", typeof joinedData.username === "string");
  check("collaborator-joined has color", typeof joinedData.color === "string");
  check("bob receives scene-init", !!bobInit);
  check("bob sees 2 collaborators", bobInit.collaborators.length === 2, `got ${bobInit.collaborators.length}`);

  return { sceneId, aliceSocket, bobSocket };
}

async function testElementRelay(sceneId, aliceSocket, bobSocket) {
  console.log("\n[collab: element relay]");

  const elements = [
    { type: "rectangle", id: "relay-test-1", x: 10, y: 20, version: 1, versionNonce: 100 },
  ];

  // Alice sends scene-update, bob should receive it
  const updatePromise = waitForEvent(bobSocket, "scene-update");
  aliceSocket.emit("scene-update", { sceneId, elements });

  const received = await updatePromise;
  check("bob receives scene-update", !!received);
  check("received elements is array", Array.isArray(received.elements));
  check("received element has correct id", received.elements?.[0]?.id === "relay-test-1");
  check("received element has correct x", received.elements?.[0]?.x === 10);
}

async function testPointerRelay(sceneId, aliceSocket, bobSocket) {
  console.log("\n[collab: pointer relay]");

  const pointerPromise = waitForEvent(bobSocket, "pointer-update");
  aliceSocket.emit("pointer-update", {
    sceneId,
    pointer: { x: 100, y: 200 },
    button: "up",
  });

  const received = await pointerPromise;
  check("bob receives pointer-update", !!received);
  check("pointer has fromUserId", typeof received.fromUserId === "string");
  check("pointer has x coordinate", received.pointer?.x === 100);
  check("pointer has y coordinate", received.pointer?.y === 200);
  check("pointer has button", received.button === "up");
  check("pointer has username", typeof received.username === "string");
  check("pointer has color", typeof received.color === "string");
}

async function testViewerCannotUpdate(sceneId, aliceToken) {
  console.log("\n[collab: viewer enforcement]");

  // Share with carol as viewer
  await req(`/api/scenes/${sceneId}/shares`, {
    method: "POST",
    token: aliceToken,
    body: { email: "carol@team.com", role: "viewer" },
  });

  const carolToken = await login("carol@team.com", "pw");
  const carolSocket = await connectSocket(carolToken);
  const carolInit = waitForEvent(carolSocket, "scene-init");
  carolSocket.emit("join-room", { sceneId });
  await carolInit;

  // Carol tries to send scene-update — should get error
  const errorPromise = waitForEvent(carolSocket, "error", 3000).catch(() => null);
  carolSocket.emit("scene-update", {
    sceneId,
    elements: [{ type: "rectangle", id: "viewer-attack", x: 0, y: 0, version: 1 }],
  });

  const errorData = await errorPromise;
  check("viewer scene-update rejected", errorData !== null, "no error received");

  carolSocket.disconnect();
}

async function testPayloadValidation(sceneId, aliceSocket) {
  console.log("\n[collab: payload validation]");

  // Send elements as non-array
  const errorPromise = waitForEvent(aliceSocket, "error", 3000).catch(() => null);
  aliceSocket.emit("scene-update", { sceneId, elements: "not-an-array" });

  const errorData = await errorPromise;
  check("non-array elements rejected", errorData !== null);
}

async function testDisconnectCleanup(sceneId, aliceSocket, bobSocket) {
  console.log("\n[collab: disconnect cleanup]");

  const leftPromise = waitForEvent(aliceSocket, "collaborator-left");
  bobSocket.disconnect();

  const leftData = await leftPromise;
  check("alice receives collaborator-left on bob disconnect", !!leftData);
  check("collaborator-left has userId", typeof leftData.userId === "string");

  aliceSocket.disconnect();
}

async function testMetricsRequiresAdmin(aliceToken, bobToken) {
  console.log("\n[collab: metrics endpoint auth]");

  // Bob (non-admin) should be rejected
  const { status: bobStatus } = await req("/api/collab/metrics", { token: bobToken });
  check("non-admin rejected from metrics", bobStatus === 403, `status=${bobStatus}`);

  // Alice (admin) should succeed
  const { status: aliceStatus, body: metrics } = await req("/api/collab/metrics", { token: aliceToken });
  check("admin can access metrics", aliceStatus === 200, `status=${aliceStatus}`);
  check("metrics has activeRooms", typeof metrics?.activeRooms === "number");
  check("metrics has activeConnections", typeof metrics?.activeConnections === "number");
  check("metrics has memoryUsageMB", typeof metrics?.memoryUsageMB === "number");

  // No token at all
  const { status: noAuthStatus } = await req("/api/collab/metrics");
  check("unauthenticated rejected from metrics", noAuthStatus === 401, `status=${noAuthStatus}`);
}

async function testPointerRateLimiting(sceneId, aliceToken, bobToken) {
  console.log("\n[collab: pointer rate limiting]");

  const alice = await connectSocket(aliceToken);
  const bob = await connectSocket(bobToken);

  const aliceInit = waitForEvent(alice, "scene-init");
  alice.emit("join-room", { sceneId });
  await aliceInit;

  const bobInit = waitForEvent(bob, "scene-init");
  bob.emit("join-room", { sceneId });
  await bobInit;

  // Send 10 pointer updates rapidly — server should rate-limit to ~1 per 50ms
  let received = 0;
  bob.on("pointer-update", () => received++);

  for (let i = 0; i < 10; i++) {
    alice.emit("pointer-update", {
      sceneId,
      pointer: { x: i * 10, y: i * 10 },
      button: "down",
    });
  }

  // Wait 200ms for any that make it through
  await new Promise((r) => setTimeout(r, 200));

  check("pointer rate-limited (received < 10)", received < 10, `received=${received}`);
  check("at least 1 pointer got through", received >= 1, `received=${received}`);

  alice.disconnect();
  bob.disconnect();
}

async function cleanupScene(sceneId, token) {
  // Hard delete: soft delete first, then hard delete
  await req(`/api/scenes/${sceneId}`, { method: "DELETE", token });
  await req(`/api/scenes/${sceneId}?hard=1`, { method: "DELETE", token });
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Collab smoke tests against ${BASE}\n`);

  // Login all users
  const aliceToken = await login("alice@team.com", "pw");
  const bobToken = await login("bob@team.com", "pw");
  console.log("  ✓ alice logged in");
  console.log("  ✓ bob logged in");
  passed += 2;

  await testCollabEnabled();
  await testAuthRejectsNoToken();
  await testAuthRejectsInvalidToken();

  const ctx = await testJoinRoomAndPresence(aliceToken, bobToken);
  if (!ctx) {
    console.error("\nCannot continue — scene creation failed");
    process.exit(1);
  }

  await testElementRelay(ctx.sceneId, ctx.aliceSocket, ctx.bobSocket);
  await testPointerRelay(ctx.sceneId, ctx.aliceSocket, ctx.bobSocket);
  await testViewerCannotUpdate(ctx.sceneId, aliceToken);
  await testPayloadValidation(ctx.sceneId, ctx.aliceSocket);
  await testDisconnectCleanup(ctx.sceneId, ctx.aliceSocket, ctx.bobSocket);
  await testMetricsRequiresAdmin(aliceToken, bobToken);
  await testPointerRateLimiting(ctx.sceneId, aliceToken, bobToken);

  // Cleanup
  await cleanupScene(ctx.sceneId, aliceToken);

  console.log(`\n──────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`──────────────────────────────────────`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
