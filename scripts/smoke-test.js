#!/usr/bin/env node
"use strict";

/**
 * Destructive staging smoke test for the hardened registration flow.
 *
 * This script creates a user. It intentionally has no production URL or
 * credential defaults, and it will not log in until email ownership has been
 * verified with an explicitly supplied OTP mechanism.
 *
 * Required inputs:
 *   SMOKE_API_BASE_URL (or the first CLI argument)
 *   SMOKE_TEST_EMAIL
 *   SMOKE_TEST_PASSWORD
 *   SMOKE_TEST_PASSWORD_CONFIRMATION
 *   SMOKE_TURNSTILE_TOKEN
 *
 * Verification must also be explicit. Use one of:
 *   SMOKE_EMAIL_VERIFICATION_CODE=123456
 *   SMOKE_INTERACTIVE_EMAIL_VERIFICATION=true (TTY only; prompts after signup)
 *
 * Every remote target additionally requires all three exact safety gates:
 *   SMOKE_ALLOW_USER_CREATION=I_UNDERSTAND_THIS_CREATES_A_USER
 *   SMOKE_EXPECTED_API_ORIGIN=https://exact-staging-api.example.com
 *   SMOKE_TARGET_ENVIRONMENT=staging
 *
 * Known production hosts remain blocked unless this separate exceptional
 * acknowledgement is also supplied (it does not relax the gates above):
 *   SMOKE_ALLOW_PRODUCTION=I_UNDERSTAND_THIS_TARGETS_PRODUCTION
 */

const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const PRODUCTION_HOSTS = new Set([
  "api.nxqsocial.com",
  "nxqsocial.com",
  "www.nxqsocial.com",
]);
const USER_CREATION_ACKNOWLEDGEMENT = "I_UNDERSTAND_THIS_CREATES_A_USER";
const PRODUCTION_ACKNOWLEDGEMENT = "I_UNDERSTAND_THIS_TARGETS_PRODUCTION";
const DEFAULT_TIMEOUT_MS = 10_000;

function required(environment, name, preserveWhitespace = false) {
  const raw = environment[name];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`${name} is required`);
  }
  return preserveWhitespace ? raw : raw.trim();
}

function normalizeApiBase(rawValue, environment = process.env) {
  if (!rawValue?.trim()) {
    throw new Error(
      "SMOKE_API_BASE_URL or an explicit API base URL argument is required",
    );
  }

  let parsed;
  try {
    parsed = new URL(rawValue.trim());
  } catch {
    throw new Error("The API base URL must be an absolute URL");
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "The API base URL cannot contain credentials, query, or hash",
    );
  }

  const normalizedHostname = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  if (!normalizedHostname)
    throw new Error("The API base URL hostname is invalid");
  // Canonicalize a trailing-dot FQDN before origin comparison and production
  // classification so `api.nxqsocial.com.` cannot bypass either gate.
  if (parsed.hostname !== normalizedHostname)
    parsed.hostname = normalizedHostname;

  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]).has(
    normalizedHostname,
  );
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && loopback)
  ) {
    throw new Error(
      "The API base URL must use HTTPS (HTTP is allowed only on loopback)",
    );
  }

  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/" && path !== "/api") {
    throw new Error("The API base URL path must be / or /api");
  }
  parsed.pathname = "/api";

  if (!loopback) {
    if (
      environment.SMOKE_ALLOW_USER_CREATION !== USER_CREATION_ACKNOWLEDGEMENT
    ) {
      throw new Error(
        `Remote smoke tests create a user. Set SMOKE_ALLOW_USER_CREATION=${USER_CREATION_ACKNOWLEDGEMENT} to acknowledge that explicitly.`,
      );
    }
    if (environment.SMOKE_TARGET_ENVIRONMENT !== "staging") {
      throw new Error("SMOKE_TARGET_ENVIRONMENT must be exactly staging");
    }

    const expectedOrigin = environment.SMOKE_EXPECTED_API_ORIGIN?.trim();
    if (!expectedOrigin) {
      throw new Error(
        "SMOKE_EXPECTED_API_ORIGIN is required for remote targets",
      );
    }
    if (expectedOrigin !== parsed.origin) {
      throw new Error(
        `SMOKE_EXPECTED_API_ORIGIN must exactly match the normalized API origin ${parsed.origin}`,
      );
    }
  }

  if (
    PRODUCTION_HOSTS.has(normalizedHostname) &&
    environment.SMOKE_ALLOW_PRODUCTION !== PRODUCTION_ACKNOWLEDGEMENT
  ) {
    throw new Error(
      `Known production hosts are blocked. Set the separate SMOKE_ALLOW_PRODUCTION=${PRODUCTION_ACKNOWLEDGEMENT} acknowledgement to proceed exceptionally.`,
    );
  }

  return parsed.toString().replace(/\/$/, "");
}

function validatePassword(password, confirmation) {
  if (password !== confirmation) {
    throw new Error(
      "SMOKE_TEST_PASSWORD_CONFIRMATION does not match SMOKE_TEST_PASSWORD",
    );
  }
  const failures = [];
  if (password.length < 12) failures.push("at least 12 characters");
  if (!/[A-Z]/.test(password)) failures.push("an uppercase letter");
  if (!/[a-z]/.test(password)) failures.push("a lowercase letter");
  if (!/[0-9]/.test(password)) failures.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) failures.push("a special character");
  if (failures.length) {
    throw new Error(`SMOKE_TEST_PASSWORD must contain ${failures.join(", ")}`);
  }
}

function validateDeliverableEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("SMOKE_TEST_EMAIL must be a valid email address");
  }
  const domain = email.split("@").at(-1).toLowerCase();
  if (
    domain === "localhost" ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".example") ||
    domain.endsWith(".test")
  ) {
    throw new Error(
      "SMOKE_TEST_EMAIL must be a controlled, deliverable inbox so email verification can be tested",
    );
  }
}

function parseTimeout(environment) {
  const raw = environment.SMOKE_REQUEST_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  if (!/^\d+$/.test(raw)) {
    throw new Error("SMOKE_REQUEST_TIMEOUT_MS must be an integer");
  }
  const timeoutMs = Number(raw);
  if (timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("SMOKE_REQUEST_TIMEOUT_MS must be between 1000 and 30000");
  }
  return timeoutMs;
}

function loadConfig(
  argv = process.argv,
  environment = process.env,
  terminal = {},
) {
  const api = normalizeApiBase(
    argv[2] ?? environment.SMOKE_API_BASE_URL,
    environment,
  );
  const email = required(environment, "SMOKE_TEST_EMAIL").toLowerCase();
  const password = required(environment, "SMOKE_TEST_PASSWORD", true);
  const passwordConfirmation = required(
    environment,
    "SMOKE_TEST_PASSWORD_CONFIRMATION",
    true,
  );
  const turnstileToken = required(environment, "SMOKE_TURNSTILE_TOKEN");
  const verificationCode = environment.SMOKE_EMAIL_VERIFICATION_CODE?.trim();
  const interactiveVerification =
    environment.SMOKE_INTERACTIVE_EMAIL_VERIFICATION === "true";
  const inputIsTty = terminal.inputIsTty ?? stdin.isTTY;
  const outputIsTty = terminal.outputIsTty ?? stdout.isTTY;

  validateDeliverableEmail(email);
  validatePassword(password, passwordConfirmation);
  if (turnstileToken.length > 4096) {
    throw new Error("SMOKE_TURNSTILE_TOKEN exceeds the API limit");
  }
  if (verificationCode && !/^\d{6}$/.test(verificationCode)) {
    throw new Error("SMOKE_EMAIL_VERIFICATION_CODE must be exactly six digits");
  }
  if (!verificationCode && !interactiveVerification) {
    throw new Error(
      "Set SMOKE_EMAIL_VERIFICATION_CODE or explicitly enable SMOKE_INTERACTIVE_EMAIL_VERIFICATION=true",
    );
  }
  if (
    !verificationCode &&
    interactiveVerification &&
    (!inputIsTty || !outputIsTty)
  ) {
    throw new Error("Interactive email verification requires an attached TTY");
  }

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const username = (
    environment.SMOKE_TEST_USERNAME?.trim() || `smoke_${suffix}`
  ).toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
    throw new Error(
      "SMOKE_TEST_USERNAME must be 3-30 lowercase letters, numbers, underscores, or dots",
    );
  }
  const displayName =
    environment.SMOKE_TEST_DISPLAY_NAME?.trim() || "NXQ Smoke Test";
  if (displayName.length < 2 || displayName.length > 50) {
    throw new Error("SMOKE_TEST_DISPLAY_NAME must be 2-50 characters");
  }

  return {
    api,
    email,
    password,
    passwordConfirmation,
    turnstileToken,
    verificationCode,
    interactiveVerification,
    username,
    displayName,
    timeoutMs: parseTimeout(environment),
  };
}

function buildRegistrationPayload(config) {
  // Confirmation is deliberately checked locally and omitted. The strict API
  // DTO accepts `password`, not the form-only confirmation field.
  return {
    email: config.email,
    username: config.username,
    password: config.password,
    displayName: config.displayName,
    agreeToTerms: true,
    turnstileToken: config.turnstileToken,
  };
}

function describeFailure(response, body) {
  if (!body || typeof body !== "object") return `HTTP ${response.status}`;
  const code = typeof body.code === "string" ? body.code : undefined;
  const message = Array.isArray(body.message)
    ? body.message.join("; ")
    : typeof body.message === "string"
      ? body.message
      : undefined;
  return [`HTTP ${response.status}`, code, message].filter(Boolean).join(" - ");
}

async function requestJson(config, method, path, body, expectedStatus) {
  const response = await fetch(`${config.api}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      "Cache-Control": "no-store",
      "User-Agent": "nxq-social-staging-smoke/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const text = await response.text();
  let parsed = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      if (response.status === expectedStatus) {
        throw new Error(`HTTP ${response.status} returned non-JSON content`);
      }
    }
  }
  if (response.status !== expectedStatus) {
    throw new Error(describeFailure(response, parsed));
  }
  return parsed;
}

function assertRegistrationPending(body, expectedEmail) {
  if (body.status !== "EMAIL_VERIFICATION_REQUIRED") {
    throw new Error("registration did not return EMAIL_VERIFICATION_REQUIRED");
  }
  if (
    body.requiresEmailVerification !== true ||
    body.verification?.required !== true
  ) {
    throw new Error("registration did not require email verification");
  }
  if (
    body.verification?.channel !== "email" ||
    body.verification?.sent !== true
  ) {
    throw new Error(
      "the verification email was not provider-confirmed as sent",
    );
  }
  if (!body.verification_token || typeof body.verification_token !== "string") {
    throw new Error("registration did not return a verification token");
  }
  if (body.access_token !== body.verification_token) {
    throw new Error("registration returned an unexpected session-token shape");
  }
  if (body.user?.email !== expectedEmail) {
    throw new Error("registration returned the wrong user");
  }
  if (
    body.user?.emailVerified !== false ||
    body.user?.emailVerificationRequired !== true
  ) {
    throw new Error(
      "the new user was not left in the expected unverified state",
    );
  }
}

async function resolveVerificationCode(config) {
  if (config.verificationCode) return config.verificationCode;
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    const code = (
      await prompt.question("Enter the 6-digit code sent to the smoke inbox: ")
    ).trim();
    if (!/^\d{6}$/.test(code)) {
      throw new Error(
        "The entered verification code must be exactly six digits",
      );
    }
    return code;
  } finally {
    prompt.close();
  }
}

function maskedEmail(email) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`Smoke preflight refused to run: ${error.message}`);
    console.error(
      "Run `node scripts/smoke-test.js --help` for required inputs.",
    );
    process.exitCode = 1;
    return;
  }

  let passed = 0;
  async function check(label, action) {
    process.stdout.write(`  [RUN]  ${label}\n`);
    const result = await action();
    passed += 1;
    process.stdout.write(`  [PASS] ${label}\n`);
    return result;
  }

  console.log(`\nNXQ Social destructive staging smoke test -> ${config.api}`);
  console.log(`Controlled inbox: ${maskedEmail(config.email)}`);
  console.log("No credential, Turnstile token, OTP, or JWT will be printed.\n");

  try {
    await check("API liveness is healthy", async () => {
      const body = await requestJson(config, "GET", "/health", undefined, 200);
      if (body.status !== "ok") throw new Error("API health status is not ok");
    });

    await check("database, Redis, and object storage are ready", async () => {
      const body = await requestJson(
        config,
        "GET",
        "/health/ready",
        undefined,
        200,
      );
      if (body.status !== "ready")
        throw new Error("API readiness status is not ready");
      for (const dependency of ["database", "redis", "storage"]) {
        if (body.checks?.[dependency] !== "ok") {
          throw new Error(`${dependency} readiness is not ok`);
        }
      }
    });

    const registration = await check(
      "registration requires provider-confirmed email verification",
      async () => {
        const body = await requestJson(
          config,
          "POST",
          "/auth/register",
          buildRegistrationPayload(config),
          201,
        );
        assertRegistrationPending(body, config.email);
        return body;
      },
    );

    await check(
      "pending verification token cannot access authenticated feed",
      async () => {
        const response = await fetch(`${config.api}/posts/feed`, {
          headers: {
            Authorization: `Bearer ${registration.verification_token}`,
            "Cache-Control": "no-store",
          },
          redirect: "error",
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        await response.body?.cancel();
        if (response.status !== 401) {
          throw new Error(
            `pending token should be rejected with 401, received ${response.status}`,
          );
        }
      },
    );

    const verificationCode = await resolveVerificationCode(config);
    const verification = await check(
      "email ownership verification activates the account",
      async () => {
        const body = await requestJson(
          config,
          "POST",
          "/auth/verify-email",
          {
            verificationToken: registration.verification_token,
            code: verificationCode,
          },
          200,
        );
        if (
          body.verified !== true ||
          body.channel !== "email" ||
          !body.access_token
        ) {
          throw new Error("verification did not return an activated session");
        }
        if (
          body.user?.emailVerified !== true ||
          body.user?.emailVerificationRequired !== false
        ) {
          throw new Error("verified user flags are inconsistent");
        }
        return body;
      },
    );

    await check("verified session can access authenticated feed", async () => {
      const response = await fetch(`${config.api}/posts/feed`, {
        headers: {
          Authorization: `Bearer ${verification.access_token}`,
          "Cache-Control": "no-store",
        },
        redirect: "error",
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      await response.body?.cancel();
      if (response.status !== 200)
        throw new Error(`authenticated feed returned ${response.status}`);
    });

    await check("login succeeds only after verification", async () => {
      const body = await requestJson(
        config,
        "POST",
        "/auth/login",
        { email: config.email, password: config.password },
        200,
      );
      if (!body.access_token || body.requiresEmailVerification === true) {
        throw new Error("login did not return a normal verified session");
      }
      if (body.user?.emailVerificationRequired !== false) {
        throw new Error("login returned an email-verification-required user");
      }
    });

    await check("unknown API route returns 404", async () => {
      const response = await fetch(`${config.api}/nonexistent_smoke_route`, {
        redirect: "error",
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      await response.body?.cancel();
      if (response.status !== 404)
        throw new Error(`expected 404, received ${response.status}`);
    });

    console.log(`\nSmoke test passed: ${passed} checks completed.`);
    console.log(
      "The synthetic smoke account remains in the target staging database.\n",
    );
  } catch (error) {
    console.error(`\n[FAIL] ${error.message}`);
    console.error(`Smoke test stopped after ${passed} completed checks.\n`);
    process.exitCode = 1;
  }
}

function printHelp() {
  console.log(`Usage:
  node scripts/smoke-test.js <API_BASE_URL>

Required environment:
  SMOKE_TEST_EMAIL=<controlled deliverable inbox>
  SMOKE_TEST_PASSWORD=<12+ character strong password>
  SMOKE_TEST_PASSWORD_CONFIRMATION=<same password>
  SMOKE_TURNSTILE_TOKEN=<fresh caller-supplied register-action token>

Verification (choose one):
  SMOKE_EMAIL_VERIFICATION_CODE=<six digits>
  SMOKE_INTERACTIVE_EMAIL_VERIFICATION=true

Every non-loopback target also requires:
  SMOKE_ALLOW_USER_CREATION=I_UNDERSTAND_THIS_CREATES_A_USER
  SMOKE_EXPECTED_API_ORIGIN=<exact normalized API origin, without /api>
  SMOKE_TARGET_ENVIRONMENT=staging

Known production hosts are blocked unless this additional exact value is set:
  SMOKE_ALLOW_PRODUCTION=I_UNDERSTAND_THIS_TARGETS_PRODUCTION

There is no production URL, password, Turnstile, email, or authorization default.`);
}

if (require.main === module) {
  if (process.argv.includes("--help") || process.argv.includes("-h"))
    printHelp();
  else void main();
}

module.exports = {
  PRODUCTION_ACKNOWLEDGEMENT,
  USER_CREATION_ACKNOWLEDGEMENT,
  assertRegistrationPending,
  buildRegistrationPayload,
  loadConfig,
  normalizeApiBase,
  validatePassword,
};
