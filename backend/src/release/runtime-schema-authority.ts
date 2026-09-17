type ReleaseEnvironment = Record<string, string | undefined>;

const RUNTIME_DATABASE_ROLE = 'nxqsocial_runtime';
const CHILD_PROCESS_CONTEXT_VARIABLES = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'NODE_OPTIONS',
  'NODE_PATH',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'TZ',
  'LANG',
  'LC_ALL',
  // Required only to launch the lockfile-pinned Node/NPM executable on local
  // Windows rehearsals. These are operating-system process variables, not
  // application configuration or credentials.
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
] as const;

export interface RuntimeSchemaAuthority {
  readonly databaseUrl: string;
  readonly releaseTarget: 'staging' | 'production';
}

/**
 * The API never applies DDL. Before it can become healthy, its restricted
 * runtime credential must prove the committed Prisma migration set is already
 * present. This is the fail-closed counterpart to the separate migration job:
 * a parallel or failed job leaves the API deployment unavailable rather than
 * serving an unknown schema.
 */
export class RuntimeSchemaAuthorityError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      [
        'Runtime schema authority validation failed:',
        ...issues.map((issue) => `- ${issue}`),
      ].join('\n'),
    );
    this.name = 'RuntimeSchemaAuthorityError';
  }
}

export function requireRuntimeSchemaAuthority(
  environment: ReleaseEnvironment,
): RuntimeSchemaAuthority {
  const issues: string[] = [];
  const releaseTarget = read(environment, 'NXQ_RELEASE_TARGET');
  if (releaseTarget !== 'staging' && releaseTarget !== 'production') {
    issues.push('NXQ_RELEASE_TARGET must be staging or production');
  }

  if (read(environment, 'MIGRATION_DATABASE_URL')) {
    issues.push('MIGRATION_DATABASE_URL must not be available to the API');
  }

  const declaredRole = read(environment, 'RUNTIME_DATABASE_ROLE');
  if (declaredRole !== RUNTIME_DATABASE_ROLE) {
    issues.push(
      `RUNTIME_DATABASE_ROLE must equal ${RUNTIME_DATABASE_ROLE} for runtime schema verification`,
    );
  }

  const database = parsePostgresUrl(environment, 'DATABASE_URL', issues);
  if (database && roleIdentity(database) !== RUNTIME_DATABASE_ROLE) {
    issues.push(
      `DATABASE_URL must use the ${RUNTIME_DATABASE_ROLE} credential for runtime schema verification`,
    );
  }

  if (issues.length > 0) throw new RuntimeSchemaAuthorityError(issues);
  return {
    databaseUrl: database!.href,
    releaseTarget: releaseTarget as 'staging' | 'production',
  };
}

/**
 * Prisma only needs its URL and ordinary process context. Do not forward
 * provider credentials from the API container merely to read migration status.
 */
export function createRuntimeSchemaVerificationEnvironment(
  environment: ReleaseEnvironment,
  authority = requireRuntimeSchemaAuthority(environment),
): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv = Object.fromEntries(
    CHILD_PROCESS_CONTEXT_VARIABLES.flatMap((name) => {
      const value = environment[name];
      return typeof value === 'string' && value !== '' ? [[name, value]] : [];
    }),
  );
  Object.assign(childEnvironment, {
    NODE_ENV: 'production',
    NXQ_RELEASE_TARGET: authority.releaseTarget,
    RUNTIME_DATABASE_ROLE,
    DATABASE_URL: authority.databaseUrl,
  });
  return childEnvironment;
}

export function formatRuntimeSchemaVerificationSuccess(
  authority: RuntimeSchemaAuthority,
): string {
  return [
    `Runtime schema verification passed for ${authority.releaseTarget}.`,
    `The restricted ${RUNTIME_DATABASE_ROLE} role verified the committed migration set.`,
    'No database URL or credential value was printed.',
  ].join('\n');
}

export function formatRuntimeSchemaAuthoritySuccess(
  authority: RuntimeSchemaAuthority,
): string {
  return [
    `Runtime schema authority accepted for ${authority.releaseTarget}.`,
    `The restricted ${RUNTIME_DATABASE_ROLE} role is the only allowed API credential.`,
    'No database URL or credential value was printed.',
  ].join('\n');
}

function parsePostgresUrl(
  environment: ReleaseEnvironment,
  name: string,
  issues: string[],
): URL | undefined {
  const value = read(environment, name);
  if (!value) {
    issues.push(`${name} is required`);
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
      !parsed.hostname ||
      !parsed.username ||
      !parsed.password ||
      !parsed.pathname.replace(/^\/+/, '')
    ) {
      issues.push(
        `${name} must be a PostgreSQL URL with an explicit role, password, host, and database name`,
      );
      return undefined;
    }
    return parsed;
  } catch {
    issues.push(`${name} must be a valid PostgreSQL URL`);
    return undefined;
  }
}

function roleIdentity(url: URL): string {
  try {
    return decodeURIComponent(url.username);
  } catch {
    return url.username;
  }
}

function read(environment: ReleaseEnvironment, name: string): string {
  const value = environment[name];
  return typeof value === 'string' ? value.trim() : '';
}
