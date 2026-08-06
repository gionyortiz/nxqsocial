import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import { createTestApp } from './test-app';
import { registerUser, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

const TEST_WEBHOOK_SECRET = 'whsec_e2e_test_secret_nexasocial';

describe('Stripe Checkout Webhook E2E', () => {
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

  function signedEvent(sessionId: string) {
    const eventPayload = JSON.stringify({
      id: `evt_test_${Date.now()}`,
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, payment_status: 'paid' } },
    });
    const sig = stripe.webhooks.generateTestHeaderString({ payload: eventPayload, secret: TEST_WEBHOOK_SECRET });
    return { eventPayload, sig };
  }

  it('checkout.session.completed marks the matching Payment PAID', async () => {
    const user = await registerUser(app);
    const sessionId = `cs_test_${Date.now()}`;

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        purpose: 'ID_VERIFICATION',
        stripeSessionId: sessionId,
        status: 'PENDING',
        amountCents: 499,
        currency: 'usd',
      },
    });

    const { eventPayload, sig } = signedEvent(sessionId);

    await request(app.getHttpServer())
      .post('/api/verification/stripe/webhook')
      .set('stripe-signature', sig)
      .set('Content-Type', 'application/json')
      .send(eventPayload)
      .expect(201);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe('PAID');
    expect(updated.paidAt).not.toBeNull();
  });

  it('replaying the same event is idempotent (does not error, does not re-timestamp)', async () => {
    const user = await registerUser(app);
    const sessionId = `cs_test_replay_${Date.now()}`;

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        purpose: 'ID_VERIFICATION',
        stripeSessionId: sessionId,
        status: 'PENDING',
        amountCents: 499,
        currency: 'usd',
      },
    });

    const { eventPayload, sig } = signedEvent(sessionId);

    await request(app.getHttpServer())
      .post('/api/verification/stripe/webhook')
      .set('stripe-signature', sig)
      .set('Content-Type', 'application/json')
      .send(eventPayload)
      .expect(201);

    const afterFirst = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(afterFirst.status).toBe('PAID');

    // Replay the exact same signed event (Stripe's at-least-once delivery guarantee).
    await request(app.getHttpServer())
      .post('/api/verification/stripe/webhook')
      .set('stripe-signature', sig)
      .set('Content-Type', 'application/json')
      .send(eventPayload)
      .expect(201);

    const afterSecond = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(afterSecond.status).toBe('PAID');
    expect(afterSecond.paidAt?.getTime()).toBe(afterFirst.paidAt?.getTime());
  });

  it('ignores checkout events for an unknown session id', async () => {
    const { eventPayload, sig } = signedEvent(`cs_test_unknown_${Date.now()}`);

    const { status } = await request(app.getHttpServer())
      .post('/api/verification/stripe/webhook')
      .set('stripe-signature', sig)
      .set('Content-Type', 'application/json')
      .send(eventPayload);

    expect([200, 201]).toContain(status);
  });
});
