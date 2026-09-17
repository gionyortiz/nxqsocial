type ReleaseEnvironment = Record<string, string | undefined>;

export interface ReleaseMigrationAuthority {
  /** The restricted application connection used by the running API. */
  readonly runtimeDatabaseUrl: string;
  /** The separately configured connection used only by Prisma migrate deploy. */
  readonly migrationDatabaseUrl: string;
  readonly releaseTarget: 'staging' | 'production';
}

/**
 * Raised before Prisma is allowed to open a migration connection. Messages name
 * configuration rules only: connection strings and credential material are
 * intentionally never included.
 */
export class ReleaseMigrationAuthorityError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      [
        'Release migration authority validation failed:',
        ...issues.map((issue) => `- ${issue}`),
      ].join('\n'),
    );
    this.name = 'ReleaseMigrationAuthorityError';
  }
}

/**
 * Validate the two database authorities used during a Railway release.
 *
 * The application always constructs Prisma with DATABASE_URL. This function is
 * called only by the release migration command and returns the separately
 * supplied MIGRATION_DATABASE_URL for that command's child process. It cannot
 * create PostgreSQL roles or prove Railway variable scopes; those remain an
 * operational release gate.
 */
export function requireReleaseMigrationAuthority(
  environment: ReleaseEnvironment,
): ReleaseMigrationAuthority {
  const issues: string[] = [];
  const releaseTarget = read(environment, 'NXQ_RELEASE_TARGET');
  if (releaseTarget !== 'staging' && releaseTarget !== 'production') {
    issues.push('NXQ_RELEASE_TARGET must be staging or production');
  }

  const runtime = parsePostgresUrl(environment, 'DATABASE_URL', issues);
  const migration = parsePostgresUrl(
    environment,
    'MIGRATION_DATABASE_URL',
    issues,
  );

  if (runtime && migration) {
    if (runtime.href === migration.href) {
      issues.push(
        'MIGRATION_DATABASE_URL must not equal DATABASE_URL; use a distinct migration credential',
      );
    }

    // URL usernames/passwords are the only credential identity available in a
    // connection string. If they are the same, a cosmetic host/query change
    // must not make one credential appear to be two authorities.
    if (credentialIdentity(runtime) === credentialIdentity(migration)) {
      issues.push(
        'MIGRATION_DATABASE_URL must use database credentials distinct from DATABASE_URL',
      );
    }

    const runtimeDatabase = databaseName(runtime);
    const migrationDatabase = databaseName(migration);
    if (
      runtimeDatabase &&
      migrationDatabase &&
      runtimeDatabase !== migrationDatabase
    ) {
      issues.push(
        'MIGRATION_DATABASE_URL must target the same named database as DATABASE_URL',
      );
    }
  }

  if (issues.length > 0) {
    throw new ReleaseMigrationAuthorityError(issues);
  }

  return {
    runtimeDatabaseUrl: runtime!.href,
    migrationDatabaseUrl: migration!.href,
    releaseTarget: releaseTarget as 'staging' | 'production',
  };
}

/**
 * Builds the environment for Prisma's one-shot migration child process without
 * mutating process.env. The child sees MIGRATION_DATABASE_URL as DATABASE_URL;
 * the normal API process continues to use its own DATABASE_URL.
 */
export function createMigrationCommandEnvironment(
  environment: ReleaseEnvironment,
  authority = requireReleaseMigrationAuthority(environment),
): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    DATABASE_URL: authority.migrationDatabaseUrl,
  };
  delete childEnvironment.MIGRATION_DATABASE_URL;
  return childEnvironment;
}

export function formatReleaseMigrationAuthoritySuccess(
  authority: ReleaseMigrationAuthority,
): string {
  return [
    `Release migration authority accepted for ${authority.releaseTarget}.`,
    'Prisma will receive the separate migration connection only in its one-shot child process.',
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
      !databaseName(parsed)
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

function databaseName(url: URL): string {
  return url.pathname.replace(/^\/+/, '');
}

function credentialIdentity(url: URL): string {
  return `${decodeUrlComponent(url.username)}\u0000${decodeUrlComponent(url.password)}`;
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // URL parsing already rejects malformed escapes, but retain a no-throw
    // comparison helper if a future runtime supplies an unusual URL object.
    return value;
  }
}

function read(environment: ReleaseEnvironment, name: string): string {
  const value = environment[name];
  return typeof value === 'string' ? value.trim() : '';
}
