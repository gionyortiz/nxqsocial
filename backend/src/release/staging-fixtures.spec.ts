import { createHash } from 'crypto';
import {
  assertStagingFixtureExecution,
  assertSyntheticStagingFixtures,
  STAGING_FIXTURE_CONFIRMATION,
  STAGING_FIXTURE_RAILWAY_TARGET,
  SYNTHETIC_STAGING_FIXTURES,
} from './staging-fixtures';

const TEST_DATABASE_URL = 'postgresql://not-opened.invalid/staging';
const TEST_DATABASE_URL_SHA256 = createHash('sha256')
  .update(TEST_DATABASE_URL)
  .digest('hex');

function validExecutionEnvironment(
  overrides: Record<string, string | undefined> = {},
) {
  return {
    STAGING_FIXTURES_CONFIRM: STAGING_FIXTURE_CONFIRMATION,
    STAGING_FIXTURE_ENVIRONMENT: 'staging',
    STAGING_FIXTURE_PASSWORD: 'StrongSyntheticPassphrase!1',
    DATABASE_URL: TEST_DATABASE_URL,
    STAGING_FIXTURE_EXPECTED_DATABASE_URL_SHA256: TEST_DATABASE_URL_SHA256,
    RAILWAY_PROJECT_ID: STAGING_FIXTURE_RAILWAY_TARGET.projectId,
    RAILWAY_ENVIRONMENT_ID: STAGING_FIXTURE_RAILWAY_TARGET.environmentId,
    RAILWAY_ENVIRONMENT_NAME: STAGING_FIXTURE_RAILWAY_TARGET.environmentName,
    ...overrides,
  };
}

describe('synthetic staging fixtures', () => {
  it('uses deterministic identifiers and only reserved non-deliverable recipients', () => {
    expect(() => assertSyntheticStagingFixtures()).not.toThrow();

    expect(SYNTHETIC_STAGING_FIXTURES.users).toHaveLength(3);
    expect(SYNTHETIC_STAGING_FIXTURES.posts).toHaveLength(3);
    expect(SYNTHETIC_STAGING_FIXTURES.follows).toHaveLength(2);
    for (const user of SYNTHETIC_STAGING_FIXTURES.users) {
      expect(user.id).toMatch(/^stg_fixture_user_\d{3}$/);
      expect(user.email).toMatch(/@staging\.invalid$/);
    }
  });

  it('contains no external URL, Pravatar, Picsum, phone, or real recipient data', () => {
    const serialized = JSON.stringify(SYNTHETIC_STAGING_FIXTURES).toLowerCase();

    expect(serialized).not.toContain('http://');
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain('pravatar');
    expect(serialized).not.toContain('picsum');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('@nxqsocial.com');
  });

  it('requires explicit staging identity, confirmation, password, and database', () => {
    expect(() => assertStagingFixtureExecution({})).toThrow(
      'STAGING_FIXTURES_CONFIRM',
    );
    expect(() =>
      assertStagingFixtureExecution({
        STAGING_FIXTURES_CONFIRM: STAGING_FIXTURE_CONFIRMATION,
        STAGING_FIXTURE_ENVIRONMENT: 'production',
      }),
    ).toThrow('STAGING_FIXTURE_ENVIRONMENT must equal staging');
  });

  it('rejects a Railway production target even with the execution confirmation', () => {
    expect(() =>
      assertStagingFixtureExecution(
        validExecutionEnvironment({
          RAILWAY_ENVIRONMENT_NAME: 'production',
        }),
      ),
    ).toThrow('RAILWAY_ENVIRONMENT_NAME must equal staging');
  });

  it('requires the exact approved Railway project and environment IDs', () => {
    expect(() =>
      assertStagingFixtureExecution(
        validExecutionEnvironment({
          RAILWAY_PROJECT_ID: 'different-project',
        }),
      ),
    ).toThrow('RAILWAY_PROJECT_ID must match the approved');

    expect(() =>
      assertStagingFixtureExecution(
        validExecutionEnvironment({
          RAILWAY_ENVIRONMENT_ID: 'different-environment',
        }),
      ),
    ).toThrow('RAILWAY_ENVIRONMENT_ID must match the approved');

    expect(() =>
      assertStagingFixtureExecution(
        validExecutionEnvironment({
          RAILWAY_PROJECT_ID: undefined,
        }),
      ),
    ).toThrow('RAILWAY_PROJECT_ID must match the approved');
  });

  it('requires a lowercase digest matching the exact DATABASE_URL', () => {
    expect(() =>
      assertStagingFixtureExecution(
        validExecutionEnvironment({
          STAGING_FIXTURE_EXPECTED_DATABASE_URL_SHA256:
            TEST_DATABASE_URL_SHA256.toUpperCase(),
        }),
      ),
    ).toThrow('must be a lowercase 64-character SHA-256 digest');

    expect(() =>
      assertStagingFixtureExecution(
        validExecutionEnvironment({
          STAGING_FIXTURE_EXPECTED_DATABASE_URL_SHA256: '0'.repeat(64),
        }),
      ),
    ).toThrow('DATABASE_URL does not match the approved staging database');

    expect(() =>
      assertStagingFixtureExecution(
        validExecutionEnvironment({
          DATABASE_URL: TEST_DATABASE_URL + ' ',
        }),
      ),
    ).toThrow('DATABASE_URL does not match the approved staging database');
  });

  it('does not expose the URL or either digest when database identity mismatches', () => {
    const wrongDigest = '0'.repeat(64);
    let message = '';
    try {
      assertStagingFixtureExecution(
        validExecutionEnvironment({
          STAGING_FIXTURE_EXPECTED_DATABASE_URL_SHA256: wrongDigest,
        }),
      );
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(TEST_DATABASE_URL);
    expect(message).not.toContain(TEST_DATABASE_URL_SHA256);
    expect(message).not.toContain(wrongDigest);
  });

  it('accepts a fully gated staging target without connecting to it', () => {
    expect(() =>
      assertStagingFixtureExecution(validExecutionEnvironment()),
    ).not.toThrow();
  });
});
