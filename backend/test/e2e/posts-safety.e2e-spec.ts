import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { registerUser, createPost, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Posts Safety E2E', () => {
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

  describe('Caption safety scanning', () => {
    it('publishes a clean post immediately', async () => {
      const user = await registerUser(app);
      const post = await createPost(app, user.access_token, 'My first clean post — just sharing a nice photo!');

      expect(post.status).toBe('PUBLISHED');
      expect(post.underReview).toBe(false);
    });

    it('holds a scam-caption post for review', async () => {
      const user = await registerUser(app);
      const post = await createPost(app, user.access_token, 'Send 0.5 BTC now to claim your guaranteed 10x returns prize');

      expect(post.status).toBe('UNDER_REVIEW');
      expect(post.underReview).toBe(true);
    });

    it('persists a safety flag for scam-caption post', async () => {
      const user = await registerUser(app);
      const post = await createPost(app, user.access_token, 'Double your bitcoin — click here to unlock your crypto giveaway');

      // Allow async flag persistence
      await new Promise((r) => setTimeout(r, 100));

      const flags = await prisma.safetyFlag.findMany({ where: { entityId: post.id, entityType: 'post' } });
      expect(flags.length).toBeGreaterThan(0);
    });

    it('requires authentication to create a post', async () => {
      const tinyJpeg = Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AKgAB/9k=',
        'base64',
      );
      await request(app.getHttpServer())
        .post('/api/posts')
        .attach('media', tinyJpeg, { filename: 'test.jpg', contentType: 'image/jpeg' })
        .field('caption', 'No auth post')
        .expect(401);
    });
  });

  describe('Comment safety scanning', () => {
    let postId: string;
    let authorToken: string;

    beforeAll(async () => {
      const user = await registerUser(app);
      authorToken = user.access_token;
      const post = await createPost(app, authorToken, 'Post for comment tests');
      postId = post.id;
    });

    it('allows a clean comment', async () => {
      const commenter = await registerUser(app);

      const { body, status } = await request(app.getHttpServer())
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${commenter.access_token}`)
        .send({ content: 'Great post! Really enjoyed this.' });

      expect(status).toBe(201);
      expect(body.id).toBeTruthy();
      expect(body.content).toBe('Great post! Really enjoyed this.');
    });

    it('blocks a dangerous comment with 400', async () => {
      const commenter = await registerUser(app);

      const { status } = await request(app.getHttpServer())
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${commenter.access_token}`)
        .send({ content: 'Send 0.5 BTC to claim your crypto giveaway prize — click here to unlock guaranteed 10x returns on your bitcoin investment' });

      // Comment with high riskScore (≥75) should be blocked
      expect(status).toBe(400);
    });

    it('requires authentication to comment', async () => {
      await request(app.getHttpServer())
        .post(`/api/posts/${postId}/comments`)
        .send({ content: 'Anonymous comment' })
        .expect(401);
    });
  });
});
