import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createChildEnvironment } from "./child-environment.mjs";

const railwayDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(railwayDirectory, "..");
const requiredCliVersion = "5.43.3";
const expectedProject = {
  id: "1cf84772-c0bd-44a6-bd6c-f652955ac0d8",
  name: "nxq-social-staging",
};
const expectedEnvironment = {
  id: "6f3d73f8-2712-4736-9b4b-8383ec21cac3",
  name: "staging",
};
const stagingBranch = "release/railway-staging-20260823";
const expectedOrigin = "https://github.com/gionyortiz/nxqsocial.git";
const githubRepository = "gionyortiz/nxqsocial";
const expectedR2Endpoint =
  "https://07a14429304a4b400dfcaf6d09213b6e.r2.cloudflarestorage.com";
const requiredSharedVariables = [
  "JWT_SECRET",
  "OTP_PEPPER",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
];
const placeholder =
  /(?:change[-_ ]?me|replace|placeholder|example|dummy|todo|tbd|required|your[-_ ]|__[^_]+__|\.\.\.$)/i;

if (process.argv.length !== 2) {
  throw new Error("The verified staging apply wrapper accepts no arguments.");
}

const executable = resolveRailwayExecutable();
const cliEnvironment = createChildEnvironment({ _: executable });
verifyCliVersion(executable, cliEnvironment);
verifyRailwayTarget(executable, cliEnvironment);
const sourceCommit = verifyGitSource();
verifyGreenCi(sourceCommit, cliEnvironment);
const sharedVariables = verifySharedVariables(executable, cliEnvironment);
verifyReleaseConfiguration(sharedVariables);

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
const summaryLines = planOutput
  .split(/\r?\n/)
  .filter((line) => /^Plan:/.test(line));
const createLines = planOutput
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("+ Create "))
  .sort();
if (
  summaryLines.length !== 1 ||
  summaryLines[0] !== "Plan: 2 to add, 0 to change, 0 to destroy" ||
  JSON.stringify(createLines) !==
    JSON.stringify(["+ Create service backend", "+ Create service frontend"])
) {
  throw new Error(
    "Refusing to apply because the final plan is not exactly two service additions.",
  );
}

verifyRailwayTarget(executable, cliEnvironment);
console.error(
  "Verified NXQSocial staging target, remote source, provider configuration, and 2-add/0-change/0-destroy plan. Review the CLI plan once more before confirming its interactive prompt.",
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

function verifyCliVersion(executablePath, environment) {
  const result = spawnSync(executablePath, ["--version"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (
    result.error ||
    result.status !== 0 ||
    result.stdout.trim() !== `railway ${requiredCliVersion}`
  ) {
    throw new Error(
      `Railway CLI ${requiredCliVersion} is required; refusing an unverified executable.`,
    );
  }
}

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
  const missingOrInvalid = requiredSharedVariables.filter((name) => {
    const configured = shared[name]?.value;
    return (
      typeof configured !== "string" ||
      configured.trim() === "" ||
      placeholder.test(configured.trim())
    );
  });
  if (missingOrInvalid.length > 0) {
    throw new Error(
      `Refusing to apply; missing or placeholder staging shared variables: ${missingOrInvalid.join(", ")}`,
    );
  }
  const tooShort = [
    ["JWT_SECRET", 32],
    ["OTP_PEPPER", 32],
  ]
    .filter(([name, minimum]) => shared[name].value.trim().length < minimum)
    .map(([name]) => name);
  if (tooShort.length > 0) {
    throw new Error(
      `Refusing to apply; staging shared variables fail minimum-length requirements: ${tooShort.join(", ")}`,
    );
  }
  return Object.fromEntries(
    requiredSharedVariables.map((name) => [name, shared[name].value]),
  );
}

function verifyReleaseConfiguration(shared) {
  const releaseEnvironment = createChildEnvironment({
    ...shared,
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
    LIVEKIT_EXPECTED_STAGING_URL: shared.LIVEKIT_URL,
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

function resolveRailwayExecutable() {
  const configuredPath = process.env.RAILWAY_CLI_PATH?.trim();
  if (configuredPath) {
    if (!isAbsolute(configuredPath)) {
      throw new Error("RAILWAY_CLI_PATH must be an absolute path.");
    }
    if (!existsSync(configuredPath)) {
      throw new Error("RAILWAY_CLI_PATH does not identify an executable file.");
    }
    return configuredPath;
  }

  const executableNames =
    process.platform === "win32"
      ? ["railway.exe", "railway.cmd", "railway"]
      : ["railway"];
  const resolved = resolvePathExecutable(executableNames, false);
  if (resolved) return resolved;
  throw new Error(
    `Railway CLI ${requiredCliVersion} was not found. Set an absolute RAILWAY_CLI_PATH or add the official binary to PATH.`,
  );
}

function resolvePathExecutable(executableNames, required = true) {
  for (const rawDirectory of (process.env.PATH ?? "").split(delimiter)) {
    const directory = rawDirectory.replace(/^"|"$/g, "").trim();
    if (!directory) continue;
    for (const name of executableNames) {
      const candidate = resolve(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  if (!required) return undefined;
  throw new Error("GitHub CLI was not found on PATH; CI cannot be verified.");
}
