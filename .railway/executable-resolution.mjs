import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";

/**
 * Resolve a required operator CLI without mutating PATH or guessing a
 * fallback location. The caller controls the accepted executable names.
 */
export function resolvePathExecutable(
  executableNames,
  environment = process.env,
  required = true,
) {
  for (const rawDirectory of (environment.PATH ?? "").split(delimiter)) {
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
