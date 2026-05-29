/**
 * Prisma seed script — run once per environment to bootstrap the admin account.
 *
 * Usage:
 *   npx prisma db seed
 *
 * Or with custom credentials via env:
 *   ADMIN_EMAIL=you@example.com ADMIN_USERNAME=myadmin ADMIN_PASSWORD=Secret123! npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@nxqsocial.com';
  const username = process.env.ADMIN_USERNAME ?? 'nexaadmin';
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';

  if (password === 'ChangeMe123!') {
    console.warn('\n⚠️  WARNING: Using default admin password. Set ADMIN_PASSWORD env var before seeding production!\n');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN' },
    create: {
      email,
      username,
      passwordHash,
      role: 'ADMIN',
      verificationStatus: 'ID_VERIFIED',
      trustScore: 100,
      emailVerified: true,
      profile: { create: { displayName: 'NXQ Social Admin' } },
    },
  });

  console.log(`✅ Admin account ready: ${admin.email} (id: ${admin.id})`);

  if (process.env.SEED_DEMO === 'true') {
    await seedDemoContent();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo content — run with: SEED_DEMO=true npx prisma db seed
// Creates sample verified users with avatars + image posts so the feed looks
// alive. Idempotent: safe to re-run (upserts by email).
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_USERS = [
  { username: 'maya_rivera',   displayName: 'Maya Rivera',     bio: 'Photographer · chasing golden hour 🌅',        avatar: 1,  status: 'ID_VERIFIED',       trust: 96 },
  { username: 'leo_chen',      displayName: 'Leo Chen',        bio: 'Building things at NXQ ⚡ | coffee addict',     avatar: 12, status: 'HUMAN_VERIFIED',    trust: 88 },
  { username: 'aisha.k',       displayName: 'Aisha Khan',      bio: 'Travel ✈️ | food 🍜 | real moments only',      avatar: 5,  status: 'HUMAN_VERIFIED',    trust: 91 },
  { username: 'noah_design',   displayName: 'Noah Bennett',    bio: 'Designer. Minimalist. Dog dad 🐕',              avatar: 8,  status: 'ID_VERIFIED',       trust: 94 },
  { username: 'sofia_makes',   displayName: 'Sofia Martins',   bio: 'Maker & ceramicist 🏺 | studio life',           avatar: 9,  status: 'HUMAN_VERIFIED',    trust: 85 },
  { username: 'fitwithjake',   displayName: 'Jake Thompson',   bio: 'Coach · move every day 💪 | family-safe content', avatar: 3, status: 'BUSINESS_VERIFIED', trust: 90 },
  { username: 'green_thumb',   displayName: 'Priya Nair',      bio: 'Plants 🌿 | slow living | no filters',           avatar: 10, status: 'HUMAN_VERIFIED',    trust: 87 },
  { username: 'mateo.eats',    displayName: 'Mateo García',    bio: 'Home cook sharing real recipes 🍳',              avatar: 13, status: 'HUMAN_VERIFIED',    trust: 83 },
];

const DEMO_CAPTIONS = [
  'Golden hour never disappoints. Real photo, no edits. ✨',
  'Slow mornings and good coffee ☕ What are you working on today?',
  'Found this little spot on my trip — the food was unreal 🍜',
  'Less is more. Spent the weekend simplifying everything.',
  'New batch out of the kiln today 🏺 so happy with these glazes.',
  'No shortcuts. Consistency beats intensity every time 💪',
  'Repotted the whole shelf this weekend 🌿 swipe for the before.',
  'Sunday dinner with the family. Recipe in comments soon 🍳',
  'Reminder: the best moments are the unposed ones.',
  'Verified human, verified vibes. Glad to be part of NXQ ⚡',
];

async function seedDemoContent() {
  console.log('🌱 Seeding demo content...');
  const passwordHash = await bcrypt.hash('DemoPass123!', 12);
  let postCount = 0;

  for (const [i, u] of DEMO_USERS.entries()) {
    const user = await prisma.user.upsert({
      where: { email: `${u.username}@demo.nxqsocial.com` },
      update: {},
      create: {
        email: `${u.username}@demo.nxqsocial.com`,
        username: u.username,
        passwordHash,
        role: 'USER',
        verificationStatus: u.status as any,
        trustScore: u.trust,
        emailVerified: true,
        profile: {
          create: {
            displayName: u.displayName,
            bio: u.bio,
            avatarUrl: `https://i.pravatar.cc/200?img=${u.avatar}`,
          },
        },
      },
    });

    // 2 image posts each
    for (let p = 0; p < 2; p++) {
      const seed = `${u.username}-${p}`;
      const caption = DEMO_CAPTIONS[(i * 2 + p) % DEMO_CAPTIONS.length];
      // skip if this demo user already has posts (idempotency)
      const existing = await prisma.post.count({ where: { authorId: user.id } });
      if (existing >= 2) break;

      await prisma.post.create({
        data: {
          authorId: user.id,
          caption,
          type: 'PHOTO',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          aiLabel: 'NONE',
          media: {
            create: {
              userId: user.id,
              s3Key: `demo/${seed}.jpg`,
              bucket: 'demo',
              url: `https://picsum.photos/seed/${seed}/900/900`,
              mimeType: 'image/jpeg',
              size: 0,
              width: 900,
              height: 900,
              uploadStatus: 'PUBLISHED',
              moderationStatus: 'APPROVED',
              order: 0,
            },
          },
        },
      });
      postCount++;
    }
  }
  console.log(`✅ Demo content ready: ${DEMO_USERS.length} users, ${postCount} posts`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
