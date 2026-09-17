type ReleaseEnvironment = Record<string, string | undefined>;

/**
 * A migration container needs only a DDL credential. Keep this list explicit
 * so an accidental Railway shared-variable attachment fails before the Prisma
 * child starts. It deliberately includes both credentials and non-secret API
 * configuration: neither belongs in a one-shot schema job.
 */
export const MIGRATION_JOB_FORBIDDEN_VARIABLES = [
  'DATABASE_URL',
  'RUNTIME_DATABASE_URL',
  'RUNTIME_DATABASE_ROLE',
  'REDIS_URL',
  'JWT_SECRET',
  'OTP_PEPPER',
  'TURNSTILE_SECRET_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_GIFTS_RESTRICTED_KEY',
  'STRIPE_GIFTS_WEBHOOK_SECRET',
  'LIVEKIT_URL',
  'LIVEKIT_EXPECTED_STAGING_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'REKOGNITION_REGION',
  'REKOGNITION_ACCESS_KEY_ID',
  'REKOGNITION_SECRET_ACCESS_KEY',
  'REKOGNITION_S3_BUCKET',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_BUCKET_NAME',
  'S3_QUARANTINE_BUCKET',
  'S3_PUBLIC_BASE_URL',
  'S3_PUBLIC_BASE',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_TUNNEL_TOKEN',
  'OPENAI_API_KEY',
] as const;

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
const MIGRATION_DATABASE_ROLE = 'nxqsocial_migrator';

export interface IsolatedMigrationJobAuthority {
  /** The only database authority available to the one-shot migration job. */
  readonly migrationDatabaseUrl: string;
  readonly migrationDatabaseRole: string;
  readonly releaseTarget: 'staging' | 'production';
}

/**
 * The Railway migration job is intentionally a separate service from the API.
 * Railway makes a service's variables available to both its pre-deploy command
 * and its runtime, so the API must never run migrations with a privileged
 * connection in that same service. This validator therefore accepts only the
 * migration authority and fails closed if the job is given any runtime/API
 * variable. This is enforced both at job startup and in the Prisma child
 * environment below.
 */
export class IsolatedMigrationJobAuthorityError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      [
        'Isolated migration-job authority validation failed:',
        ...issues.map((issue) => `- ${issue}`),
      ].join('\n'),
    );
    this.name = 'IsolatedMigrationJobAuthorityError';
  }
}

export function requireIsolatedMigrationJobAuthority(
  environment: ReleaseEnvironment,
): IsolatedMigrationJobAuthority {
  const issues: string[] = [];
  const releaseTarget = read(environment, 'NXQ_RELEASE_TARGET');
  if (releaseTarget !== 'staging' && releaseTarget !== 'production') {
    issues.push('NXQ_RELEASE_TARGET must be staging or production');
  }

  for (const name of MIGRATION_JOB_FORBIDDEN_VARIABLES) {
    if (read(environment, name)) {
      issues.push(
        `${name} must not be available to the isolated migration job`,
      );
    }
  }

  const expectedRole = requireMigrationRole(environment, issues);
  const migration = parsePostgresUrl(
    environment,
    'MIGRATION_DATABASE_URL',
    issues,
  );

  if (expectedRole && migration && roleIdentity(migration) !== expectedRole) {
    issues.push(
      'MIGRATION_DATABASE_URL must use the MIGRATION_DATABASE_ROLE credential',
    );
  }

  if (issues.length > 0) {
    throw new IsolatedMigrationJobAuthorityError(issues);
  }

  return {
    migrationDatabaseUrl: migration!.href,
    migrationDatabaseRole: expectedRole!,
    releaseTarget: releaseTarget as 'staging' | 'production',
  };
}

/**
 * Prisma reads DATABASE_URL. Build a minimal process environment rather than
 * inheriting the job's ambient variables, then give Prisma its process-local
 * migration URL. The API service cannot call this code because it receives
 * neither migration variable nor this command.
 */
export function createIsolatedMigrationJobEnvironment(
  environment: ReleaseEnvironment,
  authority = requireIsolatedMigrationJobAuthority(environment),
): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv =
    pickChildProcessContext(environment);
  Object.assign(childEnvironment, {
    NODE_ENV: 'production',
    NXQ_RELEASE_TARGET: authority.releaseTarget,
    MIGRATION_DATABASE_ROLE: authority.migrationDatabaseRole,
    DATABASE_URL: authority.migrationDatabaseUrl,
  });
  return childEnvironment;
}

export function formatIsolatedMigrationJobAuthoritySuccess(
  authority: IsolatedMigrationJobAuthority,
): string {
  return [
    `Isolated migration-job authority accepted for ${authority.releaseTarget}.`,
    `The one-shot job is using the declared ${authority.migrationDatabaseRole} role.`,
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

function requireMigrationRole(
  environment: ReleaseEnvironment,
  issues: string[],
): string | undefined {
  const role = read(environment, 'MIGRATION_DATABASE_ROLE');
  if (role !== MIGRATION_DATABASE_ROLE) {
    issues.push(
      `MIGRATION_DATABASE_ROLE must equal ${MIGRATION_DATABASE_ROLE} for the isolated migration job`,
    );
    return undefined;
  }
  return role;
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

function pickChildProcessContext(
  environment: ReleaseEnvironment,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    CHILD_PROCESS_CONTEXT_VARIABLES.flatMap((name) => {
      const value = environment[name];
      return typeof value === 'string' && value !== '' ? [[name, value]] : [];
    }),
  );
}
