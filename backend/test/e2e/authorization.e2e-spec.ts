import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { registerUser, createPost, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Authorization hardening — OWASP API Security Top 10 (2023):
 *  - A1 Broken Object Level Authorization (BOLA)
 *  - A3 Broken Object Property Level Authorization (mass assignment)
 *  - A5 Broken Function Level Authorization (admin-only routes)
 */
describe('Authorization (BOLA / mass-assignment) E2E', () => {
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

  describe('BOLA — object ownership', () => {
    it("User B cannot delete User A's post", async () => {
      const userA = await registerUser(app);
      const userB = await registerUser(app);
      const post = await createPost(app, userA.access_token, 'A clean post by user A');

      await request(app.getHttpServer())
        .delete(`/api/posts/${post.id}`)
        .set('Authorization', `Bearer ${userB.access_token}`)
        .expect(403);

      // The post must still exist after the unauthorized attempt.
      const stillThere = await prisma.post.findUnique({ where: { id: post.id } });
      expect(stillThere).toBeTruthy();
    });

    it("User A can delete their own post", async () => {
      const userA = await registerUser(app);
      const post = await createPost(app, userA.access_token, 'Another clean post');

      await request(app.getHttpServer())
        .delete(`/api/posts/${post.id}`)
        .set('Authorization', `Bearer ${userA.access_token}`)
        .expect(200);
    });
  });

  describe('Mass assignment — protected property authorization', () => {
    it('rejects attempts to set privileged fields on profile update', async () => {
      const user = await registerUser(app);

      await request(app.getHttpServer())
        .put('/api/users/me/profile')
        .set('Authorization', `Bearer ${user.access_token}`)
        .send({
          displayName: 'Legit Name',
          role: 'ADMIN',
          trustScore: 100,
          verificationStatus: 'ID_VERIFIED',
          emailVerified: true,
        })
        .expect(400);

      // Database values must be unchanged from registration defaults.
      const row = await prisma.user.findUnique({ where: { id: user.id } });
      expect(row!.role).not.toBe('ADMIN');
      expect(row!.trustScore).not.toBe(100);
      expect(row!.verificationStatus).not.toBe('ID_VERIFIED');
    });

    it('allows updating only whitelisted profile fields', async () => {
      const user = await registerUser(app);

      await request(app.getHttpServer())
        .put('/api/users/me/profile')
        .set('Authorization', `Bearer ${user.access_token}`)
        .send({ displayName: 'New Display Name', bio: 'Hello world' })
        .expect(200);
    });
  });

  describe('BFLA — admin-only routes reject normal users', () => {
    it('blocks a normal user from listing pending verifications', async () => {
      const user = await registerUser(app);
      await request(app.getHttpServer())
        .get('/api/verification/admin/pending')
        .set('Authorization', `Bearer ${user.access_token}`)
        .expect(403);
    });

    it('blocks a normal user from reviewing a verification', async () => {
      const user = await registerUser(app);
      await request(app.getHttpServer())
        .patch('/api/verification/admin/some-id/review')
        .set('Authorization', `Bearer ${user.access_token}`)
        .send({ approved: 'true' })
        .expect(403);
    });

    it('blocks a normal user from listing admin media', async () => {
      const user = await registerUser(app);
      await request(app.getHttpServer())
        .get('/api/admin/media')
        .set('Authorization', `Bearer ${user.access_token}`)
        .expect(403);
    });

    it('blocks a normal user from resolving reports', async () => {
      const user = await registerUser(app);
      await request(app.getHttpServer())
        .patch('/api/reports/admin/some-id/resolve')
        .set('Authorization', `Bearer ${user.access_token}`)
        .send({ action: 'DISMISSED' })
        .expect(403);
    });
  });
});
