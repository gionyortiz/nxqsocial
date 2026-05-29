/**
 * Sprint 5 – Media Upload Pipeline E2E
 *
 * Endpoints under test:
 *   POST /api/media/create-upload-url
 *   POST /api/media/complete-upload
 *   GET  /api/media/:id/status
 *
 * StorageService and MediaSafetyService are mocked via createTestApp()
 * (storageEnabled=true, mediaSafetyEnabled=true/false per case).
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, TestAppContext } from './test-app';
import { registerUser, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Media Upload Pipeline E2E', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // storageEnabled=true so presignUpload / exists / publicUrl work
    ctx = await createTestApp(false, true);
    app = ctx.app;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Authentication guard
  // ──────────────────────────────────────────────────────────────────────────
  describe('Authentication', () => {
    it('POST /media/create-upload-url requires auth', async () => {
      await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .send({ mimeType: 'image/jpeg', size: 1024 })
        .expect(401);
    });

    it('POST /media/complete-upload requires auth', async () => {
      await request(app.getHttpServer())
        .post('/api/media/complete-upload')
        .send({ mediaId: 'nonexistent' })
        .expect(401);
    });

    it('GET /media/:id/status requires auth', async () => {
      await request(app.getHttpServer())
        .get('/api/media/nonexistent/status')
        .expect(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Input validation
  // ──────────────────────────────────────────────────────────────────────────
  describe('Input validation', () => {
    let token: string;

    beforeAll(async () => {
      const user = await registerUser(app);
      token = user.access_token;
    });

    it('rejects an unsupported mime type', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ mimeType: 'application/pdf', size: 1024 })
        .expect(400);

      // ValidationPipe returns message as an array
      const messages: string[] = Array.isArray(body.message) ? body.message : [body.message];
      expect(messages.some((m) => m.includes('mimeType'))).toBe(true);
    });

    it('rejects a file that exceeds the size limit', async () => {
      const tooBig = 11 * 1024 * 1024; // > 10 MB image limit
      await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ mimeType: 'image/jpeg', size: tooBig })
        .expect(400);
    });

    it('rejects missing mimeType', async () => {
      await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ size: 1024 })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Image upload flow (sync safety scan — mocked as safe)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Image upload flow', () => {
    let token: string;
    let userId: string;

    beforeAll(async () => {
      const user = await registerUser(app);
      token = user.access_token;
      userId = user.id;
    });

    it('returns a presigned upload URL and mediaId', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ mimeType: 'image/jpeg', size: 1024 })
        .expect(201);

      expect(body.uploadUrl).toMatch(/^https?:\/\//);
      expect(body.mediaId).toBeTruthy();
      expect(body.s3Key).toMatch(/uploads\/.+\.jpg$/);
      expect(body.expiresIn).toBe(600);
    });

    it('complete-upload publishes a safe image (mocked scan)', async () => {
      // The storageMock.exists returns true and presignUpload returns a URL
      const { body: urlBody } = await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ mimeType: 'image/jpeg', size: 2048 })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .post('/api/media/complete-upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaId: urlBody.mediaId })
        .expect(201);

      expect(body.uploadStatus).toBe('PUBLISHED');
      expect(body.url).toBeTruthy();
    });

    it('GET status returns the current asset status', async () => {
      const { body: urlBody } = await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ mimeType: 'image/png', size: 512 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/media/complete-upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaId: urlBody.mediaId });

      const { body } = await request(app.getHttpServer())
        .get(`/api/media/${urlBody.mediaId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(body.id).toBe(urlBody.mediaId);
      expect(['PUBLISHED', 'REJECTED']).toContain(body.uploadStatus);
      expect(body.mimeType).toBe('image/png');
      expect(body.size).toBe(512);
    });

    it('cannot call complete-upload twice', async () => {
      const { body: urlBody } = await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ mimeType: 'image/webp', size: 1024 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/media/complete-upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaId: urlBody.mediaId })
        .expect(201);

      // Second call should fail
      await request(app.getHttpServer())
        .post('/api/media/complete-upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaId: urlBody.mediaId })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Video upload flow (async scan)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Video upload flow', () => {
    let token: string;

    beforeAll(async () => {
      const user = await registerUser(app);
      token = user.access_token;
    });

    it('video create-upload-url accepts video/mp4', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ mimeType: 'video/mp4', size: 5 * 1024 * 1024 })
        .expect(201);

      expect(body.s3Key).toMatch(/uploads\/.+\.mp4$/);
    });

    it('complete-upload sets video status to SCANNING or PUBLISHED', async () => {
      const { body: urlBody } = await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ mimeType: 'video/mp4', size: 10 * 1024 * 1024 })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .post('/api/media/complete-upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaId: urlBody.mediaId })
        .expect(201);

      // startVideoScan mock returns null → falls back to PUBLISHED
      expect(['SCANNING', 'PUBLISHED']).toContain(body.uploadStatus);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Ownership enforcement
  // ──────────────────────────────────────────────────────────────────────────
  describe('Ownership enforcement', () => {
    let ownerToken: string;
    let otherToken: string;
    let mediaId: string;

    beforeAll(async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      ownerToken = owner.access_token;
      otherToken = other.access_token;

      const { body } = await request(app.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ mimeType: 'image/jpeg', size: 1024 })
        .expect(201);
      mediaId = body.mediaId;
    });

    it('another user cannot complete a foreign upload', async () => {
      await request(app.getHttpServer())
        .post('/api/media/complete-upload')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ mediaId })
        .expect(403);
    });

    it('another user cannot query status of a foreign upload', async () => {
      await request(app.getHttpServer())
        .get(`/api/media/${mediaId}/status`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('non-existent mediaId returns 404', async () => {
      await request(app.getHttpServer())
        .get('/api/media/nonexistentid123/status')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Unsafe image is rejected (safety mock returns unsafe)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Unsafe image rejection', () => {
    let safetyCtx: TestAppContext;
    let safetyApp: INestApplication;
    let token: string;
    let mediaPrisma: PrismaService;

    beforeAll(async () => {
      // Enable mediaSafety so the mock scan result matters
      safetyCtx = await createTestApp(true, true);
      safetyApp = safetyCtx.app;
      mediaPrisma = safetyApp.get(PrismaService);

      // Override mediaSafetyMock to return unsafe result for this suite
      safetyCtx.mediaSafetyMock.scanImageFromS3 = jest.fn().mockResolvedValue({
        safe: false,
        labels: [{ name: 'Explicit Nudity', confidence: 98, parentName: 'Explicit Nudity' }],
        topCategory: 'Explicit Nudity',
        maxConfidence: 98,
        provider: 'rekognition',
      });

      const user = await registerUser(safetyApp);
      token = user.access_token;
    });

    afterAll(async () => {
      await cleanupTestUsers(mediaPrisma);
      await safetyApp.close();
    });

    it('complete-upload rejects an image flagged as unsafe', async () => {
      const { body: urlBody } = await request(safetyApp.getHttpServer())
        .post('/api/media/create-upload-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ mimeType: 'image/jpeg', size: 1024 })
        .expect(201);

      const { body } = await request(safetyApp.getHttpServer())
        .post('/api/media/complete-upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaId: urlBody.mediaId })
        .expect(201);

      expect(body.uploadStatus).toBe('REJECTED');
      expect(body.url).toBeNull();
    });
  });
});
