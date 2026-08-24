import { createHash, timingSafeEqual } from 'crypto';
import { NXQ_SOCIAL_STAGING_TARGET } from './staging-target';

type FixtureEnvironment = Record<string, string | undefined>;

export const STAGING_FIXTURE_CONFIRMATION = 'SEED_SYNTHETIC_STAGING';
export const STAGING_FIXTURE_RAILWAY_TARGET = NXQ_SOCIAL_STAGING_TARGET.railway;

export const SYNTHETIC_STAGING_FIXTURES = {
  users: [
    {
      id: 'stg_fixture_user_001',
      profileId: 'stg_fixture_profile_001',
      email: 'fixture-001@staging.invalid',
      username: 'staging_fixture_001',
      displayName: 'Synthetic Explorer 001',
      bio: 'Synthetic staging account for registration and feed checks.',
      verificationStatus: 'ID_VERIFIED' as const,
      trustScore: 95,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'stg_fixture_user_002',
      profileId: 'stg_fixture_profile_002',
      email: 'fixture-002@staging.invalid',
      username: 'staging_fixture_002',
      displayName: 'Synthetic Creator 002',
      bio: 'Synthetic staging account for creator workflow checks.',
      verificationStatus: 'HUMAN_VERIFIED' as const,
      trustScore: 85,
      createdAt: '2026-01-01T00:01:00.000Z',
    },
    {
      id: 'stg_fixture_user_003',
      profileId: 'stg_fixture_profile_003',
      email: 'fixture-003@staging.invalid',
      username: 'staging_fixture_003',
      displayName: 'Synthetic Viewer 003',
      bio: 'Synthetic staging account for follow and visibility checks.',
      verificationStatus: 'BASIC' as const,
      trustScore: 40,
      createdAt: '2026-01-01T00:02:00.000Z',
    },
  ],
  posts: [
    {
      id: 'stg_fixture_post_001',
      authorId: 'stg_fixture_user_001',
      caption: 'Synthetic public text post for deterministic feed checks.',
      visibility: 'PUBLIC' as const,
      createdAt: '2026-01-01T01:00:00.000Z',
    },
    {
      id: 'stg_fixture_post_002',
      authorId: 'stg_fixture_user_002',
      caption: 'Synthetic followers-only post for authorization checks.',
      visibility: 'FOLLOWERS' as const,
      createdAt: '2026-01-01T01:01:00.000Z',
    },
    {
      id: 'stg_fixture_post_003',
      authorId: 'stg_fixture_user_003',
      caption: 'Synthetic learning-feed post with no external media.',
      visibility: 'PUBLIC' as const,
      createdAt: '2026-01-01T01:02:00.000Z',
    },
  ],
  follows: [
    {
      id: 'stg_fixture_follow_001',
      followerId: 'stg_fixture_user_001',
      followingId: 'stg_fixture_user_002',
      createdAt: '2026-01-01T02:00:00.000Z',
    },
    {
      id: 'stg_fixture_follow_002',
      followerId: 'stg_fixture_user_003',
      followingId: 'stg_fixture_user_002',
      createdAt: '2026-01-01T02:01:00.000Z',
    },
  ],
} as const;

const PLACEHOLDER =
  /change[-_ ]?me|replace(?:[-_ ]?with)?|placeholder|__required__|\.\.\.$/i;

export function assertSyntheticStagingFixtures(): void {
  const ids = [
    ...SYNTHETIC_STAGING_FIXTURES.users.flatMap((user) => [
      user.id,
      user.profileId,
    ]),
    ...SYNTHETIC_STAGING_FIXTURES.posts.map((post) => post.id),
    ...SYNTHETIC_STAGING_FIXTURES.follows.map((follow) => follow.id),
  ];
  if (new Set(ids).size !== ids.length) {
    throw new Error('Synthetic staging fixture identifiers must be unique');
  }

  for (const user of SYNTHETIC_STAGING_FIXTURES.users) {
    if (!user.email.endsWith('@staging.invalid')) {
      throw new Error(
        'Synthetic staging fixture recipients must use the reserved staging.invalid domain',
      );
    }
  }

  const serialized = JSON.stringify(SYNTHETIC_STAGING_FIXTURES).toLowerCase();
  if (
    serialized.includes('http://') ||
    serialized.includes('https://') ||
    serialized.includes('pravatar') ||
    serialized.includes('picsum')
  ) {
    throw new Error(
      'Synthetic staging fixtures must not contain external media URLs',
    );
  }

  const userIds = new Set(
    SYNTHETIC_STAGING_FIXTURES.users.map((user) => user.id),
  );
  for (const post of SYNTHETIC_STAGING_FIXTURES.posts) {
    if (!userIds.has(post.authorId)) {
      throw new Error('Synthetic staging posts must reference fixture users');
    }
  }
  for (const follow of SYNTHETIC_STAGING_FIXTURES.follows) {
    if (
      String(follow.followerId) === String(follow.followingId) ||
      !userIds.has(follow.followerId) ||
      !userIds.has(follow.followingId)
    ) {
      throw new Error(
        'Synthetic staging follows must reference distinct fixture users',
      );
    }
  }
}

export function assertStagingFixtureExecution(
  environment: FixtureEnvironment,
): void {
  if (
    environment.STAGING_FIXTURES_CONFIRM?.trim() !==
    STAGING_FIXTURE_CONFIRMATION
  ) {
    throw new Error(
      `STAGING_FIXTURES_CONFIRM must equal ${STAGING_FIXTURE_CONFIRMATION}`,
    );
  }
  if (environment.STAGING_FIXTURE_ENVIRONMENT?.trim() !== 'staging') {
    throw new Error('STAGING_FIXTURE_ENVIRONMENT must equal staging');
  }

  if (
    environment.RAILWAY_PROJECT_ID?.trim() !==
    STAGING_FIXTURE_RAILWAY_TARGET.projectId
  ) {
    throw new Error(
      'RAILWAY_PROJECT_ID must match the approved NXQ Social staging project',
    );
  }
  if (
    environment.RAILWAY_ENVIRONMENT_ID?.trim() !==
    STAGING_FIXTURE_RAILWAY_TARGET.environmentId
  ) {
    throw new Error(
      'RAILWAY_ENVIRONMENT_ID must match the approved NXQ Social staging environment',
    );
  }
  if (
    environment.RAILWAY_ENVIRONMENT_NAME?.trim() !==
    STAGING_FIXTURE_RAILWAY_TARGET.environmentName
  ) {
    throw new Error(
      'RAILWAY_ENVIRONMENT_NAME must equal staging for the approved target',
    );
  }

  const password = environment.STAGING_FIXTURE_PASSWORD?.trim() ?? '';
  if (!password || password.length < 16 || PLACEHOLDER.test(password)) {
    throw new Error(
      'STAGING_FIXTURE_PASSWORD must be a non-placeholder value of at least 16 characters',
    );
  }
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is required to seed staging fixtures');
  }
  const expectedDatabaseUrlDigest =
    environment.STAGING_FIXTURE_EXPECTED_DATABASE_URL_SHA256?.trim() ?? '';
  if (!/^[a-f0-9]{64}$/.test(expectedDatabaseUrlDigest)) {
    throw new Error(
      'STAGING_FIXTURE_EXPECTED_DATABASE_URL_SHA256 must be a lowercase 64-character SHA-256 digest',
    );
  }
  const actualDatabaseUrlDigest = createHash('sha256')
    .update(databaseUrl)
    .digest('hex');
  if (
    !timingSafeEqual(
      Buffer.from(actualDatabaseUrlDigest, 'ascii'),
      Buffer.from(expectedDatabaseUrlDigest, 'ascii'),
    )
  ) {
    throw new Error(
      'DATABASE_URL does not match the approved staging database identity',
    );
  }

  assertSyntheticStagingFixtures();
}
