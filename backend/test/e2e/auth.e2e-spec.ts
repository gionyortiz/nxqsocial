import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { uid, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Auth E2E', () => {
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

  describe('POST /api/auth/register', () => {
    it('creates a user with BASIC verificationStatus and trustScore 10', async () => {
      const id = uid();
      const { body, status } = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `auth_${id}@nexasocial.test`,
          username: `authuser_${id}`,
          password: 'P@ssw0rd_Test!',
          displayName: 'Auth Test User',
        });

      expect(status).toBe(201);
      expect(body.access_token).toBeTruthy();
      expect(body.user.verificationStatus).toBe('BASIC');
      expect(body.user.trustScore).toBe(10);
      expect(body.user.email).toBe(`auth_${id}@nexasocial.test`);
      expect(body.user.username).toBe(`authuser_${id}`);
      // Password hash must never be exposed
      expect(body.user.passwordHash).toBeUndefined();
    });

    it('returns 409 when email is already taken', async () => {
      const id = uid();
      const payload = {
        email: `dup_${id}@nexasocial.test`,
        username: `dupuser_${id}`,
        password: 'P@ssw0rd_Test!',
        displayName: 'Dup User',
      };

      await request(app.getHttpServer()).post('/api/auth/register').send(payload).expect(201);
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...payload, username: `other_${id}` })
        .expect(409);
    });

    it('returns 409 when username is already taken', async () => {
      const id = uid();
      const payload = {
        email: `dup2_${id}@nexasocial.test`,
        username: `dupuname_${id}`,
        password: 'P@ssw0rd_Test!',
        displayName: 'Dup User',
      };

      await request(app.getHttpServer()).post('/api/auth/register').send(payload).expect(201);
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...payload, email: `dup2b_${id}@nexasocial.test` })
        .expect(409);
    });

    it('returns 400 for invalid input (missing password)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'bad@nexasocial.test', username: 'baduser' })
        .expect(400);
    });
  });

  describe('POST /api/auth/register — beta invite code gating', () => {
    const ORIGINAL = process.env.BETA_INVITE_CODE;
    const ORIGINAL_REQUIRE = process.env.REQUIRE_INVITE_CODE;

    afterEach(() => {
      // Restore env so other tests are unaffected
      if (ORIGINAL === undefined) delete process.env.BETA_INVITE_CODE;
      else process.env.BETA_INVITE_CODE = ORIGINAL;

      if (ORIGINAL_REQUIRE === undefined) delete process.env.REQUIRE_INVITE_CODE;
      else process.env.REQUIRE_INVITE_CODE = ORIGINAL_REQUIRE;
    });

    it('allows registration when no invite code is configured', async () => {
      delete process.env.BETA_INVITE_CODE;
      delete process.env.REQUIRE_INVITE_CODE;
      const id = uid();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `nobeta_${id}@nexasocial.test`,
          username: `nobeta_${id}`,
          password: 'P@ssw0rd_Test!',
          displayName: 'No Beta',
        })
        .expect(201);
    });

    it('blocks registration with 403 when wrong invite code is sent', async () => {
      process.env.BETA_INVITE_CODE = 'correct-code';
      process.env.REQUIRE_INVITE_CODE = 'true';
      const id = uid();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `wrong_${id}@nexasocial.test`,
          username: `wrong_${id}`,
          password: 'P@ssw0rd_Test!',
          displayName: 'Wrong Code',
          inviteCode: 'bad-code',
        })
        .expect(403);
    });

    it('blocks registration with 403 when invite code is required but omitted', async () => {
      process.env.BETA_INVITE_CODE = 'correct-code';
      process.env.REQUIRE_INVITE_CODE = 'true';
      const id = uid();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `omitted_${id}@nexasocial.test`,
          username: `omitted_${id}`,
          password: 'P@ssw0rd_Test!',
          displayName: 'Omitted Code',
        })
        .expect(403);
    });

    it('allows registration with the correct invite code', async () => {
      process.env.BETA_INVITE_CODE = 'correct-code';
      process.env.REQUIRE_INVITE_CODE = 'true';
      const id = uid();
      const { status } = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `beta_${id}@nexasocial.test`,
          username: `beta_${id}`,
          password: 'P@ssw0rd_Test!',
          displayName: 'Beta User',
          inviteCode: 'correct-code',
        });
      expect(status).toBe(201);
    });

    it('allows open registration when REQUIRE_INVITE_CODE=false', async () => {
      process.env.BETA_INVITE_CODE = 'correct-code';
      process.env.REQUIRE_INVITE_CODE = 'false';
      const id = uid();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `open_${id}@nexasocial.test`,
          username: `open_${id}`,
          password: 'P@ssw0rd_Test!',
          displayName: 'Open Signup',
        })
        .expect(201);
    });

    it('blocks registration when REQUIRE_INVITE_CODE=true but invite secret missing', async () => {
      delete process.env.BETA_INVITE_CODE;
      process.env.REQUIRE_INVITE_CODE = 'true';
      const id = uid();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `misconfig_${id}@nexasocial.test`,
          username: `misconfig_${id}`,
          password: 'P@ssw0rd_Test!',
          displayName: 'Misconfigured Gate',
        })
        .expect(403);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a JWT for valid credentials', async () => {
      const id = uid();
      const email = `login_${id}@nexasocial.test`;
      const password = 'P@ssw0rd_Test!';

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, username: `loginuser_${id}`, password, displayName: 'Login User' })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);

      expect(body.access_token).toBeTruthy();
      expect(body.user.email).toBe(email);
    });

    it('returns 401 for wrong password', async () => {
      const id = uid();
      const email = `badpw_${id}@nexasocial.test`;

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, username: `badpwuser_${id}`, password: 'Correct_Pass!', displayName: 'Bad PW' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'WrongPassword!' })
        .expect(401);
    });

    it('returns 401 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@nexasocial.test', password: 'Whatever123!' })
        .expect(401);
    });
  });
});
