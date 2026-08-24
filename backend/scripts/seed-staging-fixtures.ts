import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  assertStagingFixtureExecution,
  SYNTHETIC_STAGING_FIXTURES,
} from '../src/release/staging-fixtures';

async function main() {
  assertStagingFixtureExecution(process.env);

  const prisma = new PrismaService();
  const passwordHash = await bcrypt.hash(
    process.env.STAGING_FIXTURE_PASSWORD!,
    12,
  );

  try {
    await prisma.$transaction(async (transaction) => {
      for (const fixture of SYNTHETIC_STAGING_FIXTURES.users) {
        const profile = {
          displayName: fixture.displayName,
          bio: fixture.bio,
          avatarUrl: null,
          bannerUrl: null,
          location: null,
          website: null,
        };
        await transaction.user.upsert({
          where: { id: fixture.id },
          create: {
            id: fixture.id,
            email: fixture.email,
            username: fixture.username,
            passwordHash,
            role: 'USER',
            verificationStatus: fixture.verificationStatus,
            trustScore: fixture.trustScore,
            emailVerified: true,
            emailVerificationRequired: false,
            emailNotifications: false,
            createdAt: new Date(fixture.createdAt),
            profile: {
              create: {
                id: fixture.profileId,
                ...profile,
              },
            },
          },
          update: {
            email: fixture.email,
            username: fixture.username,
            passwordHash,
            role: 'USER',
            verificationStatus: fixture.verificationStatus,
            trustScore: fixture.trustScore,
            emailVerified: true,
            emailVerificationRequired: false,
            emailNotifications: false,
            profile: {
              upsert: {
                create: {
                  id: fixture.profileId,
                  ...profile,
                },
                update: profile,
              },
            },
          },
        });
      }

      for (const fixture of SYNTHETIC_STAGING_FIXTURES.posts) {
        const post = {
          authorId: fixture.authorId,
          caption: fixture.caption,
          type: 'TEXT' as const,
          visibility: fixture.visibility,
          status: 'PUBLISHED' as const,
          aiLabel: 'NONE' as const,
          createdAt: new Date(fixture.createdAt),
        };
        await transaction.post.upsert({
          where: { id: fixture.id },
          create: { id: fixture.id, ...post },
          update: post,
        });
      }

      for (const fixture of SYNTHETIC_STAGING_FIXTURES.follows) {
        await transaction.follow.upsert({
          where: {
            followerId_followingId: {
              followerId: fixture.followerId,
              followingId: fixture.followingId,
            },
          },
          create: {
            id: fixture.id,
            followerId: fixture.followerId,
            followingId: fixture.followingId,
            createdAt: new Date(fixture.createdAt),
          },
          update: {},
        });
      }
    });
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    [
      'Synthetic staging fixtures ready.',
      `users=${SYNTHETIC_STAGING_FIXTURES.users.length}`,
      `posts=${SYNTHETIC_STAGING_FIXTURES.posts.length}`,
      `follows=${SYNTHETIC_STAGING_FIXTURES.follows.length}`,
      'recipients=reserved-invalid-domain',
      'external-media-urls=0',
    ].join(' '),
  );
}

main().catch(() => {
  console.error(
    'Synthetic staging fixture seed failed. No credential or recipient values were printed.',
  );
  process.exitCode = 1;
});
