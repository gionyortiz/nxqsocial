import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { registerUser, createPost, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Rate Limiting E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  describe('Comment rate limiting', () => {
    it('BASIC user gets rate-limited after 20 comments per hour', async () => {
      const author = await registerUser(app);
      const commenter = await registerUser(app);
      const post = await createPost(app, author.access_token, 'Rate limit test post');

      // Confirm commenter is BASIC tier
      const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: commenter.id } });
      expect(['BASIC', 'UNVERIFIED']).toContain(dbUser.verificationStatus);

      const responses: number[] = [];
      for (let i = 0; i < 22; i++) {
        const { status } = await request(app.getHttpServer())
          .post(`/api/posts/${post.id}/comments`)
          .set('Authorization', `Bearer ${commenter.access_token}`)
          .send({ content: `Comment number ${i + 1}` });
        responses.push(status);
      }

      // First 20 should be 201, last should be 429
      const created = responses.filter((s) => s === 201).length;
      const limited = responses.filter((s) => s === 429).length;

      expect(created).toBe(20);
      expect(limited).toBeGreaterThanOrEqual(1);
    });

    it('rate limit response includes retryAfter', async () => {
      const author = await registerUser(app);
      const commenter = await registerUser(app);
      const post = await createPost(app, author.access_token, 'Rate limit retryAfter test');

      // Exhaust limit
      for (let i = 0; i < 20; i++) {
        await request(app.getHttpServer())
          .post(`/api/posts/${post.id}/comments`)
          .set('Authorization', `Bearer ${commenter.access_token}`)
          .send({ content: `Exhaust ${i}` });
      }

      const { body } = await request(app.getHttpServer())
        .post(`/api/posts/${post.id}/comments`)
        .set('Authorization', `Bearer ${commenter.access_token}`)
        .send({ content: 'Over limit' })
        .expect(429);

      expect(body.retryAfter).toBeDefined();
      expect(body.message).toContain('Rate limit exceeded');
    });

    it('ID_VERIFIED user has higher comment limits (500/hour)', async () => {
      const author = await registerUser(app);
      const post = await createPost(app, author.access_token, 'High limit post');

      // Promote the commenter to ID_VERIFIED in DB
      const commenter = await registerUser(app);
      await prisma.user.update({
        where: { id: commenter.id },
        data: { verificationStatus: 'ID_VERIFIED' },
      });

      // Reload JWT with fresh login to pick up new verificationStatus
      const { body: loginBody } = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: commenter.email, password: commenter.password })
        .expect(200);

      // ID_VERIFIED limit is 500 — posting 21 should all succeed
      for (let i = 0; i < 21; i++) {
        const { status } = await request(app.getHttpServer())
          .post(`/api/posts/${post.id}/comments`)
          .set('Authorization', `Bearer ${loginBody.access_token}`)
          .send({ content: `VIP comment ${i}` });
        expect(status).toBe(201);
      }
    });
  });
});
