const allowedParentNames = new Set(
  [
    "APPDATA",
    "COMSPEC",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "LANG",
    "LC_ALL",
    "LOCALAPPDATA",
    "NO_COLOR",
    "PATH",
    "PATHEXT",
    "PROGRAMDATA",
    "SystemRoot",
    "TEMP",
    "TERM",
    "TMP",
    "USERPROFILE",
    "WINDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
  ].map((name) => name.toLowerCase()),
);

/**
 * Create a minimal subprocess environment without forwarding provider tokens,
 * cloud credentials, or unrelated application secrets from the operator shell.
 */
export function createChildEnvironment(additions = {}) {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (
      allowedParentNames.has(name.toLowerCase()) &&
      typeof value === "string"
    ) {
      environment[name] = value;
    }
  }
  return { ...environment, ...additions };
}
