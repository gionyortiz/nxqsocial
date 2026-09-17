import {
  createIsolatedMigrationJobEnvironment,
  formatIsolatedMigrationJobAuthoritySuccess,
  IsolatedMigrationJobAuthorityError,
  MIGRATION_JOB_FORBIDDEN_VARIABLES,
  requireIsolatedMigrationJobAuthority,
} from './migration-job-authority';

const migrationUrl =
  'postgresql://nxqsocial_migrator:migration_password@db.internal:5432/nxqsocial?sslmode=require';

const validEnvironment = () => ({
  NXQ_RELEASE_TARGET: 'staging',
  MIGRATION_DATABASE_ROLE: 'nxqsocial_migrator',
  MIGRATION_DATABASE_URL: migrationUrl,
});

describe('requireIsolatedMigrationJobAuthority', () => {
  it('accepts only the declared migration authority', () => {
    const authority = requireIsolatedMigrationJobAuthority(validEnvironment());

    expect(authority.releaseTarget).toBe('staging');
    expect(authority.migrationDatabaseRole).toBe('nxqsocial_migrator');
    expect(authority.migrationDatabaseUrl).toBe(migrationUrl);
    expect(formatIsolatedMigrationJobAuthoritySuccess(authority)).toContain(
      'No database URL or credential value was printed.',
    );
  });

  it('fails closed when the migration URL is missing or malformed', () => {
    const missing = validEnvironment();
    delete missing.MIGRATION_DATABASE_URL;
    expect(() => requireIsolatedMigrationJobAuthority(missing)).toThrow(
      'MIGRATION_DATABASE_URL is required',
    );

    expect(() =>
      requireIsolatedMigrationJobAuthority({
        ...validEnvironment(),
        MIGRATION_DATABASE_URL: 'postgresql://db.internal:5432/nxqsocial',
      }),
    ).toThrow(
      'MIGRATION_DATABASE_URL must be a PostgreSQL URL with an explicit role',
    );
  });

  it('rejects a URL that does not use the declared migration role', () => {
    expect(() =>
      requireIsolatedMigrationJobAuthority({
        ...validEnvironment(),
        MIGRATION_DATABASE_URL:
          'postgresql://nxqsocial_runtime:runtime_password@db.internal:5432/nxqsocial',
      }),
    ).toThrow(
      'MIGRATION_DATABASE_URL must use the MIGRATION_DATABASE_ROLE credential',
    );
  });

  it('rejects a self-attested runtime role even when its URL matches', () => {
    expect(() =>
      requireIsolatedMigrationJobAuthority({
        ...validEnvironment(),
        MIGRATION_DATABASE_ROLE: 'nxqsocial_runtime',
        MIGRATION_DATABASE_URL:
          'postgresql://nxqsocial_runtime:runtime_password@db.internal:5432/nxqsocial',
      }),
    ).toThrow(
      'MIGRATION_DATABASE_ROLE must equal nxqsocial_migrator for the isolated migration job',
    );
  });

  it('rejects owner role declarations, every runtime/API secret, and invalid targets', () => {
    expect(() =>
      requireIsolatedMigrationJobAuthority({
        ...validEnvironment(),
        NXQ_RELEASE_TARGET: 'preview',
        MIGRATION_DATABASE_ROLE: 'postgres',
        DATABASE_URL:
          'postgresql://nxqsocial_runtime:runtime_password@db.internal:5432/nxqsocial',
        RUNTIME_DATABASE_URL:
          'postgresql://nxqsocial_runtime:runtime_password@db.internal:5432/nxqsocial',
        JWT_SECRET: 'jwt_must_not_reach_migration_job',
        STRIPE_SECRET_KEY: 'sk_test_must_not_reach_migration_job',
        AWS_SECRET_ACCESS_KEY: 'r2_must_not_reach_migration_job',
      }),
    ).toThrow(
      /NXQ_RELEASE_TARGET must be staging or production[\s\S]*DATABASE_URL must not be available[\s\S]*RUNTIME_DATABASE_URL must not be available[\s\S]*JWT_SECRET must not be available[\s\S]*AWS_SECRET_ACCESS_KEY must not be available[\s\S]*STRIPE_SECRET_KEY must not be available[\s\S]*MIGRATION_DATABASE_ROLE must equal nxqsocial_migrator for the isolated migration job/,
    );
    expect(MIGRATION_JOB_FORBIDDEN_VARIABLES).toContain('LIVEKIT_API_SECRET');
    expect(MIGRATION_JOB_FORBIDDEN_VARIABLES).toContain('TWILIO_AUTH_TOKEN');
  });

  it('passes the migration URL only to Prisma child process state', () => {
    const environment = {
      ...validEnvironment(),
      PATH: '/safe/path',
      HOME: '/safe/home',
    };
    const authority = requireIsolatedMigrationJobAuthority(environment);
    const childEnvironment = createIsolatedMigrationJobEnvironment(
      environment,
      authority,
    );

    expect(environment.MIGRATION_DATABASE_URL).toBe(migrationUrl);
    expect(environment.DATABASE_URL).toBeUndefined();
    expect(childEnvironment.DATABASE_URL).toBe(migrationUrl);
    expect(childEnvironment.MIGRATION_DATABASE_URL).toBeUndefined();
    expect(childEnvironment.PATH).toBe('/safe/path');
    expect(childEnvironment.HOME).toBe('/safe/home');
    expect(Object.keys(childEnvironment).sort()).toEqual([
      'DATABASE_URL',
      'HOME',
      'MIGRATION_DATABASE_ROLE',
      'NODE_ENV',
      'NXQ_RELEASE_TARGET',
      'PATH',
    ]);
  });

  it('never includes credentials in errors', () => {
    const secretUrl =
      'postgresql://migration_never_print:migration_never_print@db.internal:5432/nxqsocial';
    let message = '';
    try {
      requireIsolatedMigrationJobAuthority({
        ...validEnvironment(),
        MIGRATION_DATABASE_URL: secretUrl,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(IsolatedMigrationJobAuthorityError);
      message = (error as Error).message;
    }

    expect(message).toContain('MIGRATION_DATABASE_URL');
    expect(message).not.toContain(secretUrl);
    expect(message).not.toContain('migration_never_print');
  });
});
