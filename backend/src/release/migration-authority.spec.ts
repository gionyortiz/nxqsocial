import {
  createMigrationCommandEnvironment,
  formatReleaseMigrationAuthoritySuccess,
  ReleaseMigrationAuthorityError,
  requireReleaseMigrationAuthority,
} from './migration-authority';

const runtimeUrl =
  'postgresql://nxq_runtime:runtime_password@db.internal:5432/nxqsocial?sslmode=require';
const migrationUrl =
  'postgresql://nxq_migrator:migration_password@db.internal:5432/nxqsocial?sslmode=require';

const validEnvironment = () => ({
  NXQ_RELEASE_TARGET: 'staging',
  DATABASE_URL: runtimeUrl,
  MIGRATION_DATABASE_URL: migrationUrl,
});

describe('requireReleaseMigrationAuthority', () => {
  it('accepts distinct, explicit database authorities for the same database', () => {
    const authority = requireReleaseMigrationAuthority(validEnvironment());

    expect(authority.releaseTarget).toBe('staging');
    expect(authority.runtimeDatabaseUrl).toBe(runtimeUrl);
    expect(authority.migrationDatabaseUrl).toBe(migrationUrl);
    expect(formatReleaseMigrationAuthoritySuccess(authority)).toContain(
      'No database URL or credential value was printed.',
    );
  });

  it('fails closed when the migration authority is missing', () => {
    const environment = validEnvironment();
    delete environment.MIGRATION_DATABASE_URL;

    expect(() => requireReleaseMigrationAuthority(environment)).toThrow(
      'MIGRATION_DATABASE_URL is required',
    );
  });

  it('fails closed when migration and runtime URLs are the same', () => {
    const environment = {
      ...validEnvironment(),
      MIGRATION_DATABASE_URL: runtimeUrl,
    };

    expect(() => requireReleaseMigrationAuthority(environment)).toThrow(
      /MIGRATION_DATABASE_URL must not equal DATABASE_URL[\s\S]*must use database credentials distinct/,
    );
  });

  it('rejects a cosmetic URL change that keeps the runtime credentials', () => {
    const environment = {
      ...validEnvironment(),
      MIGRATION_DATABASE_URL:
        'postgresql://nxq_runtime:runtime_password@migration-gateway.internal:5432/nxqsocial?sslmode=require',
    };

    expect(() => requireReleaseMigrationAuthority(environment)).toThrow(
      'MIGRATION_DATABASE_URL must use database credentials distinct from DATABASE_URL',
    );
  });

  it('rejects a different password when the migration URL reuses the runtime role', () => {
    const environment = {
      ...validEnvironment(),
      MIGRATION_DATABASE_URL:
        'postgresql://nxq_runtime:a_different_password@migration-gateway.internal:5432/nxqsocial?sslmode=require',
    };

    expect(() => requireReleaseMigrationAuthority(environment)).toThrow(
      'MIGRATION_DATABASE_URL must use a PostgreSQL role distinct from DATABASE_URL',
    );
  });

  it('rejects an encoded spelling of the runtime password', () => {
    const environment = {
      ...validEnvironment(),
      MIGRATION_DATABASE_URL:
        'postgresql://nxq_runtime:runtime%5Fpassword@db.internal:5432/nxqsocial?sslmode=require',
    };

    expect(() => requireReleaseMigrationAuthority(environment)).toThrow(
      'MIGRATION_DATABASE_URL must use database credentials distinct from DATABASE_URL',
    );
  });

  it('rejects a migration URL for a different named database', () => {
    const environment = {
      ...validEnvironment(),
      MIGRATION_DATABASE_URL:
        'postgresql://nxq_migrator:migration_password@db.internal:5432/other_database?sslmode=require',
    };

    expect(() => requireReleaseMigrationAuthority(environment)).toThrow(
      'MIGRATION_DATABASE_URL must target the same named database as DATABASE_URL',
    );
  });

  it('rejects missing role/password information and an unsupported release target', () => {
    const environment = {
      ...validEnvironment(),
      NXQ_RELEASE_TARGET: 'preview',
      MIGRATION_DATABASE_URL: 'postgresql://db.internal:5432/nxqsocial',
    };

    expect(() => requireReleaseMigrationAuthority(environment)).toThrow(
      /NXQ_RELEASE_TARGET must be staging or production[\s\S]*MIGRATION_DATABASE_URL must be a PostgreSQL URL with an explicit role/,
    );
  });

  it('does not mutate the runtime environment when preparing Prisma', () => {
    const environment = validEnvironment();
    const authority = requireReleaseMigrationAuthority(environment);
    const childEnvironment = createMigrationCommandEnvironment(
      environment,
      authority,
    );

    expect(environment.DATABASE_URL).toBe(runtimeUrl);
    expect(environment.MIGRATION_DATABASE_URL).toBe(migrationUrl);
    expect(childEnvironment.DATABASE_URL).toBe(migrationUrl);
    expect(childEnvironment.MIGRATION_DATABASE_URL).toBeUndefined();
  });

  it('never includes credentials in validation errors', () => {
    const secretRuntime =
      'postgresql://runtime_never_print:runtime_never_print@db.internal:5432/nxqsocial';
    const secretMigration =
      'postgresql://migration_never_print:migration_never_print@db.internal:5432/nxqsocial';

    let message = '';
    try {
      requireReleaseMigrationAuthority({
        NXQ_RELEASE_TARGET: 'invalid',
        DATABASE_URL: secretRuntime,
        MIGRATION_DATABASE_URL: secretMigration,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ReleaseMigrationAuthorityError);
      message = (error as Error).message;
    }

    expect(message).toContain('NXQ_RELEASE_TARGET');
    expect(message).not.toContain(secretRuntime);
    expect(message).not.toContain(secretMigration);
    expect(message).not.toContain('runtime_never_print');
    expect(message).not.toContain('migration_never_print');
  });
});
