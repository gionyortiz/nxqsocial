#!/usr/bin/env node
"use strict";

/**
 * Read-only post-deploy check. Both targets must be supplied explicitly:
 *
 *   POST_DEPLOY_API_BASE_URL=https://api-staging.example.com/api
 *   POST_DEPLOY_FRONTEND_BASE_URL=https://staging.example.com
 *   node scripts/readiness-check.js
 */

const DEFAULT_TIMEOUT_MS = 10_000;

function explicitUrl(raw, name, expectedPath) {
  if (!raw?.trim()) throw new Error(`${name} is required`);
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} cannot contain credentials, query, or hash`);
  }
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]).has(
    parsed.hostname.toLowerCase(),
  );
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && loopback)
  ) {
    throw new Error(
      `${name} must use HTTPS (HTTP is allowed only on loopback)`,
    );
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (parsed.pathname !== expectedPath) {
    throw new Error(`${name} must have the canonical ${expectedPath} path`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function timeoutFromEnvironment(environment) {
  const raw = environment.POST_DEPLOY_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  if (!/^\d+$/.test(raw))
    throw new Error("POST_DEPLOY_TIMEOUT_MS must be an integer");
  const value = Number(raw);
  if (value < 1_000 || value > 30_000) {
    throw new Error("POST_DEPLOY_TIMEOUT_MS must be between 1000 and 30000");
  }
  return value;
}

async function getJson(url, timeoutMs) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "Cache-Control": "no-store" },
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (response.status !== 200)
    throw new Error(`${url} returned HTTP ${response.status}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} returned non-JSON content`);
  }
}

async function main(environment = process.env) {
  const api = explicitUrl(
    environment.POST_DEPLOY_API_BASE_URL,
    "POST_DEPLOY_API_BASE_URL",
    "/api",
  );
  const frontend = explicitUrl(
    environment.POST_DEPLOY_FRONTEND_BASE_URL,
    "POST_DEPLOY_FRONTEND_BASE_URL",
    "/",
  );
  const timeoutMs = timeoutFromEnvironment(environment);

  const checks = [
    [
      "API liveness",
      async () => {
        const body = await getJson(`${api}/health`, timeoutMs);
        if (body.status !== "ok")
          throw new Error("API health status is not ok");
      },
    ],
    [
      "API dependency readiness",
      async () => {
        const body = await getJson(`${api}/health/ready`, timeoutMs);
        if (body.status !== "ready")
          throw new Error("API readiness status is not ready");
        for (const dependency of ["database", "redis", "storage"]) {
          if (body.checks?.[dependency] !== "ok") {
            throw new Error(`${dependency} readiness is not ok`);
          }
        }
      },
    ],
    [
      "Frontend liveness",
      async () => {
        const body = await getJson(`${frontend}/health`, timeoutMs);
        if (body.status !== "ok" || body.service !== "nxq-social-frontend") {
          throw new Error("frontend health response is inconsistent");
        }
      },
    ],
  ];

  console.log(`Read-only post-deploy check: ${frontend} -> ${api}`);
  for (const [label, action] of checks) {
    await action();
    console.log(`[PASS] ${label}`);
  }
  console.log(`Readiness passed: ${checks.length} checks completed.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Readiness check failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { explicitUrl, main, timeoutFromEnvironment };
