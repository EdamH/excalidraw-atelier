#!/usr/bin/env node
// smoke-tests/features.test.mjs
//
// Smoke tests for all new features: brainstorm board, leaderboard, badges,
// activity log, random scene, template usage tracking, drawing streak,
// word cloud, scene health metadata (createdAt in list).
//
// Prerequisites:
//   - docker compose up -d (healthy stack on http://localhost:4100)
//   - alice@team.com / pw seeded (admin), bob@team.com / pw seeded
//
// Usage:
//   node smoke-tests/features.test.mjs

const BASE = process.env.BASE_URL ?? "http://localhost:4100";
const ALICE_EMAIL = "alice@team.com";
const BOB_EMAIL = "bob@team.com";
const PASSWORD = "pw";

let passed = 0;
let failed = 0;

function check(name, cond, details) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    if (details !== undefined) console.error(`    ${JSON.stringify(details)}`);
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

async function login(email, password = PASSWORD) {
  const { status, body } = await req("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (status !== 200 || !body?.token) {
    throw new Error(`Login failed for ${email} (${status})`);
  }
  return body.token;
}

// ─── Brainstorm Board ──────────────────────────────────────────────────────

async function testBrainstorm(token, bobToken) {
  console.log("\n[brainstorm: CRUD, votes, reactions]");

  // Create idea
  const { status: cs, body: idea } = await req("/api/brainstorm", {
    method: "POST",
    token,
    body: { title: "Smoke test idea", description: "Testing brainstorm", category: "fun" },
  });
  check("create idea → 201", cs === 201);
  check("idea has _id", !!idea?._id);
  check("idea has correct title", idea?.title === "Smoke test idea");
  check("idea has category", idea?.category === "fun");
  check("idea has voteCount 0", idea?.voteCount === 0);
  check("idea has reactions array", Array.isArray(idea?.reactions));
  const ideaId = idea?._id;

  // List ideas
  const { status: ls, body: list } = await req("/api/brainstorm", { token });
  check("list ideas → 200", ls === 200);
  check("list contains our idea", Array.isArray(list) && list.some((i) => i._id === ideaId));

  // Filter by category
  const { status: fs, body: filtered } = await req("/api/brainstorm?category=fun", { token });
  check("filter by category → 200", fs === 200);
  check("filtered contains our idea", Array.isArray(filtered) && filtered.some((i) => i._id === ideaId));

  const { body: wrongCat } = await req("/api/brainstorm?category=bug", { token });
  check("wrong category filter excludes our idea", Array.isArray(wrongCat) && !wrongCat.some((i) => i._id === ideaId));

  // Vote
  const { status: vs, body: voteRes } = await req(`/api/brainstorm/${ideaId}/vote`, {
    method: "PATCH",
    token,
    body: {},
  });
  check("vote → 200", vs === 200);
  check("vote count is 1", voteRes?.voteCount === 1);
  check("hasVoted is true", voteRes?.hasVoted === true);

  // Toggle vote off
  const { body: unvoteRes } = await req(`/api/brainstorm/${ideaId}/vote`, {
    method: "PATCH",
    token,
    body: {},
  });
  check("unvote → count 0", unvoteRes?.voteCount === 0);
  check("unvote → hasVoted false", unvoteRes?.hasVoted === false);

  // React
  const { status: rs, body: reactRes } = await req(`/api/brainstorm/${ideaId}/react`, {
    method: "PATCH",
    token,
    body: { emoji: "🔥" },
  });
  check("react → 200", rs === 200);
  check("react toggled on", reactRes?.toggled === true);

  // Toggle react off
  const { body: unreactRes } = await req(`/api/brainstorm/${ideaId}/react`, {
    method: "PATCH",
    token,
    body: { emoji: "🔥" },
  });
  check("unreact toggled off", unreactRes?.toggled === false);

  // Invalid emoji
  const { status: badEmoji } = await req(`/api/brainstorm/${ideaId}/react`, {
    method: "PATCH",
    token,
    body: { emoji: "💀" },
  });
  check("invalid emoji → 400", badEmoji === 400);

  // Title length limit
  const { status: longTitle } = await req("/api/brainstorm", {
    method: "POST",
    token,
    body: { title: "x".repeat(201) },
  });
  check("title > 200 chars → 400", longTitle === 400);

  // Bob can't delete Alice's idea
  const { status: bobDel } = await req(`/api/brainstorm/${ideaId}`, {
    method: "DELETE",
    token: bobToken,
  });
  check("non-author non-admin delete → 403", bobDel === 403);

  // Alice (admin) can delete
  const { status: ds } = await req(`/api/brainstorm/${ideaId}`, {
    method: "DELETE",
    token,
  });
  check("author delete → 204", ds === 204);

  // Verify deleted
  const { body: afterDel } = await req("/api/brainstorm", { token });
  check("idea gone after delete", Array.isArray(afterDel) && !afterDel.some((i) => i._id === ideaId));
}

// ─── Leaderboard ───────────────────────────────────────────────────────────

async function testLeaderboard(token) {
  console.log("\n[leaderboard: weekly + profile badges]");

  const { status, body } = await req("/api/leaderboard/weekly", { token });
  check("weekly leaderboard → 200", status === 200);
  check("has weekStart", typeof body?.weekStart === "string");
  check("has weekEnd", typeof body?.weekEnd === "string");
  check("has topEditors array", Array.isArray(body?.topEditors));
  check("has honorary array", Array.isArray(body?.honorary));

  // Editors should not have email field (security fix)
  if (body?.topEditors?.length > 0) {
    check("topEditors[0] has no email", !("email" in body.topEditors[0]));
    check("topEditors[0] has name", typeof body.topEditors[0].name === "string");
    check("topEditors[0] has rank", typeof body.topEditors[0].rank === "number");
  }

  // Cache test: second request should be fast (same data)
  const { status: s2, body: b2 } = await req("/api/leaderboard/weekly", { token });
  check("cached leaderboard → 200", s2 === 200);
  check("cached response matches", b2?.weekStart === body?.weekStart);

  // Profile badges — need a valid userId
  const { body: me } = await req("/api/me", { token });
  const userId = me?.user?.id;
  check("got user id for profile test", !!userId);

  if (userId) {
    const { status: ps, body: profile } = await req(`/api/profile/${userId}/badges`, { token });
    check("profile badges → 200", ps === 200);
    check("profile has user object", typeof profile?.user === "object");
    check("profile user has no email", !("email" in (profile?.user || {})));
    check("profile has awards array", Array.isArray(profile?.awards));
    check("profile has streak number", typeof profile?.streak === "number");
  }

  // Invalid userId
  const { status: bad } = await req("/api/profile/not-an-id/badges", { token });
  check("invalid userId → 400", bad === 400);
}

// ─── Achievement Badges ────────────────────────────────────────────────────

async function testBadges(token) {
  console.log("\n[badges: achievement badges]");

  const { status, body } = await req("/api/users/me/badges", { token });
  check("badges → 200", status === 200);
  check("badges is array", Array.isArray(body));
  check("has 8 badges", body?.length === 8);

  const ids = (body || []).map((b) => b.id);
  check("has first-drawing badge", ids.includes("first-drawing"));
  check("has prolific badge", ids.includes("prolific"));
  check("has 100-elements badge", ids.includes("100-elements"));
  check("has shared-5 badge", ids.includes("shared-5"));
  check("has night-owl badge", ids.includes("night-owl"));
  check("has speed-demon badge", ids.includes("speed-demon"));
  check("has organizer badge", ids.includes("organizer"));
  check("has tag-master badge", ids.includes("tag-master"));

  for (const badge of body || []) {
    check(`badge ${badge.id} has earned boolean`, typeof badge.earned === "boolean");
    check(`badge ${badge.id} has name`, typeof badge.name === "string");
    check(`badge ${badge.id} has description`, typeof badge.description === "string");
  }
}

// ─── Activity Log ──────────────────────────────────────────────────────────

async function testActivityLog(aliceToken, bobToken) {
  console.log("\n[activity log: paginated response, all action types logged]");

  const wait = () => new Promise((r) => setTimeout(r, 500));

  // Create a scene to generate a 'created' activity entry
  const { status: cs, body: scene } = await req("/api/scenes", {
    method: "POST",
    token: aliceToken,
    body: { title: "Activity log test scene" },
  });
  check("create scene for activity → 201", cs === 201);
  const sceneId = scene?._id;

  if (sceneId) {
    await wait();

    // Check paginated response shape
    const { status, body } = await req(`/api/scenes/${sceneId}/activity`, { token: aliceToken });
    check("activity log → 200", status === 200);
    check("response has items array", Array.isArray(body?.items));
    check("response has hasMore boolean", typeof body?.hasMore === "boolean");
    check("has at least 1 entry", body?.items?.length >= 1);

    if (body?.items?.length > 0) {
      const entry = body.items[0];
      check("entry has action", typeof entry.action === "string");
      check("entry action is 'created'", entry.action === "created");
      check("entry has userName", typeof entry.userName === "string");
      check("entry has createdAt", typeof entry.createdAt === "string");
    }

    // Rename → 'renamed'
    await req(`/api/scenes/${sceneId}`, {
      method: "PATCH",
      token: aliceToken,
      body: { title: "Renamed activity test" },
    });
    await wait();
    const { body: a1 } = await req(`/api/scenes/${sceneId}/activity`, { token: aliceToken });
    check("activity has 'renamed' entry", a1?.items?.some((e) => e.action === "renamed"));

    // Share with bob → 'shared'
    await req(`/api/scenes/${sceneId}/shares`, {
      method: "POST",
      token: aliceToken,
      body: { email: "bob@team.com", role: "editor" },
    });
    await wait();
    const { body: a2 } = await req(`/api/scenes/${sceneId}/activity`, { token: aliceToken });
    check("activity has 'shared' entry", a2?.items?.some((e) => e.action === "shared"));

    // Unshare bob → 'unshared'
    // First get bob's userId from the share response
    const bobUser = a2?.items?.find((e) => e.action === "shared");
    const { body: sceneDetail } = await req(`/api/scenes/${sceneId}`, { token: aliceToken });
    const bobShare = sceneDetail?.shares?.find((s) => s.email === "bob@team.com");
    if (bobShare) {
      await req(`/api/scenes/${sceneId}/shares/${bobShare.userId}`, {
        method: "DELETE",
        token: aliceToken,
      });
      await wait();
      const { body: a3 } = await req(`/api/scenes/${sceneId}/activity`, { token: aliceToken });
      check("activity has 'unshared' entry", a3?.items?.some((e) => e.action === "unshared"));
    }

    // Duplicate → 'duplicated' on source
    const { body: copy } = await req(`/api/scenes/${sceneId}/copy`, {
      method: "POST",
      token: aliceToken,
      body: { title: "Copy of activity test" },
    });
    await wait();
    const { body: a4 } = await req(`/api/scenes/${sceneId}/activity`, { token: aliceToken });
    check("activity has 'duplicated' entry", a4?.items?.some((e) => e.action === "duplicated"));
    // Cleanup the copy
    if (copy?._id) {
      await req(`/api/scenes/${copy._id}`, { method: "DELETE", token: aliceToken });
      await req(`/api/scenes/${copy._id}?hard=1`, { method: "DELETE", token: aliceToken });
    }

    // Soft-delete → 'deleted'
    await req(`/api/scenes/${sceneId}`, { method: "DELETE", token: aliceToken });
    await wait();
    const { body: a5 } = await req(`/api/scenes/${sceneId}/activity`, { token: aliceToken });
    check("activity has 'deleted' entry", a5?.items?.some((e) => e.action === "deleted"));

    // Restore → 'restored'
    await req(`/api/scenes/${sceneId}/restore`, { method: "POST", token: aliceToken });
    await wait();
    const { body: a6 } = await req(`/api/scenes/${sceneId}/activity`, { token: aliceToken });
    check("activity has 'restored' entry", a6?.items?.some((e) => e.action === "restored"));

    // Pagination: use before cursor
    if (a6?.items?.length > 1) {
      const cursor = a6.items[a6.items.length - 1].createdAt;
      const { status: ps, body: page2 } = await req(
        `/api/scenes/${sceneId}/activity?before=${encodeURIComponent(cursor)}`,
        { token: aliceToken },
      );
      check("pagination with ?before → 200", ps === 200);
      check("paginated response has items", Array.isArray(page2?.items));
    }

    // Cleanup
    await req(`/api/scenes/${sceneId}`, { method: "DELETE", token: aliceToken });
    await req(`/api/scenes/${sceneId}?hard=1`, { method: "DELETE", token: aliceToken });
  }
}

// ─── Random Scene ──────────────────────────────────────────────────────────

async function testRandomScene(token) {
  console.log("\n[random scene: returns a random accessible scene]");

  // Ensure at least one scene exists
  const { body: scene } = await req("/api/scenes", {
    method: "POST",
    token,
    body: { title: "Random scene test" },
  });
  const sceneId = scene?._id;

  const { status, body } = await req("/api/scenes/random", { token });
  check("random scene → 200", status === 200);
  check("has sceneId field", "sceneId" in (body || {}));
  check("sceneId is string or null", typeof body?.sceneId === "string" || body?.sceneId === null);

  // If there are scenes, sceneId should be non-null
  if (sceneId) {
    check("sceneId is non-null (scenes exist)", body?.sceneId !== null);
  }

  // Cleanup
  if (sceneId) {
    await req(`/api/scenes/${sceneId}`, { method: "DELETE", token });
    await req(`/api/scenes/${sceneId}?hard=1`, { method: "DELETE", token });
  }
}

// ─── Template Usage Tracking ───────────────────────────────────────────────

async function testTemplateUsage(token) {
  console.log("\n[template usage: increment counter]");

  // List templates to get an ID
  const { body: templates } = await req("/api/templates", { token });
  check("templates list is array", Array.isArray(templates));

  if (templates?.length > 0) {
    const tmpl = templates[0];
    const initialUsage = tmpl.usageCount ?? 0;

    // Track usage
    const { status } = await req(`/api/templates/${tmpl._id}/use`, {
      method: "POST",
      token,
      body: {},
    });
    check("track usage → 200", status === 200);

    // Verify count incremented
    const { body: after } = await req("/api/templates", { token });
    const updated = after?.find((t) => t._id === tmpl._id);
    check("usageCount incremented", (updated?.usageCount ?? 0) === initialUsage + 1);
    check("usageCount is in list response", typeof updated?.usageCount === "number");
  }

  // Non-existent template
  const { status: bad } = await req("/api/templates/000000000000000000000000/use", {
    method: "POST",
    token,
    body: {},
  });
  check("non-existent template → 404", bad === 404);
}

// ─── Stats: Drawing Streak + Word Cloud ────────────────────────────────────

async function testStats(token) {
  console.log("\n[stats: drawing streak, word cloud, badges in stats]");

  const { status, body } = await req("/api/users/me/stats", { token });
  check("stats → 200", status === 200);
  check("has drawingStreak", typeof body?.drawingStreak === "number");
  check("drawingStreak >= 0", body?.drawingStreak >= 0);
  check("has longestStreak", typeof body?.longestStreak === "number");
  check("longestStreak >= drawingStreak", body?.longestStreak >= body?.drawingStreak);
  check("has topWords", Array.isArray(body?.topWords));
  check("has sceneCount", typeof body?.sceneCount === "number");
  check("has totalElements", typeof body?.totalElements === "number");
  check("has quotaUsage", typeof body?.quotaUsage === "object");
}

// ─── Scene List: createdAt field ───────────────────────────────────────────

async function testSceneCreatedAt(token) {
  console.log("\n[scene list: createdAt in response]");

  const { body: scene } = await req("/api/scenes", {
    method: "POST",
    token,
    body: { title: "CreatedAt test" },
  });
  check("create scene has createdAt", typeof scene?.createdAt === "string" || typeof scene?.createdAt === "object");

  const { body: list } = await req("/api/scenes", { token });
  check("scene list is array", Array.isArray(list));
  if (list?.length > 0) {
    check("list items have createdAt", "createdAt" in list[0]);
  }

  // Cleanup
  if (scene?._id) {
    await req(`/api/scenes/${scene._id}`, { method: "DELETE", token });
    await req(`/api/scenes/${scene._id}?hard=1`, { method: "DELETE", token });
  }
}

// ─── Weekly Awards Cron ───────────────────────────────────────────────────

async function testWeeklyAwardsCron(aliceToken, bobToken) {
  console.log("\n[weekly awards cron: admin trigger, idempotency, auth guards]");

  // Non-admin (bob) should be rejected
  const { status: s403 } = await req("/api/admin/compute-weekly-awards", {
    method: "POST",
    token: bobToken,
  });
  check("non-admin POST → 403", s403 === 403);

  // Unauthenticated should be rejected
  const { status: s401 } = await req("/api/admin/compute-weekly-awards", {
    method: "POST",
  });
  check("unauthenticated POST → 401", s401 === 401);

  // Admin trigger: compute awards for previous week
  const { status: cs, body: cb } = await req("/api/admin/compute-weekly-awards", {
    method: "POST",
    token: aliceToken,
  });
  check("admin compute → 200", cs === 200);
  check("response has ok: true", cb?.ok === true);
  check("response has weekStart", typeof cb?.weekStart === "string");
  check("response has awardsWritten", typeof cb?.awardsWritten === "number");
  const firstWritten = cb?.awardsWritten ?? 0;

  // Idempotency: second call should write 0 new awards
  const { status: cs2, body: cb2 } = await req("/api/admin/compute-weekly-awards", {
    method: "POST",
    token: aliceToken,
  });
  check("idempotent compute → 200", cs2 === 200);
  check("idempotent awardsWritten ≤ first run", (cb2?.awardsWritten ?? 0) <= firstWritten);

  // Profile should now reflect awards (if any were written)
  const { body: me } = await req("/api/me", { token: aliceToken });
  const userId = me?.user?.id;
  if (userId && firstWritten > 0) {
    const { status: ps, body: profile } = await req(`/api/profile/${userId}/badges`, { token: aliceToken });
    check("profile after compute → 200", ps === 200);
    check("profile awards non-empty after compute", profile?.awards?.length > 0);
  }

  // Backfill with valid param
  const { status: bs, body: bb } = await req("/api/admin/compute-weekly-awards", {
    method: "POST",
    token: aliceToken,
    body: { backfillWeeks: 2 },
  });
  check("backfill 2 weeks → 200", bs === 200);
  check("backfill response has ok", bb?.ok === true);
  check("backfill response has message", typeof bb?.message === "string");

  // Invalid backfillWeeks: too high
  const { status: bh } = await req("/api/admin/compute-weekly-awards", {
    method: "POST",
    token: aliceToken,
    body: { backfillWeeks: 100 },
  });
  check("backfillWeeks > 52 → 400", bh === 400);

  // Invalid backfillWeeks: not a number
  const { status: bn } = await req("/api/admin/compute-weekly-awards", {
    method: "POST",
    token: aliceToken,
    body: { backfillWeeks: "three" },
  });
  check("backfillWeeks string → 400", bn === 400);

  // Invalid backfillWeeks: zero
  const { status: bz } = await req("/api/admin/compute-weekly-awards", {
    method: "POST",
    token: aliceToken,
    body: { backfillWeeks: 0 },
  });
  check("backfillWeeks 0 → 400", bz === 400);

  // Invalid backfillWeeks: float
  const { status: bf } = await req("/api/admin/compute-weekly-awards", {
    method: "POST",
    token: aliceToken,
    body: { backfillWeeks: 2.5 },
  });
  check("backfillWeeks float → 400", bf === 400);
}

// ─── Auth: unauthenticated access ──────────────────────────────────────────

async function testAuthGuards() {
  console.log("\n[auth guards: new endpoints require auth]");

  const endpoints = [
    ["/api/brainstorm", "GET"],
    ["/api/brainstorm", "POST"],
    ["/api/leaderboard/weekly", "GET"],
    ["/api/users/me/badges", "GET"],
    ["/api/scenes/random", "GET"],
  ];

  for (const [path, method] of endpoints) {
    const { status } = await req(path, { method, body: method === "POST" ? {} : undefined });
    check(`${method} ${path} without auth → 401`, status === 401);
  }
}

// ─── User Deletion Cascade ────────────────────────────────────────────────

async function testUserDeletionCascade(aliceToken) {
  console.log("\n[user deletion cascade: transfers shared scenes, deletes unshared]");

  // Create a temporary user
  const tempEmail = `cascade-test-${Date.now()}@team.com`;
  const { status: cus, body: tempUser } = await req("/api/admin/users", {
    method: "POST",
    token: aliceToken,
    body: { email: tempEmail, password: "pw", name: "Cascade Test" },
  });
  check("create temp user → 201", cus === 201);
  const tempUserId = tempUser?.id;
  if (!tempUserId) return;

  // Login as temp user
  const tempToken = await login(tempEmail);

  // Create a scene with no shares (should be deleted on cascade)
  const { body: unsharedScene } = await req("/api/scenes", {
    method: "POST",
    token: tempToken,
    body: { title: "Unshared cascade scene" },
  });
  const unsharedId = unsharedScene?._id;
  check("created unshared scene", !!unsharedId);

  // Create a scene and share with alice (should be transferred to alice on cascade)
  const { body: sharedScene } = await req("/api/scenes", {
    method: "POST",
    token: tempToken,
    body: { title: "Shared cascade scene" },
  });
  const sharedId = sharedScene?._id;
  check("created shared scene", !!sharedId);

  if (sharedId) {
    await req(`/api/scenes/${sharedId}/shares`, {
      method: "POST",
      token: tempToken,
      body: { email: "alice@team.com", role: "editor" },
    });
  }

  // Now delete the temp user — should cascade
  const { status: ds, body: delResult } = await req(`/api/admin/users/${tempUserId}`, {
    method: "DELETE",
    token: aliceToken,
  });
  check("delete user → 200", ds === 200);
  check("response has scenesTransferred", typeof delResult?.scenesTransferred === "number");
  check("response has scenesDeleted", typeof delResult?.scenesDeleted === "number");
  check("1 scene transferred", delResult?.scenesTransferred === 1);
  check("1 scene deleted", delResult?.scenesDeleted === 1);

  // Verify: unshared scene is gone
  const { status: gs1 } = await req(`/api/scenes/${unsharedId}`, { token: aliceToken });
  check("unshared scene deleted (404)", gs1 === 404);

  // Verify: shared scene transferred to alice (alice can access it as owner)
  if (sharedId) {
    const { status: gs2, body: transferred } = await req(`/api/scenes/${sharedId}`, { token: aliceToken });
    check("shared scene accessible after transfer", gs2 === 200);
    check("alice is now owner", transferred?.role === "owner");

    // Cleanup transferred scene
    await req(`/api/scenes/${sharedId}`, { method: "DELETE", token: aliceToken });
    await req(`/api/scenes/${sharedId}?hard=1`, { method: "DELETE", token: aliceToken });
  }
}

// ─── Scene Move (PATCH folderId invalidates ETag) ─────────────────────────

async function testSceneMove(aliceToken) {
  console.log("\n[scene move: PATCH folderId bumps updatedAt, folder picker works]");

  // Create a folder
  const { status: fs, body: folder } = await req("/api/folders", {
    method: "POST",
    token: aliceToken,
    body: { name: "Move test folder" },
  });
  check("create folder → 201", fs === 201);
  const folderId = folder?._id;

  // Create a scene
  const { body: scene } = await req("/api/scenes", {
    method: "POST",
    token: aliceToken,
    body: { title: "Move test scene" },
  });
  const sceneId = scene?._id;
  check("create scene for move", !!sceneId);

  if (sceneId && folderId) {
    const beforeUpdatedAt = scene.updatedAt;

    // Small delay so updatedAt can differ
    await new Promise((r) => setTimeout(r, 50));

    // Move to folder via PATCH
    const { status: ms, body: moved } = await req(`/api/scenes/${sceneId}`, {
      method: "PATCH",
      token: aliceToken,
      body: { folderId },
    });
    check("PATCH move → 200", ms === 200);
    check("folderId set correctly", moved?.folderId === folderId);
    check("updatedAt bumped after move", moved?.updatedAt !== beforeUpdatedAt);

    // Move back to unfiled
    const { status: us, body: unfiled } = await req(`/api/scenes/${sceneId}`, {
      method: "PATCH",
      token: aliceToken,
      body: { folderId: null },
    });
    check("PATCH unfiled → 200", us === 200);
    check("folderId is null after unfiling", unfiled?.folderId === null);

    // Cleanup
    await req(`/api/scenes/${sceneId}`, { method: "DELETE", token: aliceToken });
    await req(`/api/scenes/${sceneId}?hard=1`, { method: "DELETE", token: aliceToken });
  }

  // Cleanup folder
  if (folderId) {
    await req(`/api/folders/${folderId}`, { method: "DELETE", token: aliceToken });
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSmoke tests for new features — ${BASE}\n`);

  let aliceToken, bobToken;
  try {
    aliceToken = await login(ALICE_EMAIL);
    bobToken = await login(BOB_EMAIL);
    console.log("  ✓ logged in as alice (admin) and bob");
    passed += 2;
  } catch (e) {
    console.error(`  ✗ login failed: ${e.message}`);
    process.exit(1);
  }

  await testAuthGuards();
  await testBrainstorm(aliceToken, bobToken);
  await testLeaderboard(aliceToken);
  await testBadges(aliceToken);
  await testActivityLog(aliceToken, bobToken);
  await testRandomScene(aliceToken);
  await testTemplateUsage(aliceToken);
  await testStats(aliceToken);
  await testSceneCreatedAt(aliceToken);
  await testSceneMove(aliceToken);
  await testUserDeletionCascade(aliceToken);
  await testWeeklyAwardsCron(aliceToken, bobToken);

  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
