import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  assertFileSha256,
  assertRailwayCliVersion,
  fileSha256,
  resolveApprovedRailwayExecutable,
} from "./railway-cli-verification.mjs";
import { resolvePathExecutable } from "./executable-resolution.mjs";

test("hash verification accepts only the exact expected bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "nxq-railway-cli-test-"));
  const fixture = join(directory, "railway.exe");
  try {
    writeFileSync(fixture, "reviewed fixture\n", "utf8");
    const hash = fileSha256(fixture);
    assert.doesNotThrow(() => assertFileSha256(fixture, hash));
    assert.throws(() => assertFileSha256(fixture, "00".repeat(32)), /SHA-256/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("CLI selection requires an explicit existing absolute path", () => {
  const directory = mkdtempSync(join(tmpdir(), "nxq-railway-cli-test-"));
  const fixture = join(directory, "railway.exe");
  try {
    writeFileSync(fixture, "fixture", "utf8");
    assert.equal(
      resolveApprovedRailwayExecutable({ RAILWAY_CLI_PATH: fixture }),
      fixture,
    );
    assert.throws(() => resolveApprovedRailwayExecutable({}), /RAILWAY_CLI_PATH/);
    assert.throws(
      () =>
        resolveApprovedRailwayExecutable({
          RAILWAY_CLI_PATH: "relative/railway.exe",
        }),
      /absolute path/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("version verification rejects a nonzero or impersonated CLI result", () => {
  const acceptedSpawn = () => ({
    error: undefined,
    status: 0,
    stdout: "railway 5.43.3\n",
  });
  assert.doesNotThrow(() =>
    assertRailwayCliVersion(
      resolve(process.execPath),
      {},
      process.cwd(),
      acceptedSpawn,
    ),
  );
  assert.throws(
    () =>
      assertRailwayCliVersion(
        resolve(process.execPath),
        {},
        process.cwd(),
        () => ({ error: undefined, status: 0, stdout: "railway 5.23.0\n" }),
      ),
    /unverified executable/,
  );
});

test("GitHub CLI discovery is confined to the supplied PATH", () => {
  const directory = mkdtempSync(join(tmpdir(), "nxq-gh-cli-test-"));
  const executable = join(directory, process.platform === "win32" ? "gh.exe" : "gh");
  try {
    writeFileSync(executable, "fixture", "utf8");
    assert.equal(
      resolvePathExecutable([executable.split(/[\\/]/).pop()], { PATH: directory }),
      executable,
    );
    assert.throws(
      () => resolvePathExecutable(["gh-does-not-exist"], { PATH: directory }),
      /GitHub CLI/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
