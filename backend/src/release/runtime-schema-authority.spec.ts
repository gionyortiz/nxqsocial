import {
  createRuntimeSchemaVerificationEnvironment,
  formatRuntimeSchemaVerificationSuccess,
  requireRuntimeSchemaAuthority,
  RuntimeSchemaAuthorityError,
} from './runtime-schema-authority';

const runtimeUrl =
  'postgresql://nxqsocial_runtime:runtime_password@db.internal:5432/nxqsocial?sslmode=require';

const validEnvironment = () => ({
  NXQ_RELEASE_TARGET: 'staging',
  RUNTIME_DATABASE_ROLE: 'nxqsocial_runtime',
  DATABASE_URL: runtimeUrl,
});

describe('requireRuntimeSchemaAuthority', () => {
  it('accepts only the restricted API credential', () => {
    const authority = requireRuntimeSchemaAuthority(validEnvironment());

    expect(authority.releaseTarget).toBe('staging');
    expect(authority.databaseUrl).toBe(runtimeUrl);
    expect(formatRuntimeSchemaVerificationSuccess(authority)).toContain(
      'No database URL or credential value was printed.',
    );
  });

  it('fails closed before an API can boot on a migration secret or wrong role', () => {
    expect(() =>
      requireRuntimeSchemaAuthority({
        ...validEnvironment(),
        RUNTIME_DATABASE_ROLE: 'nxqsocial_migrator',
        DATABASE_URL:
          'postgresql://nxqsocial_migrator:migrator_password@db.internal:5432/nxqsocial',
        MIGRATION_DATABASE_URL:
          'postgresql://nxqsocial_migrator:migrator_password@db.internal:5432/nxqsocial',
      }),
    ).toThrow(
      /MIGRATION_DATABASE_URL must not be available[\s\S]*RUNTIME_DATABASE_ROLE must equal nxqsocial_runtime[\s\S]*DATABASE_URL must use the nxqsocial_runtime credential/,
    );
  });

  it('passes only minimal process context to Prisma status', () => {
    const environment = {
      ...validEnvironment(),
      PATH: '/safe/path',
      HOME: '/safe/home',
      STRIPE_SECRET_KEY: 'sk_test_never_passed_to_prisma',
    };
    const authority = requireRuntimeSchemaAuthority(environment);
    const childEnvironment = createRuntimeSchemaVerificationEnvironment(
      environment,
      authority,
    );

    expect(childEnvironment.DATABASE_URL).toBe(runtimeUrl);
    expect(childEnvironment.STRIPE_SECRET_KEY).toBeUndefined();
    expect(Object.keys(childEnvironment).sort()).toEqual([
      'DATABASE_URL',
      'HOME',
      'NODE_ENV',
      'NXQ_RELEASE_TARGET',
      'PATH',
      'RUNTIME_DATABASE_ROLE',
    ]);
  });

  it('does not leak a URL when validation fails', () => {
    const secretUrl =
      'postgresql://runtime_never_print:runtime_never_print@db.internal:5432/nxqsocial';
    let message = '';
    try {
      requireRuntimeSchemaAuthority({
        ...validEnvironment(),
        DATABASE_URL: secretUrl,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeSchemaAuthorityError);
      message = (error as Error).message;
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(secretUrl);
    expect(message).not.toContain('runtime_never_print');
  });
});
