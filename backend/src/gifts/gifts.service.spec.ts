/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GiftsService } from './gifts.service';
import Stripe from 'stripe';

describe('GiftsService ledger controls', () => {
  const config = (enabled: boolean) => ({
    get: jest.fn((name: string, fallback?: string) => {
      const values: Record<string, string> = {
        GIFTS_ENABLED: enabled ? 'true' : 'false',
        CREATOR_GIFT_SHARE_BPS: '5000',
        GIFT_CURRENCY: 'usd',
      };
      return values[name] ?? fallback;
    }),
  });

  it('defaults the paid catalog to fail-closed', () => {
    const service = new GiftsService({} as any, config(false) as any);
    expect(service.catalog()).toMatchObject({
      enabled: false,
      cashOutEnabled: false,
    });
  });

  it('does not spend coins when paid gifts are disabled', async () => {
    const prisma = { giftTransaction: { findUnique: jest.fn() } };
    const service = new GiftsService(prisma as any, config(false) as any);

    await expect(
      service.sendGift('sender', 'live-room', {
        giftCode: 'rose',
        clientRequestId: 'request-123456',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.giftTransaction.findUnique).not.toHaveBeenCalled();
  });

  it("refuses reuse of another sender's idempotency key", async () => {
    const prisma = {
      giftTransaction: {
        findUnique: jest.fn().mockResolvedValue({ senderId: 'other-user' }),
      },
    };
    const service = new GiftsService(prisma as any, config(true) as any);

    await expect(
      service.sendGift('sender', 'live-room', {
        giftCode: 'rose',
        clientRequestId: 'request-123456',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('atomically refuses a gift when the wallet lacks coins', async () => {
    const tx = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          hostId: 'host-1',
          status: 'LIVE',
          updatedAt: new Date(),
          participants: [],
        }),
      },
      coinWallet: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      giftTransaction: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((handler) => handler(tx)),
    };
    const service = new GiftsService(prisma as any, config(true) as any);

    await expect(
      service.sendGift('sender', 'live-room', {
        giftCode: 'crown',
        clientRequestId: 'request-123456',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.coinWallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'sender', balanceCoins: { gte: 500 } },
      }),
    );
  });

  it('refuses gifts to someone who is not an active host or co-host', async () => {
    const tx = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          hostId: 'host-1',
          status: 'LIVE',
          updatedAt: new Date(),
          participants: [],
        }),
      },
    };
    const prisma = {
      giftTransaction: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((handler) => handler(tx)),
    };
    const service = new GiftsService(prisma as any, config(true) as any);

    await expect(
      service.sendGift('sender', 'live-room', {
        giftCode: 'rose',
        recipientId: 'outsider-1',
        clientRequestId: 'request-123456',
      }),
    ).rejects.toThrow('active host or co-host');
  });

  it('debits the sender and credits creator earnings in one transaction', async () => {
    const tx = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          hostId: 'host-1',
          status: 'LIVE',
          updatedAt: new Date(),
          participants: [],
        }),
      },
      coinWallet: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ balanceCoins: 90 }),
      },
      liveBattle: { findFirst: jest.fn().mockResolvedValue(null) },
      giftTransaction: {
        create: jest.fn().mockResolvedValue({
          id: 'gift-1',
          senderId: 'sender',
          recipientId: 'host-1',
          giftCode: 'rose',
          coins: 10,
        }),
      },
    };
    const prisma = {
      giftTransaction: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((handler) => handler(tx)),
    };
    const service = new GiftsService(prisma as any, config(true) as any);

    await expect(
      service.sendGift('sender', 'live-room', {
        giftCode: 'rose',
        clientRequestId: 'request-123456',
      }),
    ).resolves.toMatchObject({ transactionId: 'gift-1', balanceCoins: 90 });
    expect(tx.coinWallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'host-1' },
        create: { userId: 'host-1', creatorEarningsCoins: 5 },
      }),
    );
  });

  it('credits a paid checkout only through a valid signed webhook', async () => {
    const secret = 'whsec_dedicated_gifts_endpoint';
    const stripe = new Stripe('sk_test_12345678901234567890');
    const payload = JSON.stringify({
      id: 'evt_checkout_paid',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: 'pi_test_1',
          metadata: {
            nxq_kind: 'coin_purchase',
            nxq_purchase_id: 'purchase-1',
            nxq_user_id: 'sender',
          },
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    const tx = {
      giftWebhookEvent: { create: jest.fn().mockResolvedValue({}) },
      coinPurchase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'purchase-1',
          userId: 'sender',
          status: 'PENDING',
          coins: 100,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      coinWallet: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((handler) => handler(tx)) };
    const webhookConfig = {
      get: jest.fn(
        (name: string, fallback?: string) =>
          ({
            GIFTS_ENABLED: 'true',
            STRIPE_GIFTS_RESTRICTED_KEY: 'sk_test_12345678901234567890',
            STRIPE_GIFTS_WEBHOOK_SECRET: secret,
          })[name] ?? fallback,
      ),
    };
    const service = new GiftsService(prisma as any, webhookConfig as any);

    await expect(
      service.handleStripeWebhook(Buffer.from(payload), signature),
    ).resolves.toEqual({ received: true });
    expect(tx.coinWallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'sender' },
        create: expect.objectContaining({ balanceCoins: 100 }),
      }),
    );
  });
});
