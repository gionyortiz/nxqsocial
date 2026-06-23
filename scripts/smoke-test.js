#!/usr/bin/env node
/**
 * NXQ Social — Post-deployment smoke test
 *
 * Usage:
 *   node scripts/smoke-test.js https://api.nxqsocial.com
 *
 * Exits 0 on success, 1 on any failure.
 */

const BASE = process.argv[2];
if (!BASE) {
  console.error('Usage: node scripts/smoke-test.js <API_BASE_URL>');
  console.error('Example: node scripts/smoke-test.js https://api.nxqsocial.com');
  process.exit(1);
}

const API = BASE.replace(/\/$/, '') + '/api';
const SMOKE_PASSWORD = process.env.SMOKE_TEST_PASSWORD ?? `Smoke-${Date.now()}-Aa1!`;

let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${label}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

async function get(path, expectedStatus = 200) {
  const res = await fetch(`${API}${path}`);
  if (res.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

async function post(path, body, expectedStatus = 201) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== expectedStatus) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expected ${expectedStatus}, got ${res.status}. Body: ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

// ─── Random helpers ────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

// ─── Run checks ────────────────────────────────────────────────────────────
console.log(`\nNXQ Social smoke test → ${API}\n`);

(async () => {
  // 1. Liveness
  await check('GET /health returns 200', async () => {
    const body = await get('/health');
    if (body.status !== 'ok') throw new Error(`status is "${body.status}"`);
  });

  // 2. Readiness
  await check('GET /health/ready returns 200 (DB + Redis alive)', async () => {
    const body = await get('/health/ready');
    if (body.status !== 'ready') throw new Error(`status is "${body.status}"`);
    if (body.checks?.database !== 'ok') throw new Error('database check failed');
    if (body.checks?.redis !== 'ok') throw new Error('redis check failed');
  });

  // 3. Auth — register
  const id = uid();
  const email = `smoke_${id}@nxqsocial-test.invalid`;
  const username = `smoke_${id}`;
  const password = SMOKE_PASSWORD;
  let token;

  await check('POST /auth/register creates a new user', async () => {
    const body = await post('/auth/register', {
      email,
      username,
      password,
      displayName: 'Smoke Test',
    });
    if (!body.access_token) throw new Error('no access_token in response');
    token = body.access_token;
  });

  // 4. Auth — login
  await check('POST /auth/login returns JWT', async () => {
    const body = await post('/auth/login', { email, password }, 200);
    if (!body.access_token) throw new Error('no access_token');
    token = body.access_token; // refresh
  });

  // 5. Feed (authenticated)
  await check('GET /posts/feed returns 200 for authenticated user', async () => {
    const res = await fetch(`${API}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
  });

  // 6. 404 guard
  await check('GET /nonexistent returns 404', async () => {
    const res = await fetch(`${API}/nonexistent_endpoint_xyz`);
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
  });

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(45)}`);
  console.log(`  ${passed + failed} checks  |  ✅ ${passed} passed  |  ❌ ${failed} failed`);
  console.log(`${'─'.repeat(45)}\n`);

  if (failed > 0) process.exit(1);
})();
