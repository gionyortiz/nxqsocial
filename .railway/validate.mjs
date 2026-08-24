import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRailwayContext, project } from "railway/iac";

const expected = {
  projectId: "1cf84772-c0bd-44a6-bd6c-f652955ac0d8",
  projectName: "nxq-social-staging",
  environmentId: "6f3d73f8-2712-4736-9b4b-8383ec21cac3",
  environment: "staging",
};

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
assert.equal(backend.source.checkSuites, true);
assert.equal(frontend.source.checkSuites, true);
assert.deepEqual(backend.deploy.preDeployCommand, [
  "node dist/scripts/release-provider-preflight.js",
  "npm run db:migrate:deploy",
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
assert.equal(frontend.variables.NXQ_RELEASE_TARGET?.value, "staging");
assert.equal(
  frontend.variables.NEXT_PUBLIC_APP_URL?.value,
  "https://staging.nxqsocial.com",
);
assert.equal(
  frontend.variables.NEXT_PUBLIC_API_URL?.value,
  "https://api-staging.nxqsocial.com/api",
);

for (const invalidContext of [
  { ...expected, projectId: "wrong-project" },
  { ...expected, projectName: "wrong-project" },
  { ...expected, environmentId: "wrong-environment" },
  { ...expected, environment: "production" },
  {},
]) {
  await assert.rejects(
    async () =>
      defineNxqSocialStaging(
        createRailwayContext(invalidContext),
        project,
      ),
    /requires the exact NXQ Social staging project and environment context/,
  );
}

const rejectedSecretDisplayFlag = spawnSync(
  process.execPath,
  ["plan.mjs", "--show-values"],
  { cwd: new URL(".", import.meta.url), encoding: "utf8" },
);
assert.equal(rejectedSecretDisplayFlag.status, 1);
assert.match(
  rejectedSecretDisplayFlag.stderr,
  /Only the non-secret --verbose plan flag is allowed/,
);

console.log("Railway IaC offline validation passed.");
