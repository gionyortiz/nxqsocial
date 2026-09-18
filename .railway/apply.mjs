import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createChildEnvironment } from "./child-environment.mjs";
import { resolvePathExecutable } from "./executable-resolution.mjs";
import { assertExistingStagingServicePlan } from "./plan-contract.mjs";
import {
  resolveApprovedRailwayExecutable,
  verifyReviewedRailwayCli,
} from "./railway-cli-verification.mjs";
import { missingStagingSharedVariables } from "./shared-variable-contract.mjs";

const railwayDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(railwayDirectory, "..");
const expectedProject = {
  id: "1cf84772-c0bd-44a6-bd6c-f652955ac0d8",
  name: "nxq-social-staging",
};
const expectedEnvironment = {
  id: "6f3d73f8-2712-4736-9b4b-8383ec21cac3",
  name: "staging",
};
const stagingBranch = "release/railway-staging-20260916";
const expectedOrigin = "https://github.com/gionyortiz/nxqsocial.git";
const githubRepository = "gionyortiz/nxqsocial";
const expectedR2Endpoint =
  "https://07a14429304a4b400dfcaf6d09213b6e.r2.cloudflarestorage.com";

if (process.argv.length !== 2) {
  throw new Error("The verified staging apply wrapper accepts no arguments.");
}

const executable = resolveApprovedRailwayExecutable();
const cliEnvironment = createChildEnvironment({ _: executable });
verifyReviewedRailwayCli(executable, cliEnvironment, repositoryRoot);
verifyRailwayTarget(executable, cliEnvironment);
const sourceCommit = verifyGitSource();
verifyGreenCi(sourceCommit, cliEnvironment);
verifySharedVariables(executable, cliEnvironment);
verifyReleaseConfiguration();

const approvedEnvironment = {
  ...cliEnvironment,
  NXQ_RAILWAY_IAC_PROJECT_ID: expectedProject.id,
  NXQ_RAILWAY_IAC_PROJECT_NAME: expectedProject.name,
  NXQ_RAILWAY_IAC_ENVIRONMENT_ID: expectedEnvironment.id,
  NXQ_RAILWAY_IAC_ENVIRONMENT_NAME: expectedEnvironment.name,
};
const configFile = join(railwayDirectory, "railway.ts");
const planResult = spawnSync(
  executable,
  ["config", "plan", "--file", configFile, "--verbose"],
  {
    cwd: repositoryRoot,
    env: approvedEnvironment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
if (planResult.error || planResult.status !== 0) {
  throw new Error("Unable to obtain the final NXQSocial staging apply plan.");
}
const planOutput = `${planResult.stdout}\n${planResult.stderr}`;
assertExistingStagingServicePlan(planOutput);

verifyRailwayTarget(executable, cliEnvironment);
console.error(
  "Verified NXQSocial staging target, remote source, provider configuration shape, and reviewed in-place adoption plan. Review the CLI plan once more before confirming its interactive prompt.",
);
const applyResult = spawnSync(
  executable,
  ["config", "apply", "--file", configFile],
  {
    cwd: repositoryRoot,
    env: approvedEnvironment,
    stdio: "inherit",
  },
);
if (applyResult.error) throw applyResult.error;
process.exitCode = applyResult.status ?? 1;

function verifyRailwayTarget(executablePath, environment) {
  const jsonResult = spawnSync(executablePath, ["status", "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (jsonResult.error || jsonResult.status !== 0) {
    throw new Error("Unable to verify the linked Railway target.");
  }
  let status;
  try {
    status = JSON.parse(jsonResult.stdout);
  } catch {
    throw new Error("Railway status returned invalid JSON.");
  }
  const stagingEnvironment = status?.environments?.edges?.find(
    (edge) =>
      edge?.node?.id === expectedEnvironment.id &&
      edge?.node?.name === expectedEnvironment.name &&
      edge?.node?.deletedAt == null,
  );
  if (
    status?.id !== expectedProject.id ||
    status?.name !== expectedProject.name ||
    !stagingEnvironment
  ) {
    throw new Error("Refusing to apply against an unexpected Railway target.");
  }

  const textResult = spawnSync(executablePath, ["status"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (textResult.error || textResult.status !== 0) {
    throw new Error("Unable to verify the linked Railway environment.");
  }
  const linked = textResult.stdout;
  if (
    linked.match(/^Project:\s+(.+)$/m)?.[1]?.trim() !== expectedProject.name ||
    linked.match(/^Project ID:\s+(\S+)$/m)?.[1] !== expectedProject.id ||
    linked.match(/^Environment:\s+(.+)$/m)?.[1]?.trim() !==
      expectedEnvironment.name ||
    linked.match(/^Environment ID:\s+(\S+)$/m)?.[1] !== expectedEnvironment.id
  ) {
    throw new Error("Refusing to apply against a non-staging Railway link.");
  }
}

function verifyGitSource() {
  if (runGit(["remote", "get-url", "origin"]) !== expectedOrigin) {
    throw new Error("Refusing to apply from an unexpected Git origin.");
  }
  const branch = runGit(["branch", "--show-current"]);
  if (branch !== stagingBranch) {
    throw new Error("Refusing to apply from a non-staging Git branch.");
  }
  if (runGit(["status", "--porcelain"]) !== "") {
    throw new Error("Refusing to apply from a dirty working tree.");
  }
  const localHead = runGit(["rev-parse", "HEAD"]);
  const remoteLine = runGit([
    "ls-remote",
    "--heads",
    "origin",
    `refs/heads/${stagingBranch}`,
  ]);
  const remoteHead = remoteLine.split(/\s+/)[0] ?? "";
  if (!remoteHead || localHead !== remoteHead) {
    throw new Error(
      "Refusing to apply until the exact local staging commit is pushed.",
    );
  }
  return localHead;
}

function verifyGreenCi(commit, environment) {
  const githubExecutable = resolvePathExecutable(
    process.platform === "win32" ? ["gh.exe", "gh.cmd", "gh"] : ["gh"],
  );
  const result = spawnSync(
    githubExecutable,
    [
      "run",
      "list",
      "--repo",
      githubRepository,
      "--workflow",
      "ci.yml",
      "--branch",
      stagingBranch,
      "--commit",
      commit,
      "--event",
      "push",
      "--limit",
      "5",
      "--json",
      "headSha,status,conclusion,event,workflowName",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Unable to verify CI for the exact staging commit.");
  }
  let runs;
  try {
    runs = JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub returned invalid CI status JSON.");
  }
  const passed =
    Array.isArray(runs) &&
    runs.some(
      (run) =>
        run?.headSha === commit &&
        run?.event === "push" &&
        run?.workflowName === "CI" &&
        run?.status === "completed" &&
        run?.conclusion === "success",
    );
  if (!passed) {
    throw new Error(
      "Refusing to apply until CI succeeds for the exact pushed staging commit.",
    );
  }
}

function verifySharedVariables(executablePath, environment) {
  const result = spawnSync(
    executablePath,
    [
      "environment",
      "config",
      "--environment",
      expectedEnvironment.id,
      "--json",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Unable to verify staging shared-variable presence.");
  }
  let configuration;
  try {
    configuration = JSON.parse(result.stdout);
  } catch {
    throw new Error("Railway environment configuration returned invalid JSON.");
  }
  const shared = configuration?.sharedVariables ?? {};
  const missing = missingStagingSharedVariables(shared);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to apply; missing staging shared variables: ${missing.join(", ")}`,
    );
  }
}

function verifyReleaseConfiguration() {
  const releaseEnvironment = createChildEnvironment({
    NODE_ENV: "production",
    NXQ_RELEASE_TARGET: "staging",
    RAILWAY_PROJECT_ID: expectedProject.id,
    RAILWAY_ENVIRONMENT_ID: expectedEnvironment.id,
    RAILWAY_ENVIRONMENT_NAME: expectedEnvironment.name,
    APP_BASE_URL: "https://staging.nxqsocial.com",
    FRONTEND_URL: "https://staging.nxqsocial.com",
    API_BASE_URL: "https://api-staging.nxqsocial.com/api",
    SIGNUP_HARDENING_ENABLED: "true",
    TURNSTILE_TEST_BYPASS: "false",
    TURNSTILE_ALLOWED_HOSTNAMES: "staging.nxqsocial.com",
    S3_ENDPOINT: expectedR2Endpoint,
    S3_BUCKET_NAME: "nxqsocial-staging-public",
    S3_QUARANTINE_BUCKET: "nxqsocial-staging-quarantine",
    S3_PUBLIC_BASE_URL: "https://media-staging.nxqsocial.com",
    AWS_REGION: "auto",
    MEDIA_MODERATION_PROVIDER: "staging-mock",
    JWT_SECRET: "a".repeat(64),
    OTP_PEPPER: "b".repeat(64),
    TURNSTILE_SECRET_KEY: "0x4AAAAAAA_staging_fixture",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    AWS_ACCESS_KEY_ID: "staging_r2_access_key",
    AWS_SECRET_ACCESS_KEY: "staging_r2_secret_key_value_0123456789",
    RESEND_API_KEY: "re_staging_fixture_key",
    EMAIL_FROM: "NXQ Social <staging@mail.nxqsocial.com>",
    STAGING_EMAIL_RECIPIENT_ALLOWLIST: "operator@nxqsocial.test",
    STAGING_PHONE_RECIPIENT_ALLOWLIST: "disabled",
    STAGING_PUSH_TOKEN_ALLOWLIST: "disabled",
    STRIPE_SECRET_KEY: "sk_test_staging_fixture_key",
    STRIPE_WEBHOOK_SECRET: "whsec_staging_fixture_secret",
    LIVEKIT_URL: "wss://staging.livekit.nxqsocial.com",
    LIVEKIT_API_KEY: "staging_livekit_key",
    LIVEKIT_API_SECRET: "staging_livekit_secret_value",
    CLOUDFLARE_PROXY_CIDRS: "173.245.48.0/20,2400:cb00::/32",
    DATABASE_URL:
      "postgresql://nxqsocial_runtime:runtime_fixture_password@db.internal:5432/nxqsocial",
    RUNTIME_DATABASE_ROLE: "nxqsocial_runtime",
    MIGRATION_DATABASE_URL:
      "postgresql://nxqsocial_migrator:migration_fixture_password@db.internal:5432/nxqsocial",
    MIGRATION_DATABASE_ROLE: "nxqsocial_migrator",
    LIVEKIT_EXPECTED_STAGING_URL: "wss://staging.livekit.nxqsocial.com",
    NEXT_PUBLIC_APP_URL: "https://staging.nxqsocial.com",
    NEXT_PUBLIC_API_URL: "https://api-staging.nxqsocial.com/api",
    NEXT_PUBLIC_CALLS_ENABLED: "true",
    NEXT_PUBLIC_LIVE_ENABLED: "true",
  });
  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
  const backendPreflight = spawnSync(
    npmExecutable,
    ["--prefix", "backend", "run", "release:providers:preflight:dev"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: releaseEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (backendPreflight.error || backendPreflight.status !== 0) {
    throw new Error(
      "Refusing to apply because staging provider configuration failed offline validation.",
    );
  }

  const migrationAuthorityPreflight = spawnSync(
    npmExecutable,
    ["--prefix", "backend", "run", "release:migration:preflight:dev"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: releaseEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (
    migrationAuthorityPreflight.error ||
    migrationAuthorityPreflight.status !== 0
  ) {
    throw new Error(
      "Refusing to apply because Railway runtime and migration database authorities failed offline validation.",
    );
  }

  const migrationJobEnvironment = createChildEnvironment({
    NXQ_RELEASE_TARGET: "staging",
    MIGRATION_DATABASE_ROLE: "nxqsocial_migrator",
    MIGRATION_DATABASE_URL:
      "postgresql://nxqsocial_migrator:migration_fixture_password@db.internal:5432/nxqsocial",
    MIGRATION_JOB_MAX_RUNTIME_MS: "600000",
  });
  const migrationJobPreflight = spawnSync(
    npmExecutable,
    ["--prefix", "backend", "run", "release:migration-job:preflight:dev"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: migrationJobEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (migrationJobPreflight.error || migrationJobPreflight.status !== 0) {
    throw new Error(
      "Refusing to apply because the isolated migration job failed offline validation.",
    );
  }

  const frontendPreflight = spawnSync(
    process.execPath,
    [
      join(
        repositoryRoot,
        "frontend",
        "scripts",
        "validate-release-config.mjs",
      ),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: releaseEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (frontendPreflight.error || frontendPreflight.status !== 0) {
    throw new Error(
      "Refusing to apply because staging frontend configuration failed offline validation.",
    );
  }

  const runtimeSchemaEnvironment = createChildEnvironment({
    NXQ_RELEASE_TARGET: "staging",
    RUNTIME_DATABASE_ROLE: "nxqsocial_runtime",
    DATABASE_URL:
      "postgresql://nxqsocial_runtime:runtime_fixture_password@db.internal:5432/nxqsocial",
  });
  const runtimeSchemaPreflight = spawnSync(
    npmExecutable,
    ["--prefix", "backend", "run", "release:runtime-schema:preflight:dev"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: runtimeSchemaEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (runtimeSchemaPreflight.error || runtimeSchemaPreflight.status !== 0) {
    throw new Error(
      "Refusing to apply because API runtime schema authority failed offline validation.",
    );
  }
}

function runGit(arguments_) {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: createChildEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error("Unable to verify the staging Git source.");
  }
  return result.stdout.trim();
}
