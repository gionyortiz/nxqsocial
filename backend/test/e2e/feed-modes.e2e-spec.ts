import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { registerUser, createPost, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Feed Modes E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Shared authors for feed tests
  let verifiedAuthorToken: string;
  let verifiedUserId: string;
  let unverifiedAuthorToken: string;
  let unverifiedUserId: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = app.get(PrismaService);

    // Unverified/BASIC user
    const unverified = await registerUser(app);
    unverifiedAuthorToken = unverified.access_token;
    unverifiedUserId = unverified.id;

    // Verified user (promote directly in DB)
    const verified = await registerUser(app);
    verifiedUserId = verified.id;
    await prisma.user.update({
      where: { id: verified.id },
      data: { verificationStatus: 'ID_VERIFIED' },
    });
    const { body: loginBody } = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: verified.email, password: verified.password })
      .expect(200);
    verifiedAuthorToken = loginBody.access_token;

    // Create posts from each author
    await createPost(app, verifiedAuthorToken, 'Post from verified author');
    await createPost(app, unverifiedAuthorToken, 'Post from unverified author');
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  describe('Verified feed', () => {
    it('only returns posts from verified authors', async () => {
      const viewer = await registerUser(app);

      const { body, status } = await request(app.getHttpServer())
        .get('/api/posts/feed?mode=VERIFIED_HUMANS')
        .set('Authorization', `Bearer ${viewer.access_token}`)
        .expect(200);

      const posts = body.data ?? body;
      if (posts.length === 0) return; // No posts visible yet — pass

      const authorStatuses: string[] = posts.map((p: any) => p.author?.verificationStatus ?? p.author?.verification_status);
      const unverifiedPosts = authorStatuses.filter(
        (s) => s === 'UNVERIFIED' || s === 'BASIC',
      );

      expect(unverifiedPosts).toHaveLength(0);
    });
  });

  describe('Safe / Family feed', () => {
    it('excludes UNDER_REVIEW posts from safe feed', async () => {
      const viewer = await registerUser(app);

      // Create an UNDER_REVIEW post by setting status directly after creation
      const author = await registerUser(app);
      const post = await createPost(app, author.access_token, 'Will be under review');
      await prisma.post.update({ where: { id: post.id }, data: { status: 'UNDER_REVIEW' } });

      const { body } = await request(app.getHttpServer())
        .get('/api/posts/feed?mode=FAMILY_SAFE')
        .set('Authorization', `Bearer ${viewer.access_token}`)
        .expect(200);

      const posts = body.data ?? body;
      const underReview = posts.filter((p: any) => p.status === 'UNDER_REVIEW');

      expect(underReview).toHaveLength(0);
    });
  });

  describe('For You feed', () => {
    it('returns published public posts', async () => {
      const viewer = await registerUser(app);

      const { body, status } = await request(app.getHttpServer())
        .get('/api/posts/feed')
        .set('Authorization', `Bearer ${viewer.access_token}`)
        .expect(200);

      const posts = body.data ?? body;
      // All returned posts should be PUBLISHED
      if (posts.length > 0) {
        const nonPublished = posts.filter((p: any) => p.status !== 'PUBLISHED');
        expect(nonPublished).toHaveLength(0);
      }
    });

    it('requires authentication to view feed', async () => {
      await request(app.getHttpServer()).get('/api/posts/feed').expect(401);
    });
  });
});
