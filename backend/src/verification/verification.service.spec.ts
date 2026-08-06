import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VerificationService } from './verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrustEngineService } from '../trust-engine/trust-engine.service';
import { AuditService } from '../audit/audit.service';

const mockCheckoutSessionsCreate = jest.fn();
const mockCheckoutSessionsRetrieve = jest.fn();
const mockIdentitySessionsCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCheckoutSessionsCreate, retrieve: mockCheckoutSessionsRetrieve } },
    identity: { verificationSessions: { create: mockIdentitySessionsCreate } },
    webhooks: { constructEvent: mockWebhooksConstructEvent },
  }));
});

const mockPrisma = {
  payment: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  verification: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    const values: Record<string, string> = {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
      APP_BASE_URL: 'http://localhost:3001',
      ID_VERIFICATION_PRICE_CENTS: '499',
    };
    return values[key] ?? def;
  }),
};

const mockTrustEngine = { recalculate: jest.fn() };
const mockAudit = { log: jest.fn() };

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: TrustEngineService, useValue: mockTrustEngine },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(VerificationService);

    mockPrisma.payment.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ email: 'user@example.com' });
  });

  it('no payment on file: creates a Stripe Checkout session instead of an Identity session', async () => {
    mockCheckoutSessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' });

    const result = await service.startStripeIdentityCheck('user1');

    expect(result).toEqual({ url: 'https://checkout.stripe.com/cs_1' });
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        customer_email: 'user@example.com',
        metadata: { nxqsocial_user_id: 'user1' },
      }),
    );
    expect(mockPrisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user1',
        purpose: 'ID_VERIFICATION',
        stripeSessionId: 'cs_1',
        status: 'PENDING',
        amountCents: 499,
        currency: 'usd',
      }),
    });
    expect(mockIdentitySessionsCreate).not.toHaveBeenCalled();
  });

  it('paid, unconsumed payment on file: proceeds straight to the Identity session and reuses the payment', async () => {
    mockPrisma.payment.findFirst.mockImplementation(({ where }: any) =>
      where.status === 'PAID' ? Promise.resolve({ id: 'pay_1', status: 'PAID' }) : Promise.resolve(null),
    );
    mockIdentitySessionsCreate.mockResolvedValue({ id: 'vs_1', url: 'https://identity.stripe.com/vs_1' });

    const result = await service.startStripeIdentityCheck('user1');

    expect(result).toEqual({ url: 'https://identity.stripe.com/vs_1', sessionId: 'vs_1' });
    expect(mockPrisma.verification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user1', level: 'ID_VERIFIED', providerRef: 'vs_1', paymentId: 'pay_1' }),
    });
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it('pending payment already paid on Stripe: self-heals to PAID and proceeds without creating a second session', async () => {
    mockPrisma.payment.findFirst.mockImplementation(({ where }: any) => {
      if (where.status === 'PAID') return Promise.resolve(null);
      if (where.status === 'PENDING') return Promise.resolve({ id: 'pay_2', status: 'PENDING', stripeSessionId: 'cs_2' });
      return Promise.resolve(null);
    });
    mockCheckoutSessionsRetrieve.mockResolvedValue({ payment_status: 'paid', status: 'complete' });
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.payment.findUnique.mockResolvedValue({ id: 'pay_2', status: 'PAID' });
    mockIdentitySessionsCreate.mockResolvedValue({ id: 'vs_2', url: 'https://identity.stripe.com/vs_2' });

    const result = await service.startStripeIdentityCheck('user1');

    expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledWith('cs_2');
    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay_2', status: 'PENDING' },
      data: expect.objectContaining({ status: 'PAID' }),
    });
    expect(result).toEqual({ url: 'https://identity.stripe.com/vs_2', sessionId: 'vs_2' });
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it('pending payment still open on Stripe: returns the same checkout URL instead of creating a duplicate', async () => {
    mockPrisma.payment.findFirst.mockImplementation(({ where }: any) => {
      if (where.status === 'PAID') return Promise.resolve(null);
      if (where.status === 'PENDING') return Promise.resolve({ id: 'pay_3', status: 'PENDING', stripeSessionId: 'cs_3' });
      return Promise.resolve(null);
    });
    mockCheckoutSessionsRetrieve.mockResolvedValue({ payment_status: 'unpaid', status: 'open', url: 'https://checkout.stripe.com/cs_3' });

    const result = await service.startStripeIdentityCheck('user1');

    expect(result).toEqual({ url: 'https://checkout.stripe.com/cs_3' });
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('onStripeVerified (via webhook dispatch): consumes the payment that funded the successful attempt', async () => {
    mockWebhooksConstructEvent.mockReturnValue({
      type: 'identity.verification_session.verified',
      data: { object: { id: 'vs_9', type: 'document', metadata: { nxqsocial_user_id: 'user1' } } },
    });
    mockPrisma.verification.findFirst.mockResolvedValue({ id: 'ver_1', paymentId: 'pay_9' });
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.handleStripeWebhook(Buffer.from('{}'), 'sig_test');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user1' },
      data: { verificationStatus: 'ID_VERIFIED' },
    });
    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay_9', status: 'PAID' },
      data: { status: 'CONSUMED' },
    });
    expect(mockTrustEngine.recalculate).toHaveBeenCalledWith('user1');
  });

  it('checkout.session.completed webhook: marks the matching payment PAID, idempotently', async () => {
    mockWebhooksConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_9' } },
    });
    mockPrisma.payment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await service.handleStripeWebhook(Buffer.from('{}'), 'sig_test');
    await service.handleStripeWebhook(Buffer.from('{}'), 'sig_test');

    expect(mockPrisma.payment.updateMany).toHaveBeenNthCalledWith(1, {
      where: { stripeSessionId: 'cs_9', status: 'PENDING' },
      data: expect.objectContaining({ status: 'PAID' }),
    });
    expect(mockPrisma.payment.updateMany).toHaveBeenCalledTimes(2);
  });
});
