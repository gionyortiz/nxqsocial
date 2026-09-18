import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createChildEnvironment } from "./child-environment.mjs";
import {
  resolveApprovedRailwayExecutable,
  verifyReviewedRailwayCli,
} from "./railway-cli-verification.mjs";

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
const requestedPlanArguments = process.argv.slice(2);
if (
  requestedPlanArguments.some((argument) => argument !== "--verbose") ||
  requestedPlanArguments.filter((argument) => argument === "--verbose").length >
    1
) {
  throw new Error(
    "Only the non-secret --verbose plan flag is allowed by this wrapper.",
  );
}
const executable = resolveApprovedRailwayExecutable();
const cliEnvironment = createChildEnvironment({ _: executable });
verifyReviewedRailwayCli(executable, cliEnvironment, repositoryRoot);

const statusResult = spawnSync(executable, ["status", "--json"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  env: cliEnvironment,
  stdio: ["ignore", "pipe", "pipe"],
});

if (statusResult.error || statusResult.status !== 0) {
  throw new Error("Unable to verify the linked Railway target.");
}

let status;
try {
  status = JSON.parse(statusResult.stdout);
} catch {
  throw new Error("Railway status returned invalid JSON.");
}

const environments = Array.isArray(status?.environments?.edges)
  ? status.environments.edges
  : [];
const stagingEnvironment = environments.find(
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
  throw new Error("Refusing to plan against an unexpected Railway target.");
}

// `status --json` currently lists every environment but does not identify the
// linked one. Confirm the CLI's selected environment from its sanitized,
// human-readable status before allowing the plan to run.
const linkedStatusResult = spawnSync(executable, ["status"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  env: cliEnvironment,
  stdio: ["ignore", "pipe", "pipe"],
});

if (linkedStatusResult.error || linkedStatusResult.status !== 0) {
  throw new Error("Unable to verify the linked Railway environment.");
}

const linkedStatus = linkedStatusResult.stdout;
const linkedProjectName = linkedStatus.match(/^Project:\s+(.+)$/m)?.[1]?.trim();
const linkedProjectId = linkedStatus.match(/^Project ID:\s+(\S+)$/m)?.[1];
const linkedEnvironmentName = linkedStatus
  .match(/^Environment:\s+(.+)$/m)?.[1]
  ?.trim();
const linkedEnvironmentId = linkedStatus.match(
  /^Environment ID:\s+(\S+)$/m,
)?.[1];

if (
  linkedProjectName !== expectedProject.name ||
  linkedProjectId !== expectedProject.id ||
  linkedEnvironmentName !== expectedEnvironment.name ||
  linkedEnvironmentId !== expectedEnvironment.id
) {
  throw new Error("Refusing to plan against a non-staging Railway link.");
}

console.error(
  `Verified Railway target: ${expectedProject.name} / ${expectedEnvironment.name}.`,
);

// The current Railway CLI evaluates the IaC program without populating its
// optional context object. Inject the already verified, non-secret target
// identity only for that evaluation so the definition itself still fails
// closed when invoked directly or against a different target.
const approvedPlanEnvironment = {
  ...cliEnvironment,
  NXQ_RAILWAY_IAC_PROJECT_ID: expectedProject.id,
  NXQ_RAILWAY_IAC_PROJECT_NAME: expectedProject.name,
  NXQ_RAILWAY_IAC_ENVIRONMENT_ID: expectedEnvironment.id,
  NXQ_RAILWAY_IAC_ENVIRONMENT_NAME: expectedEnvironment.name,
};

const result = spawnSync(
  executable,
  [
    "config",
    "plan",
    "--file",
    join(railwayDirectory, "railway.ts"),
    ...requestedPlanArguments,
  ],
  {
    cwd: repositoryRoot,
    env: approvedPlanEnvironment,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
