import request from 'supertest';
import bcrypt from 'bcryptjs';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { registerUser, cleanupTestUsers, uid } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Auth Security E2E', () => {
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

  const validBody = () => {
    const id = uid();
    return {
      email: `sec_${id}@nexasocial.test`,
      username: `sec_${id}`,
      displayName: 'Security Test',
      password: 'P@ssw0rd_Test!',
    };
  };

  describe('Registration validation', () => {
    it('rejects a weak password', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validBody(), password: 'weak' })
        .expect(400);
      expect(JSON.stringify(body.message)).toMatch(/12 characters/i);
    });

    it('rejects a password missing a special character', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validBody(), password: 'Password1234' })
        .expect(400);
    });

    it('rejects an invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validBody(), email: 'not-an-email' })
        .expect(400);
    });

    it('accepts a strong password and valid email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validBody())
        .expect(201);
    });
  });

  describe('Password storage', () => {
    it('never stores the plaintext password and stores a verifiable hash', async () => {
      const user = await registerUser(app);
      const row = await prisma.user.findUnique({ where: { id: user.id } });
      expect(row).toBeTruthy();
      expect(row!.password).not.toBe(user.password);
      expect(row!.password.startsWith('$2')).toBe(true);
      expect(await bcrypt.compare(user.password, row!.password)).toBe(true);
      expect(await bcrypt.compare('wrong-password', row!.password)).toBe(false);
    });
  });

  describe('Login error safety', () => {
    it('returns a generic error for a missing user', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: `missing_${uid()}@nexasocial.test`, password: 'P@ssw0rd_Test!' })
        .expect(401);
      expect(body.message).toBe('Invalid credentials');
    });

    it('returns the same generic error for a wrong password', async () => {
      const user = await registerUser(app);
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Wr0ng_Password!' })
        .expect(401);
      expect(body.message).toBe('Invalid credentials');
    });

    it('logs in successfully with correct credentials', async () => {
      const user = await registerUser(app);
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      expect(body.access_token).toBeTruthy();
    });
  });

  describe('Rate limiting', () => {
    // Throttling is skipped while NODE_ENV === 'test'. Temporarily lift that so
    // we can confirm the limiter actually engages on the login route.
    const originalEnv = process.env.NODE_ENV;
    beforeAll(() => {
      process.env.NODE_ENV = 'production';
    });
    afterAll(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('triggers a 429 after exceeding the login rate limit', async () => {
      const email = `rl_${uid()}@nexasocial.test`;
      let got429 = false;
      for (let i = 0; i < 8; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email, password: 'P@ssw0rd_Test!' });
        if (res.status === 429) {
          got429 = true;
          break;
        }
      }
      expect(got429).toBe(true);
    });
  });
});
