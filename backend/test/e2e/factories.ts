import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';

/** Returns a unique suffix for test isolation */
export function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface TestUser {
  id: string;
  email: string;
  username: string;
  password: string;
  access_token: string;
  trustScore: number;
  verificationStatus: string;
}

export async function registerUser(
  app: INestApplication,
  overrides: Partial<{ email: string; username: string; password: string; displayName: string }> = {},
): Promise<TestUser> {
  const id = uid();
  const email = overrides.email ?? `test_${id}@nexasocial.test`;
  const username = overrides.username ?? `testuser_${id}`;
  const password = overrides.password ?? 'P@ssw0rd_Test!';

  const { body } = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, username, password, displayName: overrides.displayName ?? 'Test User' })
    .expect(201);

  return {
    id: body.user.id,
    email,
    username,
    password,
    access_token: body.access_token,
    trustScore: body.user.trustScore,
    verificationStatus: body.user.verificationStatus,
  };
}

export async function loginUser(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const { body } = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return body.access_token;
}

/** Read the latest OTP code for a user from the test DB */
export async function getOtpCode(
  prisma: PrismaService,
  userId: string,
  channel: 'email' | 'phone',
): Promise<string> {
  const otp = await prisma.otpCode.findFirst({
    where: { userId, channel, used: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw new Error(`No active OTP found for user ${userId} channel ${channel}`);
  return otp.code;
}

/** Create a post with a small test image buffer */
export async function createPost(
  app: INestApplication,
  token: string,
  caption = 'Test post',
): Promise<any> {
  // 1×1 white JPEG
  const tinyJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AKgAB/9k=',
    'base64',
  );

  const { body } = await request(app.getHttpServer())
    .post('/api/posts')
    .set('Authorization', `Bearer ${token}`)
    .attach('media', tinyJpeg, { filename: 'test.jpg', contentType: 'image/jpeg' })
    .field('caption', caption)
    .expect(201);

  return body;
}

/** Clean up all test users created during a test suite */
export async function cleanupTestUsers(prisma: PrismaService, emailPattern = '@nexasocial.test') {
  await prisma.user.deleteMany({ where: { email: { endsWith: emailPattern } } });
}
