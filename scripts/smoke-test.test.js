"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PRODUCTION_ACKNOWLEDGEMENT,
  USER_CREATION_ACKNOWLEDGEMENT,
  assertRegistrationPending,
  buildRegistrationPayload,
  loadConfig,
  normalizeApiBase,
} = require("./smoke-test");
const { explicitUrl } = require("./readiness-check");

function validEnvironment(overrides = {}) {
  return {
    SMOKE_API_BASE_URL: "https://api.staging.example.com/api",
    SMOKE_TEST_EMAIL: "controlled@example.org",
    SMOKE_TEST_PASSWORD: "Strong_Password1!",
    SMOKE_TEST_PASSWORD_CONFIRMATION: "Strong_Password1!",
    SMOKE_TURNSTILE_TOKEN: "caller-supplied-token",
    SMOKE_EMAIL_VERIFICATION_CODE: "123456",
    SMOKE_ALLOW_USER_CREATION: USER_CREATION_ACKNOWLEDGEMENT,
    SMOKE_EXPECTED_API_ORIGIN: "https://api.staging.example.com",
    SMOKE_TARGET_ENVIRONMENT: "staging",
    ...overrides,
  };
}

test("smoke preflight fails closed when confirmation or verification is absent", () => {
  const noConfirmation = validEnvironment();
  delete noConfirmation.SMOKE_TEST_PASSWORD_CONFIRMATION;
  assert.throws(
    () => loadConfig(["node", "script"], noConfirmation),
    /SMOKE_TEST_PASSWORD_CONFIRMATION is required/,
  );

  const noVerification = validEnvironment();
  delete noVerification.SMOKE_EMAIL_VERIFICATION_CODE;
  assert.throws(
    () => loadConfig(["node", "script"], noVerification),
    /SMOKE_EMAIL_VERIFICATION_CODE/,
  );

  const noTurnstile = validEnvironment();
  delete noTurnstile.SMOKE_TURNSTILE_TOKEN;
  assert.throws(
    () => loadConfig(["node", "script"], noTurnstile),
    /SMOKE_TURNSTILE_TOKEN is required/,
  );
});

test("password confirmation must match before any request can run", () => {
  assert.throws(
    () =>
      loadConfig(
        ["node", "script"],
        validEnvironment({ SMOKE_TEST_PASSWORD_CONFIRMATION: "Different1!" }),
      ),
    /does not match/,
  );
});

test("Turnstile tokens above the API limit fail before any request can run", () => {
  assert.throws(
    () =>
      loadConfig(
        ["node", "script"],
        validEnvironment({ SMOKE_TURNSTILE_TOKEN: "x".repeat(2049) }),
      ),
    /SMOKE_TURNSTILE_TOKEN exceeds the API limit/,
  );
});

test("registration payload includes consent and Turnstile but omits form-only confirmation", () => {
  const config = loadConfig(["node", "script"], validEnvironment());
  const payload = buildRegistrationPayload(config);
  assert.equal(payload.agreeToTerms, true);
  assert.equal(payload.turnstileToken, "caller-supplied-token");
  assert.equal(payload.password, "Strong_Password1!");
  assert.equal(Object.hasOwn(payload, "passwordConfirmation"), false);
  assert.equal(Object.hasOwn(payload, "confirmPassword"), false);
});

test("every remote target requires explicit creation, environment, and origin gates", () => {
  assert.throws(
    () =>
      normalizeApiBase("https://alias.up.railway.app/api", {
        SMOKE_EXPECTED_API_ORIGIN: "https://alias.up.railway.app",
        SMOKE_TARGET_ENVIRONMENT: "staging",
      }),
    /SMOKE_ALLOW_USER_CREATION/,
  );
  assert.throws(
    () =>
      normalizeApiBase("https://alias.up.railway.app/api", {
        SMOKE_ALLOW_USER_CREATION: USER_CREATION_ACKNOWLEDGEMENT,
        SMOKE_EXPECTED_API_ORIGIN: "https://different.up.railway.app",
        SMOKE_TARGET_ENVIRONMENT: "staging",
      }),
    /must exactly match/,
  );
  assert.throws(
    () =>
      normalizeApiBase("https://alias.up.railway.app/api", {
        SMOKE_ALLOW_USER_CREATION: USER_CREATION_ACKNOWLEDGEMENT,
        SMOKE_EXPECTED_API_ORIGIN: "https://alias.up.railway.app",
        SMOKE_TARGET_ENVIRONMENT: "production",
      }),
    /must be exactly staging/,
  );
  assert.equal(
    normalizeApiBase("https://alias.up.railway.app/api", {
      SMOKE_ALLOW_USER_CREATION: USER_CREATION_ACKNOWLEDGEMENT,
      SMOKE_EXPECTED_API_ORIGIN: "https://alias.up.railway.app",
      SMOKE_TARGET_ENVIRONMENT: "staging",
    }),
    "https://alias.up.railway.app/api",
  );
});

test("production and trailing-dot production targets require a separate acknowledgement", () => {
  assert.throws(
    () =>
      normalizeApiBase("https://api.nxqsocial.com./api", {
        SMOKE_ALLOW_USER_CREATION: USER_CREATION_ACKNOWLEDGEMENT,
        SMOKE_EXPECTED_API_ORIGIN: "https://api.nxqsocial.com",
        SMOKE_TARGET_ENVIRONMENT: "staging",
      }),
    /Known production hosts are blocked/,
  );
  assert.equal(
    normalizeApiBase("https://api.nxqsocial.com./api", {
      SMOKE_ALLOW_USER_CREATION: USER_CREATION_ACKNOWLEDGEMENT,
      SMOKE_EXPECTED_API_ORIGIN: "https://api.nxqsocial.com",
      SMOKE_TARGET_ENVIRONMENT: "staging",
      SMOKE_ALLOW_PRODUCTION: PRODUCTION_ACKNOWLEDGEMENT,
    }),
    "https://api.nxqsocial.com/api",
  );
});

test("loopback remains usable without remote authorization gates", () => {
  assert.equal(
    normalizeApiBase("http://127.0.0.1:3000/api", {}),
    "http://127.0.0.1:3000/api",
  );
});

test("pending registration envelope is accepted and a normal session shape is rejected", () => {
  const pending = {
    status: "EMAIL_VERIFICATION_REQUIRED",
    requiresEmailVerification: true,
    verification_token: "pending-token",
    access_token: "pending-token",
    verification: { required: true, channel: "email", sent: true },
    user: {
      email: "controlled@example.org",
      emailVerified: false,
      emailVerificationRequired: true,
    },
  };
  assert.doesNotThrow(() =>
    assertRegistrationPending(pending, pending.user.email),
  );
  assert.throws(
    () =>
      assertRegistrationPending(
        { access_token: "normal-token" },
        pending.user.email,
      ),
    /EMAIL_VERIFICATION_REQUIRED/,
  );
});

test("readiness URLs are explicit, canonical, and allow loopback HTTP only", () => {
  assert.equal(
    explicitUrl("https://api.staging.example.com/api", "API", "/api"),
    "https://api.staging.example.com/api",
  );
  assert.equal(
    explicitUrl("http://127.0.0.1:3001", "WEB", "/"),
    "http://127.0.0.1:3001",
  );
  assert.throws(
    () => explicitUrl("http://staging.example.com/api", "API", "/api"),
    /must use HTTPS/,
  );
});
