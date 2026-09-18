import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

export const REQUIRED_RAILWAY_CLI_VERSION = "5.43.3";
// This is the reviewed byte identity, not evidence of a Windows Application
// Control approval. The operator must obtain that approval separately before
// any wrapper is allowed to run the unsigned file.
export const REVIEWED_RAILWAY_CLI_SHA256 =
  "3788C728BE0D601DC55FDAA25F1708431DBD79F471F742E1CBE3FC7493652222";

/**
 * The release wrappers intentionally require an explicit executable path.
 * Falling back to PATH could silently select the older npm-managed CLI or a
 * different binary with a spoofed version string.
 */
export function resolveApprovedRailwayExecutable(environment = process.env) {
  const configuredPath = environment.RAILWAY_CLI_PATH?.trim();
  if (!configuredPath) {
    throw new Error(
      "RAILWAY_CLI_PATH must name the reviewed Railway CLI executable; PATH discovery is not permitted.",
    );
  }
  if (!isAbsolute(configuredPath)) {
    throw new Error("RAILWAY_CLI_PATH must be an absolute path.");
  }
  if (!existsSync(configuredPath)) {
    throw new Error("RAILWAY_CLI_PATH does not identify an executable file.");
  }
  return configuredPath;
}

export function fileSha256(filePath) {
  return createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex")
    .toUpperCase();
}

export function assertFileSha256(filePath, expectedSha256) {
  const actualSha256 = fileSha256(filePath);
  if (actualSha256 !== expectedSha256.toUpperCase()) {
    throw new Error(
      "Railway CLI SHA-256 does not match the reviewed artifact; refusing to run it.",
    );
  }
}

export function assertRailwayCliVersion(
  executablePath,
  environment,
  cwd,
  spawn = spawnSync,
) {
  const result = spawn(executablePath, ["--version"], {
    cwd,
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (
    result.error ||
    result.status !== 0 ||
    result.stdout?.trim() !== `railway ${REQUIRED_RAILWAY_CLI_VERSION}`
  ) {
    throw new Error(
      `Railway CLI ${REQUIRED_RAILWAY_CLI_VERSION} is required; refusing an unverified executable.`,
    );
  }
}

/**
 * A matching file hash is necessary but does not replace a Windows Application
 * Control approval. The operating-system policy remains the authority for
 * whether this unsigned release artifact may execute.
 */
export function verifyReviewedRailwayCli(executablePath, environment, cwd) {
  assertFileSha256(executablePath, REVIEWED_RAILWAY_CLI_SHA256);
  assertRailwayCliVersion(executablePath, environment, cwd);
}
