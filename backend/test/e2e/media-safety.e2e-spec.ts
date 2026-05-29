import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, TestAppContext } from './test-app';
import { registerUser, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MediaSafetyService } from '../../src/safety/media-safety.service';

// 1×1 white JPEG
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AKgAB/9k=',
  'base64',
);

// 1-second silence MP4 stub (minimal valid structure for multer mime check)
const TINY_MP4 = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA', 'base64');

describe('Media Safety Scanning E2E', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Enable media safety mock
    ctx = await createTestApp(true /* mediaSafetyEnabled */, false /* storageEnabled */);
    app = ctx.app;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  describe('Image safety', () => {
    it('publishes a post when image scan returns safe', async () => {
      // Default mock: safe=true
      ctx.mediaSafetyMock.scanImage.mockResolvedValueOnce({
        safe: true,
        labels: [],
        maxConfidence: 0,
        provider: 'rekognition',
      });
      ctx.mediaSafetyMock.statusFromScan.mockReturnValueOnce('PUBLISHED');

      const user = await registerUser(app);
      const { body, status } = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.access_token}`)
        .attach('media', TINY_JPEG, { filename: 'safe.jpg', contentType: 'image/jpeg' })
        .field('caption', 'Clean safe post');

      expect(status).toBe(201);
      expect(body.status).toBe('PUBLISHED');

      // Confirm MediaAsset was created
      const media = await prisma.mediaAsset.findFirst({ where: { post: { id: body.id } } });
      expect(media).toBeTruthy();
      expect(media?.moderationStatus).toBe('APPROVED');
    });

    it('holds post for review when image scan returns UNDER_REVIEW', async () => {
      ctx.mediaSafetyMock.scanImage.mockResolvedValueOnce({
        safe: false,
        labels: [{ name: 'Suggestive', confidence: 72, parentName: 'Explicit Nudity' }],
        topCategory: 'Explicit Nudity',
        maxConfidence: 72,
        provider: 'rekognition',
      });
      ctx.mediaSafetyMock.statusFromScan.mockReturnValueOnce('UNDER_REVIEW');

      const user = await registerUser(app);
      const { body, status } = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.access_token}`)
        .attach('media', TINY_JPEG, { filename: 'nsfw.jpg', contentType: 'image/jpeg' })
        .field('caption', 'A post');

      expect(status).toBe(201);
      expect(body.status).toBe('UNDER_REVIEW');
      expect(body.underReview).toBe(true);
    });

    it('returns 403 and creates no post when image is hard-blocked', async () => {
      ctx.mediaSafetyMock.scanImage.mockResolvedValueOnce({
        safe: false,
        labels: [{ name: 'Explicit Nudity', confidence: 97, parentName: 'Explicit Nudity' }],
        topCategory: 'Explicit Nudity',
        maxConfidence: 97,
        provider: 'rekognition',
      });
      ctx.mediaSafetyMock.statusFromScan.mockReturnValueOnce('REJECTED');

      const user = await registerUser(app);
      const countBefore = await prisma.post.count({ where: { authorId: user.id } });

      const { status } = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.access_token}`)
        .attach('media', TINY_JPEG, { filename: 'explicit.jpg', contentType: 'image/jpeg' })
        .field('caption', 'Blocked post');

      expect(status).toBe(403);

      // No post should have been created
      const countAfter = await prisma.post.count({ where: { authorId: user.id } });
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('Video safety', () => {
    it('creates post and starts async video scan without blocking response', async () => {
      ctx.mediaSafetyMock.startVideoScan.mockResolvedValueOnce('fake-rekognition-job-id');

      const user = await registerUser(app);
      const start = Date.now();

      const { body, status } = await request(app.getHttpServer())
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.access_token}`)
        .attach('media', TINY_MP4, { filename: 'clip.mp4', contentType: 'video/mp4' })
        .field('caption', 'My video post');

      const elapsed = Date.now() - start;

      expect(status).toBe(201);
      expect(body.id).toBeTruthy();
      // Video scan is fire-and-forget; response should not block on it
      expect(elapsed).toBeLessThan(5000);
    });

    it('rejects unsupported file types', async () => {
      const user = await registerUser(app);

      await request(app.getHttpServer())
        .post('/api/posts')
        .set('Authorization', `Bearer ${user.access_token}`)
        .attach('media', Buffer.from('fake pdf'), { filename: 'doc.pdf', contentType: 'application/pdf' })
        .field('caption', 'PDF post')
        .expect(400);
    });
  });
});
