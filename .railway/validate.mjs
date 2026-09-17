import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRailwayContext, project } from "railway/iac";
import { createChildEnvironment } from "./child-environment.mjs";
import {
  assertExistingStagingServicePlan,
  EXISTING_STAGING_SERVICE_PLAN,
} from "./plan-contract.mjs";
import {
  missingStagingSharedVariables,
  REQUIRED_STAGING_SHARED_VARIABLES,
  SEALED_STAGING_SHARED_VARIABLES,
} from "./shared-variable-contract.mjs";

const expected = {
  projectId: "1cf84772-c0bd-44a6-bd6c-f652955ac0d8",
  projectName: "nxq-social-staging",
  environmentId: "6f3d73f8-2712-4736-9b4b-8383ec21cac3",
  environment: "staging",
};
const expectedApplication = {
  frontendOrigin: "https://staging.nxqsocial.com",
  apiBaseUrl: "https://api-staging.nxqsocial.com/api",
  turnstileHostname: "staging.nxqsocial.com",
};
const expectedStagingBranch = "release/railway-staging-20260916";

const { NXQ_SOCIAL_STAGING_TARGET } =
  await import("../backend/src/release/staging-target.ts");
const { validateReleaseConfig } =
  await import("../frontend/scripts/validate-release-config.mjs");

assert.deepEqual(NXQ_SOCIAL_STAGING_TARGET.application, {
  frontendOrigin: expectedApplication.frontendOrigin,
  apiBaseUrl: expectedApplication.apiBaseUrl,
});
assert.equal(
  NXQ_SOCIAL_STAGING_TARGET.resources.turnstileHostname,
  expectedApplication.turnstileHostname,
);
assert.deepEqual(
  validateReleaseConfig({
    NXQ_RELEASE_TARGET: "staging",
    NEXT_PUBLIC_APP_URL: expectedApplication.frontendOrigin,
    NEXT_PUBLIC_API_URL: expectedApplication.apiBaseUrl,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "staging-test-site-key",
    NEXT_PUBLIC_CALLS_ENABLED: "true",
    NEXT_PUBLIC_LIVE_ENABLED: "true",
  }),
  { releaseTarget: "staging" },
);

const providerPreflightEntrypoint = readFileSync(
  new URL("../backend/scripts/release-provider-preflight.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(providerPreflightEntrypoint, /dotenv(?:\/config)?/i);

const applyWrapper = readFileSync(
  new URL("./apply.mjs", import.meta.url),
  "utf8",
);
const sharedVariableContract = readFileSync(
  new URL("./shared-variable-contract.mjs", import.meta.url),
  "utf8",
);
assert.match(sharedVariableContract, /"RUNTIME_DATABASE_URL"/);
assert.match(sharedVariableContract, /"MIGRATION_DATABASE_URL"/);
assert.match(applyWrapper, /release:migration:preflight:dev/);
assert.match(applyWrapper, /release:migration-job:preflight:dev/);
assert.match(applyWrapper, /release:runtime-schema:preflight:dev/);
assert.match(applyWrapper, /migration-job/);
assert.match(applyWrapper, /assertExistingStagingServicePlan/);
assert.match(applyWrapper, /missingStagingSharedVariables/);

assert.doesNotThrow(() =>
  assertExistingStagingServicePlan(
    [
      EXISTING_STAGING_SERVICE_PLAN.summary,
      ...EXISTING_STAGING_SERVICE_PLAN.creates,
      ...EXISTING_STAGING_SERVICE_PLAN.changes,
    ].join("\n"),
  ),
);
for (const unsafePlan of [
  [
    "Plan: 3 to add, 0 to change, 0 to destroy",
    "+ Create service backend",
    "+ Create service frontend",
    "+ Create service migration-job",
  ].join("\n"),
  [
    "Plan: 1 to add, 2 to change, 1 to destroy",
    "+ Create service migration-job",
    "~ Update service backend",
    "~ Update service frontend",
    "- Delete volume postgres-volume",
  ].join("\n"),
  [
    "Plan: 1 to add, 2 to change, 0 to destroy",
    "+ Create service backend",
    "~ Update service frontend",
    "~ Update service migration-job",
  ].join("\n"),
  [
    "Plan: 1 to add, 2 to change, 0 to destroy",
    "+ Create service migration-job",
    "~ Update service backend",
    "~ Update database Postgres",
  ].join("\n"),
]) {
  assert.throws(() => assertExistingStagingServicePlan(unsafePlan));
}

const sealedFixture = Object.fromEntries(
  REQUIRED_STAGING_SHARED_VARIABLES.map((name) => [name, { isSealed: true }]),
);
assert.deepEqual(missingStagingSharedVariables(sealedFixture), []);
assert.deepEqual(
  missingStagingSharedVariables({
    ...sealedFixture,
    RUNTIME_DATABASE_URL: { value: "postgresql://runtime@example/db" },
  }),
  ["RUNTIME_DATABASE_URL"],
);
for (const name of SEALED_STAGING_SHARED_VARIABLES) {
  assert.deepEqual(
    missingStagingSharedVariables({
      ...sealedFixture,
      [name]: { value: "unsealed-value" },
    }),
    [name],
  );
}

const syntheticParentSecrets = {
  CLOUDFLARE_API_TOKEN: "x",
  GH_TOKEN: "x",
  RAILWAY_TOKEN: "x",
  STRIPE_SECRET_KEY: "x",
};
const originalParentSecrets = Object.fromEntries(
  Object.keys(syntheticParentSecrets).map((name) => [name, process.env[name]]),
);
try {
  Object.assign(process.env, syntheticParentSecrets);
  const childEnvironment = createChildEnvironment({
    NXQ_RELEASE_TARGET: "staging",
  });
  for (const name of Object.keys(syntheticParentSecrets)) {
    assert.equal(childEnvironment[name], undefined);
  }
  assert.equal(childEnvironment.NXQ_RELEASE_TARGET, "staging");
} finally {
  for (const [name, value] of Object.entries(originalParentSecrets)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

const { default: defineNxqSocialStaging } = await import("./railway.ts");
assert.equal(typeof defineNxqSocialStaging, "function");

const definition = await defineNxqSocialStaging(
  createRailwayContext(expected),
  project,
);

assert.equal(definition.name, expected.projectName);
const resources = definition.resources ?? [];
assert.deepEqual(
  resources.map((resource) => resource.name).sort(),
  [
    "Postgres",
    "Redis",
    "backend",
    "frontend",
    "migration-job",
    "postgres-volume",
    "redis-volume",
  ].sort(),
);

const backend = resources.find((resource) => resource.name === "backend");
const frontend = resources.find((resource) => resource.name === "frontend");
const migrationJob = resources.find(
  (resource) => resource.name === "migration-job",
);
assert.ok(backend);
assert.ok(frontend);
assert.ok(migrationJob);
assert.equal(backend.source.branch, expectedStagingBranch);
assert.equal(frontend.source.branch, expectedStagingBranch);
assert.equal(backend.source.checkSuites, true);
assert.equal(frontend.source.checkSuites, true);
assert.equal(migrationJob.source.checkSuites, true);
assert.deepEqual(backend.deploy.preDeployCommand, [
  "node dist/scripts/release-provider-preflight.js && npm run db:migrate:verify-runtime",
]);
assert.equal(backend.deploy.restartPolicyType, undefined);
assert.equal(
  backend.variables.APP_BASE_URL?.value,
  expectedApplication.frontendOrigin,
);
assert.equal(
  backend.variables.FRONTEND_URL?.value,
  expectedApplication.frontendOrigin,
);
assert.equal(
  backend.variables.API_BASE_URL?.value,
  expectedApplication.apiBaseUrl,
);
for (const name of [
  "JWT_SECRET",
  "OTP_PEPPER",
  "TURNSTILE_SECRET_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "STAGING_EMAIL_RECIPIENT_ALLOWLIST",
  "STAGING_PHONE_RECIPIENT_ALLOWLIST",
  "STAGING_PUSH_TOKEN_ALLOWLIST",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "CLOUDFLARE_PROXY_CIDRS",
]) {
  assert.deepEqual(backend.variables[name], {
    type: "sharedReference",
    name,
  });
}
assert.deepEqual(backend.variables.DATABASE_URL, {
  type: "sharedReference",
  name: "RUNTIME_DATABASE_URL",
});
assert.equal(backend.variables.MIGRATION_DATABASE_URL, undefined);
assert.equal(
  backend.variables.RUNTIME_DATABASE_ROLE?.value,
  "nxqsocial_runtime",
);
assert.deepEqual(backend.variables.LIVEKIT_EXPECTED_STAGING_URL, {
  type: "sharedReference",
  name: "LIVEKIT_URL",
});
assert.equal(
  backend.variables.TURNSTILE_ALLOWED_HOSTNAMES?.value,
  expectedApplication.turnstileHostname,
);
assert.equal(backend.variables.SIGNUP_HARDENING_ENABLED?.value, "true");
assert.equal(backend.variables.JWT_EXPIRES_IN?.value, "7d");
assert.equal(backend.variables.TURNSTILE_TEST_BYPASS?.value, "false");
assert.equal(
  backend.variables.S3_ENDPOINT?.value,
  "https://07a14429304a4b400dfcaf6d09213b6e.r2.cloudflarestorage.com",
);
assert.equal(
  backend.variables.S3_BUCKET_NAME?.value,
  "nxqsocial-staging-public",
);
assert.equal(
  backend.variables.S3_QUARANTINE_BUCKET?.value,
  "nxqsocial-staging-quarantine",
);
assert.equal(
  backend.variables.MEDIA_MODERATION_PROVIDER?.value,
  "staging-mock",
);
assert.equal(frontend.variables.NXQ_RELEASE_TARGET?.value, "staging");
assert.equal(
  frontend.variables.NEXT_PUBLIC_APP_URL?.value,
  expectedApplication.frontendOrigin,
);
assert.equal(
  frontend.variables.NEXT_PUBLIC_API_URL?.value,
  expectedApplication.apiBaseUrl,
);
assert.deepEqual(frontend.variables.NEXT_PUBLIC_TURNSTILE_SITE_KEY, {
  type: "sharedReference",
  name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
});
assert.equal(frontend.variables.NEXT_PUBLIC_CALLS_ENABLED?.value, "true");
assert.equal(frontend.variables.NEXT_PUBLIC_LIVE_ENABLED?.value, "true");
assert.equal(migrationJob.source.branch, expectedStagingBranch);
assert.equal(migrationJob.source.rootDirectory, "backend");
assert.equal(migrationJob.deploy.startCommand, "npm run db:migrate:isolated");
assert.equal(migrationJob.deploy.restartPolicyType, "NEVER");
assert.equal(migrationJob.deploy.restartPolicyMaxRetries, 0);
assert.deepEqual(migrationJob.variables.MIGRATION_DATABASE_URL, {
  type: "sharedReference",
  name: "MIGRATION_DATABASE_URL",
});
assert.equal(
  migrationJob.variables.MIGRATION_DATABASE_ROLE?.value,
  "nxqsocial_migrator",
);
assert.equal(migrationJob.variables.DATABASE_URL, undefined);
for (const name of [
  "RUNTIME_DATABASE_URL",
  "RUNTIME_DATABASE_ROLE",
  "REDIS_URL",
  "JWT_SECRET",
  "OTP_PEPPER",
  "TURNSTILE_SECRET_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_GIFTS_RESTRICTED_KEY",
  "STRIPE_GIFTS_WEBHOOK_SECRET",
  "LIVEKIT_URL",
  "LIVEKIT_EXPECTED_STAGING_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "REKOGNITION_REGION",
  "REKOGNITION_ACCESS_KEY_ID",
  "REKOGNITION_SECRET_ACCESS_KEY",
  "REKOGNITION_S3_BUCKET",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_BUCKET_NAME",
  "S3_QUARANTINE_BUCKET",
  "S3_PUBLIC_BASE_URL",
  "S3_PUBLIC_BASE",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_TUNNEL_TOKEN",
  "OPENAI_API_KEY",
]) {
  assert.equal(
    migrationJob.variables[name],
    undefined,
    `${name} leaked to migration-job IaC`,
  );
}

for (const invalidContext of [
  { ...expected, projectId: "wrong-project" },
  { ...expected, projectName: "wrong-project" },
  { ...expected, environmentId: "wrong-environment" },
  { ...expected, environment: "production" },
  {},
]) {
  await assert.rejects(
    async () =>
      defineNxqSocialStaging(createRailwayContext(invalidContext), project),
    /requires the exact NXQ Social staging project and environment context/,
  );
}

const rejectedSecretDisplayFlag = spawnSync(
  process.execPath,
  ["plan.mjs", "--show-values"],
  {
    cwd: new URL(".", import.meta.url),
    encoding: "utf8",
    env: createChildEnvironment(),
  },
);
assert.equal(rejectedSecretDisplayFlag.status, 1);
assert.match(
  rejectedSecretDisplayFlag.stderr,
  /Only the non-secret --verbose plan flag is allowed/,
);

const rejectedApplyArgument = spawnSync(
  process.execPath,
  ["apply.mjs", "--show-values"],
  {
    cwd: new URL(".", import.meta.url),
    encoding: "utf8",
    env: createChildEnvironment(),
  },
);
assert.equal(rejectedApplyArgument.status, 1);
assert.match(
  rejectedApplyArgument.stderr,
  /verified staging apply wrapper accepts no arguments/,
);

console.log("Railway IaC offline validation passed.");
