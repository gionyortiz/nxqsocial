import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import { createTestApp } from './test-app';
import { registerUser, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

const TEST_WEBHOOK_SECRET = 'whsec_e2e_test_secret_nexasocial';

describe('Stripe Webhook E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stripe: Stripe;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = app.get(PrismaService);
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', { apiVersion: '2025-04-30.basil' });
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  it('verified webhook promotes user to ID_VERIFIED and recalculates trust score', async () => {
    const user = await registerUser(app);
    const scoreBefore = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).trustScore;

    // Create a pending Verification record so the webhook handler can find it
    const sessionId = `vs_test_${Date.now()}`;
    await prisma.verification.create({
      data: {
        userId: user.id,
        level: 'ID_VERIFIED',
        provider: 'STRIPE_IDENTITY',
        providerRef: sessionId,
        status: 'PENDING',
      },
    });

    // Build a fake Stripe verified event
    const eventPayload = JSON.stringify({
      id: `evt_test_${Date.now()}`,
      type: 'identity.verification_session.verified',
      data: {
        object: {
          id: sessionId,
          type: 'document',
          metadata: { nxqsocial_user_id: user.id },
          status: 'verified',
          last_verification_report: null,
        },
      },
    });

    // Sign the payload with our test secret
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: eventPayload,
      secret: TEST_WEBHOOK_SECRET,
    });

    await request(app.getHttpServer())
      .post('/api/verification/stripe/webhook')
      .set('stripe-signature', sig)
      .set('Content-Type', 'application/json')
      .send(eventPayload)
      .expect(201);

    // Verify user was promoted
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.verificationStatus).toBe('ID_VERIFIED');

    // Trust score should have increased (ID_VERIFIED adds bonus)
    expect(updated.trustScore).toBeGreaterThan(scoreBefore);
  });

  it('rejects webhook with invalid signature', async () => {
    const user = await registerUser(app);
    const sessionId = `vs_test_bad_${Date.now()}`;

    const eventPayload = JSON.stringify({
      id: 'evt_bad',
      type: 'identity.verification_session.verified',
      data: { object: { id: sessionId, type: 'document', metadata: { nxqsocial_user_id: user.id } } },
    });

    await request(app.getHttpServer())
      .post('/api/verification/stripe/webhook')
      .set('stripe-signature', 'bad_signature')
      .set('Content-Type', 'application/json')
      .send(eventPayload)
      .expect(400);
  });

  it('ignores webhook for unknown verification session', async () => {
    const unknownSessionId = `vs_test_unknown_${Date.now()}`;

    const eventPayload = JSON.stringify({
      id: `evt_test_${Date.now()}`,
      type: 'identity.verification_session.verified',
      data: {
        object: {
          id: unknownSessionId,
          type: 'document',
          metadata: { nxqsocial_user_id: 'nonexistent-user-id' },
          status: 'verified',
        },
      },
    });

    const sig = stripe.webhooks.generateTestHeaderString({
      payload: eventPayload,
      secret: TEST_WEBHOOK_SECRET,
    });

    // Should succeed (200/201) but silently ignore the unknown session
    const { status } = await request(app.getHttpServer())
      .post('/api/verification/stripe/webhook')
      .set('stripe-signature', sig)
      .set('Content-Type', 'application/json')
      .send(eventPayload);

    expect([200, 201]).toContain(status);
  });
});
