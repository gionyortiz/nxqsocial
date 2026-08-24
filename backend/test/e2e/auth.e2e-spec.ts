import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { uid, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Auth E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationsMock: any;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = app.get(PrismaService);
    notificationsMock = ctx.notificationsMock;
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

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(201);
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

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(201);
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

  describe('POST /api/auth/register — open registration compatibility', () => {
    const ORIGINAL = process.env.BETA_INVITE_CODE;
    const ORIGINAL_INVITE_CODE = process.env.INVITE_CODE;
    const ORIGINAL_REQUIRE = process.env.REQUIRE_INVITE_CODE;

    const validBody = () => {
      const id = uid();
      return {
        email: `open_${id}@nexasocial.test`,
        username: `open_${id}`,
        password: 'P@ssw0rd_Test!',
        displayName: 'Open Signup',
      };
    };

    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.BETA_INVITE_CODE;
      else process.env.BETA_INVITE_CODE = ORIGINAL;

      if (ORIGINAL_INVITE_CODE === undefined) delete process.env.INVITE_CODE;
      else process.env.INVITE_CODE = ORIGINAL_INVITE_CODE;

      if (ORIGINAL_REQUIRE === undefined)
        delete process.env.REQUIRE_INVITE_CODE;
      else process.env.REQUIRE_INVITE_CODE = ORIGINAL_REQUIRE;
    });

    it('stays open even when legacy invite-gating variables remain configured', async () => {
      process.env.REQUIRE_INVITE_CODE = 'true';
      process.env.INVITE_CODE = 'legacy-secret';
      process.env.BETA_INVITE_CODE = 'legacy-alias';

      const { body } = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validBody())
        .expect(201);

      const event = await prisma.analyticsEvent.findFirst({
        where: { userId: body.user.id, name: 'signup_completed' },
      });
      expect(event?.properties).toMatchObject({
        source: 'open_registration',
        requireInvite: false,
      });
    });

    it('ignores a legacy inviteCode sent by an older client', async () => {
      process.env.REQUIRE_INVITE_CODE = 'true';
      process.env.INVITE_CODE = 'legacy-secret';

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validBody(), inviteCode: 'obsolete-wrong-code' })
        .expect(201);
    });

    it('accepts agreeToTerms=true from the current web client', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validBody(), agreeToTerms: true })
        .expect(201);
    });

    it('normalizes uppercase usernames and rejects unsafe username syntax', async () => {
      const id = uid();
      const normalized = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          ...validBody(),
          email: `normalized_${id}@nexasocial.test`,
          username: `Mixed.User_${id}`,
        })
        .expect(201);
      expect(normalized.body.user.username).toBe(`mixed.user_${id}`);

      const invalid = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validBody(), username: 'unsafe/name' })
        .expect(400);
      expect(JSON.stringify(invalid.body.message)).toMatch(/username/i);
    });

    it('accepts omitted agreeToTerms for older clients that enforce it locally', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validBody())
        .expect(201);
    });

    it.each([
      ['false', false],
      ['a string', 'true'],
      ['a number', 1],
      ['null', null],
    ])('rejects agreeToTerms when it is %s', async (_label, agreeToTerms) => {
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validBody(), agreeToTerms })
        .expect(400);

      expect(JSON.stringify(body.message)).toMatch(/agreeToTerms/i);
    });

    it('still rejects unrelated properties under the strict DTO whitelist', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validBody(), unexpectedField: 'not-allowed' })
        .expect(400);

      expect(body.message).toContain(
        'property unexpectedField should not exist',
      );
    });
  });

  describe('hardened signup and mandatory email ownership', () => {
    const ORIGINAL_HARDENING = process.env.SIGNUP_HARDENING_ENABLED;
    const ORIGINAL_BYPASS = process.env.TURNSTILE_TEST_BYPASS;
    const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;
    const ORIGINAL_PEPPER = process.env.OTP_PEPPER;

    const validBody = () => {
      const id = uid();
      return {
        email: `hardened_${id}@nexasocial.test`,
        username: `hard_${id}`,
        password: 'P@ssw0rd_Test!',
        displayName: 'Hardened Signup',
        agreeToTerms: true,
      };
    };

    beforeEach(() => {
      process.env.SIGNUP_HARDENING_ENABLED = 'true';
      process.env.TURNSTILE_TEST_BYPASS = 'true';
      process.env.OTP_PEPPER = 'test-only-otp-pepper-with-sufficient-entropy';
      notificationsMock.sendEmailOtp.mockClear();
    });

    afterEach(() => {
      if (ORIGINAL_HARDENING === undefined)
        delete process.env.SIGNUP_HARDENING_ENABLED;
      else process.env.SIGNUP_HARDENING_ENABLED = ORIGINAL_HARDENING;
      if (ORIGINAL_BYPASS === undefined)
        delete process.env.TURNSTILE_TEST_BYPASS;
      else process.env.TURNSTILE_TEST_BYPASS = ORIGINAL_BYPASS;
      if (ORIGINAL_SECRET === undefined)
        delete process.env.TURNSTILE_SECRET_KEY;
      else process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET;
      if (ORIGINAL_PEPPER === undefined) delete process.env.OTP_PEPPER;
      else process.env.OTP_PEPPER = ORIGINAL_PEPPER;
    });

    it('requires affirmative terms consent before hardened registration', async () => {
      const { agreeToTerms: _consent, ...withoutConsent } = validBody();
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(withoutConsent)
        .expect(400);

      expect(response.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');
    });

    it('issues only a pending token, stores an HMAC OTP, and activates after verification', async () => {
      const registration = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validBody())
        .expect(201);

      expect(registration.body.status).toBe('EMAIL_VERIFICATION_REQUIRED');
      expect(registration.body.requiresEmailVerification).toBe(true);
      expect(registration.body.verification_token).toBeTruthy();
      expect(registration.body.access_token).toBe(
        registration.body.verification_token,
      );
      expect(registration.body.verification).toMatchObject({
        required: true,
        channel: 'email',
        sent: true,
        expiresInMinutes: 10,
        resendAfterSeconds: 60,
      });

      await request(app.getHttpServer())
        .get('/api/posts/feed')
        .set('Authorization', `Bearer ${registration.body.access_token}`)
        .expect(401);

      const rawCode = notificationsMock.sendEmailOtp.mock.calls.at(-1)?.[1];
      expect(rawCode).toMatch(/^\d{6}$/);
      const stored = await prisma.otpCode.findFirst({
        where: { userId: registration.body.user.id, used: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(stored?.code).toMatch(/^hmac-sha256:[a-f0-9]{64}$/);
      expect(stored?.code).not.toBe(rawCode);

      const verified = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({
          verificationToken: registration.body.verification_token,
          code: rawCode,
        })
        .expect(200);
      expect(verified.body).toMatchObject({ verified: true, channel: 'email' });
      expect(verified.body.access_token).toBeTruthy();
      expect(verified.body.user.emailVerified).toBe(true);
      expect(verified.body.user.emailVerificationRequired).toBe(false);

      await request(app.getHttpServer())
        .get('/api/posts/feed')
        .set('Authorization', `Bearer ${verified.body.access_token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({
          verificationToken: registration.body.verification_token,
          code: rawCode,
        })
        .expect(409);
    });

    it('returns the typed pending union on login and enforces resend cooldown', async () => {
      const payload = validBody();
      const registration = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(201);

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);
      expect(login.body.status).toBe('EMAIL_VERIFICATION_REQUIRED');
      expect(login.body.verification.sent).toBe(false);

      const resend = await request(app.getHttpServer())
        .post('/api/auth/resend-verification')
        .send({ verificationToken: registration.body.verification_token })
        .expect(429);
      expect(resend.body.code).toBe('EMAIL_VERIFICATION_COOLDOWN');
      expect(resend.body.retryAfter).toBeGreaterThan(0);
      expect(resend.headers['retry-after']).toBe(
        String(resend.body.retryAfter),
      );
    });

    it('invalidates a code after five incorrect attempts with typed retry metadata', async () => {
      const registration = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validBody())
        .expect(201);

      for (let attempt = 1; attempt < 5; attempt += 1) {
        const invalid = await request(app.getHttpServer())
          .post('/api/auth/verify-email')
          .send({
            verificationToken: registration.body.verification_token,
            code: '000000',
          })
          .expect(400);
        expect(invalid.body.code).toBe('EMAIL_VERIFICATION_CODE_INVALID');
      }

      const limited = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({
          verificationToken: registration.body.verification_token,
          code: '000000',
        })
        .expect(429);
      expect(limited.body.code).toBe('EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED');
      expect(limited.body.retryAfter).toBe(60);
      expect(limited.headers['retry-after']).toBe('60');

      const otp = await prisma.otpCode.findFirst({
        where: { userId: registration.body.user.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp?.used).toBe(true);
    });

    it('does not lock out legacy users whose historical emailVerified is false', async () => {
      process.env.SIGNUP_HARDENING_ENABLED = 'false';
      const payload = validBody();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(201);

      process.env.SIGNUP_HARDENING_ENABLED = 'true';
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);
      expect(login.body.status).toBeUndefined();
      expect(login.body.access_token).toBeTruthy();
    });

    it('fails closed when hardening is enabled without a token or secret', async () => {
      delete process.env.TURNSTILE_TEST_BYPASS;
      delete process.env.TURNSTILE_SECRET_KEY;

      const required = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validBody())
        .expect(400);
      expect(required.body.code).toBe('TURNSTILE_REQUIRED');

      const unavailable = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...validBody(), turnstileToken: 'unverified-token' })
        .expect(503);
      expect(unavailable.body.code).toBe('TURNSTILE_UNAVAILABLE');
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a JWT for valid credentials', async () => {
      const id = uid();
      const email = `login_${id}@nexasocial.test`;
      const password = 'P@ssw0rd_Test!';

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          username: `loginuser_${id}`,
          password,
          displayName: 'Login User',
        })
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
        .send({
          email,
          username: `badpwuser_${id}`,
          password: 'Correct_Pass1!',
          displayName: 'Bad PW',
        })
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
