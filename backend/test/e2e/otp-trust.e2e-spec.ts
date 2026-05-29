import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { registerUser, getOtpCode, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';
import request from 'supertest';

describe('OTP Verification + Trust Score E2E', () => {
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

  it('email OTP verification sets emailVerified=true and increases trustScore by 10', async () => {
    const user = await registerUser(app);
    const initialScore = user.trustScore; // 10

    // 1. Request email OTP
    await request(app.getHttpServer())
      .post('/api/otp/send-email')
      .set('Authorization', `Bearer ${user.access_token}`)
      .expect(200);

    // 2. Read code from DB
    const code = await getOtpCode(prisma, user.id, 'email');

    // 3. Verify OTP
    const { body } = await request(app.getHttpServer())
      .post('/api/otp/verify')
      .set('Authorization', `Bearer ${user.access_token}`)
      .send({ channel: 'email', code })
      .expect(200);

    expect(body.verified).toBe(true);
    expect(body.channel).toBe('email');

    // 4. Confirm DB state
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.emailVerified).toBe(true);
    expect(updated.trustScore).toBe(initialScore + 10);
  });

  it('returns 400 when trying to verify email OTP twice', async () => {
    const user = await registerUser(app);

    await request(app.getHttpServer())
      .post('/api/otp/send-email')
      .set('Authorization', `Bearer ${user.access_token}`)
      .expect(200);

    const code = await getOtpCode(prisma, user.id, 'email');

    // First verify — should succeed
    await request(app.getHttpServer())
      .post('/api/otp/verify')
      .set('Authorization', `Bearer ${user.access_token}`)
      .send({ channel: 'email', code })
      .expect(200);

    // Second send-email — already verified
    await request(app.getHttpServer())
      .post('/api/otp/send-email')
      .set('Authorization', `Bearer ${user.access_token}`)
      .expect(400);
  });

  it('returns 400 for wrong OTP code', async () => {
    const user = await registerUser(app);

    await request(app.getHttpServer())
      .post('/api/otp/send-email')
      .set('Authorization', `Bearer ${user.access_token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/otp/verify')
      .set('Authorization', `Bearer ${user.access_token}`)
      .send({ channel: 'email', code: '000000' })
      .expect(400);
  });

  it('phone OTP verification sets phoneVerified=true and increases trustScore by 5', async () => {
    const id = `${Date.now().toString(36)}`; // short base-36 suffix keeps username ≤30 chars
    // Create user with phone number
    const { body: reg } = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `otp_phone_${id}@nexasocial.test`,
        username: `otpphone_${id}`,
        password: 'P@ssw0rd_Test!',
        displayName: 'Phone OTP User',
      })
      .expect(201);

    const userId = reg.user.id;
    const token = reg.access_token;
    const initialScore = reg.user.trustScore;

    // Set phone number directly in DB (UI flow would set this via profile update)
    await prisma.user.update({
      where: { id: userId },
      data: { phone: '+15550000001' },
    });

    // 1. Request phone OTP
    await request(app.getHttpServer())
      .post('/api/otp/send-phone')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // 2. Read code from DB
    const code = await getOtpCode(prisma, userId, 'phone');

    // 3. Verify OTP
    const { body } = await request(app.getHttpServer())
      .post('/api/otp/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'phone', code })
      .expect(200);

    expect(body.verified).toBe(true);
    expect(body.channel).toBe('phone');

    // 4. Confirm DB state
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(updated.phoneVerified).toBe(true);
    expect(updated.trustScore).toBe(initialScore + 5);
  });

  it('OTP endpoints require authentication', async () => {
    await request(app.getHttpServer()).post('/api/otp/send-email').expect(401);
    await request(app.getHttpServer()).post('/api/otp/send-phone').expect(401);
    await request(app.getHttpServer()).post('/api/otp/verify').expect(401);
  });
});
