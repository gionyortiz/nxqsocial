import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRailwayContext, project } from "railway/iac";
import { createChildEnvironment } from "./child-environment.mjs";

const expected = {
  projectId: "1cf84772-c0bd-44a6-bd6c-f652955ac0d8",
  projectName: "nxq-social-staging",
  environmentId: "6f3d73f8-2712-4736-9b4b-8383ec21cac3",
  environment: "staging",
};

const providerPreflightEntrypoint = readFileSync(
  new URL("../backend/scripts/release-provider-preflight.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(providerPreflightEntrypoint, /dotenv(?:\/config)?/i);

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
    "postgres-volume",
    "redis-volume",
  ].sort(),
);

const backend = resources.find((resource) => resource.name === "backend");
const frontend = resources.find((resource) => resource.name === "frontend");
assert.ok(backend);
assert.ok(frontend);
assert.equal(backend.source.checkSuites, undefined);
assert.equal(frontend.source.checkSuites, undefined);
assert.deepEqual(backend.deploy.preDeployCommand, [
  "node dist/scripts/release-provider-preflight.js && npm run db:migrate:deploy",
]);
assert.equal(
  backend.variables.APP_BASE_URL?.value,
  "https://staging.nxqsocial.com",
);
assert.equal(
  backend.variables.FRONTEND_URL?.value,
  "https://staging.nxqsocial.com",
);
assert.equal(
  backend.variables.API_BASE_URL?.value,
  "https://api-staging.nxqsocial.com/api",
);
for (const name of [
  "JWT_SECRET",
  "OTP_PEPPER",
  "TURNSTILE_SECRET_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
]) {
  assert.deepEqual(backend.variables[name], {
    type: "sharedReference",
    name,
  });
}
assert.deepEqual(backend.variables.LIVEKIT_EXPECTED_STAGING_URL, {
  type: "sharedReference",
  name: "LIVEKIT_URL",
});
assert.equal(
  backend.variables.TURNSTILE_ALLOWED_HOSTNAMES?.value,
  "staging.nxqsocial.com",
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
assert.equal(backend.variables.MEDIA_MODERATION_PROVIDER?.value, "staging-mock");
assert.equal(frontend.variables.NXQ_RELEASE_TARGET?.value, "staging");
assert.equal(
  frontend.variables.NEXT_PUBLIC_APP_URL?.value,
  "https://staging.nxqsocial.com",
);
assert.equal(
  frontend.variables.NEXT_PUBLIC_API_URL?.value,
  "https://api-staging.nxqsocial.com/api",
);
assert.deepEqual(frontend.variables.NEXT_PUBLIC_TURNSTILE_SITE_KEY, {
  type: "sharedReference",
  name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
});
assert.equal(frontend.variables.NEXT_PUBLIC_CALLS_ENABLED?.value, "true");
assert.equal(frontend.variables.NEXT_PUBLIC_LIVE_ENABLED?.value, "true");

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
