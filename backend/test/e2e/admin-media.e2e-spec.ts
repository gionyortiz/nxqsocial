/**
 * Sprint 6 – Admin Media Review E2E
 *
 * Endpoints under test:
 *   GET    /api/admin/media
 *   PATCH  /api/admin/media/:id/approve
 *   PATCH  /api/admin/media/:id/reject
 *   DELETE /api/admin/media/:id
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, TestAppContext } from './test-app';
import { registerUser, cleanupTestUsers, TestUser } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

async function seedFlaggedAsset(
  prisma: PrismaService,
  userId: string,
  overrides: Partial<{
    uploadStatus: string;
    moderationStatus: string;
    mimeType: string;
  }> = {},
) {
  return prisma.mediaAsset.create({
    data: {
      userId,
      s3Key: `admin-test/${Date.now()}-${Math.random().toString(36).slice(2)}`,
      bucket: 'test-bucket',
      mimeType: overrides.mimeType ?? 'image/jpeg',
      size: 50_000,
      uploadStatus: (overrides.uploadStatus ?? 'PUBLISHED') as any,
      moderationStatus: (overrides.moderationStatus ?? 'FLAGGED') as any,
      safetyResult: {
        safe: false,
        labels: [{ name: 'Nudity', confidence: 82.5 }],
        maxConfidence: 82.5,
        topCategory: 'Nudity',
        provider: 'aws-rekognition',
      },
    },
  });
}

describe('Admin Media Review E2E', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let prisma: PrismaService;
  let regularUser: TestUser;
  let adminUser: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    prisma = app.get(PrismaService);

    regularUser = await registerUser(app);
    adminUser = await registerUser(app);

    // Promote the second user to ADMIN
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { role: 'ADMIN' },
    });
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  // ── Auth / role guard ──────────────────────────────────────────────────────

  describe('Access control', () => {
    it('GET /admin/media → 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/admin/media').expect(401);
    });

    it('GET /admin/media → 403 for regular user', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/media')
        .set('Authorization', `Bearer ${regularUser.access_token}`)
        .expect(403);
    });

    it('PATCH /admin/media/:id/approve → 401 without token', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/media/nonexistent/approve')
        .expect(401);
    });

    it('PATCH /admin/media/:id/reject → 403 for regular user', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/media/nonexistent/reject')
        .set('Authorization', `Bearer ${regularUser.access_token}`)
        .expect(403);
    });
  });

  // ── List ──────────────────────────────────────────────────────────────────

  describe('GET /admin/media', () => {
    let assetId: string;

    beforeAll(async () => {
      const asset = await seedFlaggedAsset(prisma, regularUser.id);
      assetId = asset.id;
    });

    it('returns paginated flagged media with user info', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/api/admin/media')
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .query({ status: 'FLAGGED' })
        .expect(200);

      expect(body.items).toBeInstanceOf(Array);
      expect(body.nextCursor !== undefined).toBe(true);

      const found = body.items.find((i: any) => i.id === assetId);
      expect(found).toBeDefined();
      expect(found.moderationStatus).toBe('FLAGGED');
      expect(found.user).toBeDefined();
      expect(found.user.username).toBe(regularUser.username);
      expect(found.user.trustScore).toBeDefined();
      expect(found.safetyResult).toBeDefined();
      expect(found.safetyResult.safe).toBe(false);
    });

    it('filters SCANNING assets', async () => {
      const scanningAsset = await seedFlaggedAsset(prisma, regularUser.id, {
        uploadStatus: 'SCANNING',
        moderationStatus: 'PENDING',
      });

      const { body } = await request(app.getHttpServer())
        .get('/api/admin/media')
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .query({ status: 'SCANNING' })
        .expect(200);

      const found = body.items.find((i: any) => i.id === scanningAsset.id);
      expect(found).toBeDefined();
      expect(found.uploadStatus).toBe('SCANNING');

      await prisma.mediaAsset.delete({ where: { id: scanningAsset.id } });
    });

    it('filters REJECTED assets', async () => {
      const rejectedAsset = await seedFlaggedAsset(prisma, regularUser.id, {
        uploadStatus: 'REJECTED',
        moderationStatus: 'REJECTED',
      });

      const { body } = await request(app.getHttpServer())
        .get('/api/admin/media')
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .query({ status: 'REJECTED' })
        .expect(200);

      const found = body.items.find((i: any) => i.id === rejectedAsset.id);
      expect(found).toBeDefined();
      expect(found.uploadStatus).toBe('REJECTED');

      await prisma.mediaAsset.delete({ where: { id: rejectedAsset.id } });
    });

    afterAll(async () => {
      await prisma.mediaAsset.deleteMany({ where: { id: assetId } });
    });
  });

  // ── Approve ───────────────────────────────────────────────────────────────

  describe('PATCH /admin/media/:id/approve', () => {
    it('sets moderationStatus to APPROVED', async () => {
      const asset = await seedFlaggedAsset(prisma, regularUser.id);

      const { body } = await request(app.getHttpServer())
        .patch(`/api/admin/media/${asset.id}/approve`)
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .expect(200);

      expect(body.success).toBe(true);
      expect(body.moderationStatus).toBe('APPROVED');

      const updated = await prisma.mediaAsset.findUnique({ where: { id: asset.id } });
      expect(updated?.moderationStatus).toBe('APPROVED');

      await prisma.mediaAsset.delete({ where: { id: asset.id } });
    });

    it('also publishes an UNDER_REVIEW post', async () => {
      const asset = await seedFlaggedAsset(prisma, regularUser.id);
      const post = await prisma.post.create({
        data: {
          authorId: regularUser.id,
          type: 'PHOTO',
          status: 'UNDER_REVIEW',
          media: { connect: { id: asset.id } },
        },
      });

      await request(app.getHttpServer())
        .patch(`/api/admin/media/${asset.id}/approve`)
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .expect(200);

      const updatedPost = await prisma.post.findUnique({ where: { id: post.id } });
      expect(updatedPost?.status).toBe('PUBLISHED');

      await prisma.post.delete({ where: { id: post.id } });
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
    });

    it('returns 404 for unknown asset', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/media/nonexistent-id/approve')
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .expect(404);
    });
  });

  // ── Reject ────────────────────────────────────────────────────────────────

  describe('PATCH /admin/media/:id/reject', () => {
    it('sets uploadStatus and moderationStatus to REJECTED', async () => {
      const asset = await seedFlaggedAsset(prisma, regularUser.id);

      const { body } = await request(app.getHttpServer())
        .patch(`/api/admin/media/${asset.id}/reject`)
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .send({ reason: 'Contains explicit content' })
        .expect(200);

      expect(body.success).toBe(true);
      expect(body.moderationStatus).toBe('REJECTED');

      const updated = await prisma.mediaAsset.findUnique({ where: { id: asset.id } });
      expect(updated?.uploadStatus).toBe('REJECTED');
      expect(updated?.moderationStatus).toBe('REJECTED');
      expect((updated?.safetyResult as any)?.adminRejectionReason).toBe('Contains explicit content');

      await prisma.mediaAsset.delete({ where: { id: asset.id } });
    });

    it('marks linked post as REMOVED', async () => {
      const asset = await seedFlaggedAsset(prisma, regularUser.id);
      const post = await prisma.post.create({
        data: {
          authorId: regularUser.id,
          type: 'PHOTO',
          status: 'UNDER_REVIEW',
          media: { connect: { id: asset.id } },
        },
      });

      await request(app.getHttpServer())
        .patch(`/api/admin/media/${asset.id}/reject`)
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .send({ reason: 'Policy violation' })
        .expect(200);

      const updatedPost = await prisma.post.findUnique({ where: { id: post.id } });
      expect(updatedPost?.status).toBe('REMOVED');

      await prisma.post.delete({ where: { id: post.id } });
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
    });
  });

  // ── Remove ────────────────────────────────────────────────────────────────

  describe('DELETE /admin/media/:id', () => {
    it('sets moderationStatus to REMOVED and nulls the URL', async () => {
      const asset = await seedFlaggedAsset(prisma, regularUser.id);

      const { body } = await request(app.getHttpServer())
        .delete(`/api/admin/media/${asset.id}`)
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .expect(200);

      expect(body.success).toBe(true);
      expect(body.moderationStatus).toBe('REMOVED');

      const updated = await prisma.mediaAsset.findUnique({ where: { id: asset.id } });
      expect(updated?.moderationStatus).toBe('REMOVED');
      expect(updated?.url).toBeNull();

      await prisma.mediaAsset.delete({ where: { id: asset.id } });
    });

    it('returns 404 for unknown asset', async () => {
      await request(app.getHttpServer())
        .delete('/api/admin/media/nonexistent-id')
        .set('Authorization', `Bearer ${adminUser.access_token}`)
        .expect(404);
    });
  });
});
