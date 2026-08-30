import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import Stripe from 'stripe';
import type { GiftTransaction, LiveBattle, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  COIN_PACKS,
  LIVE_GIFTS,
  type CoinPackCode,
  type LiveGiftCode,
} from './gifts.catalog';
import type { SendGiftDto } from './gifts.dto';

const ACTIVE_LIVE_WINDOW_MS = 30_000;

type StripeEvent = ReturnType<
  InstanceType<typeof Stripe>['webhooks']['constructEvent']
>;
type StripeCheckoutSession = Awaited<
  ReturnType<InstanceType<typeof Stripe>['checkout']['sessions']['create']>
>;
type StripeCharge = {
  payment_intent?: string | { id: string } | null;
};

@Injectable()
export class GiftsService {
  private readonly logger = new Logger(GiftsService.name);
  private readonly stripe?: InstanceType<typeof Stripe>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key =
      this.config.get<string>('STRIPE_GIFTS_RESTRICTED_KEY', '').trim() ||
      this.config.get<string>('STRIPE_SECRET_KEY', '').trim();
    if (key) {
      this.stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
    }
  }

  catalog() {
    return {
      enabled: this.isEnabled(),
      currency: this.currency(),
      packs: Object.values(COIN_PACKS),
      gifts: Object.values(LIVE_GIFTS),
      creatorShareBps: this.creatorShareBps(),
      cashOutEnabled: false,
    };
  }

  async wallet(userId: string) {
    const wallet = await this.prisma.coinWallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return {
      balanceCoins: wallet.balanceCoins,
      creatorEarningsCoins: wallet.creatorEarningsCoins,
      cashOutEnabled: false,
    };
  }

  async createCheckout(userId: string, rawPackCode: string, room?: string) {
    this.requireEnabled();
    const stripe = this.requireStripe();
    const pack = COIN_PACKS[rawPackCode as CoinPackCode];
    if (!pack) throw new BadRequestException('Unknown coin pack.');

    const purchase = await this.prisma.coinPurchase.create({
      data: {
        userId,
        packCode: pack.code,
        coins: pack.coins,
        amountCents: pack.amountCents,
        currency: this.currency(),
      },
    });
    const appUrl = this.config
      .get<string>('APP_BASE_URL', 'http://localhost:3001')
      .replace(/\/$/, '');
    const safeRoom = room && /^[\w.@:-]{3,128}$/.test(room) ? room : undefined;
    const returnPath = safeRoom
      ? `/live/${encodeURIComponent(safeRoom)}`
      : '/feed';

    try {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          client_reference_id: userId,
          integration_identifier: `nxqgifts_${this.randomLetters(8)}`,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: this.currency(),
                unit_amount: pack.amountCents,
                product_data: {
                  name: `${pack.coins} NXQ Coins`,
                  description: 'Coins for sending live gifts on NXQ Social.',
                },
              },
            },
          ],
          metadata: {
            nxq_kind: 'coin_purchase',
            nxq_purchase_id: purchase.id,
            nxq_user_id: userId,
            nxq_pack_code: pack.code,
          },
          success_url: `${appUrl}${returnPath}?coins=purchased&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}${returnPath}?coins=canceled`,
        },
        { idempotencyKey: `nxq-coin-purchase-${purchase.id}` },
      );
      await this.prisma.coinPurchase.update({
        where: { id: purchase.id },
        data: { stripeSessionId: session.id },
      });
      return { url: session.url, purchaseId: purchase.id };
    } catch (error) {
      await this.prisma.coinPurchase.updateMany({
        where: { id: purchase.id, status: 'PENDING' },
        data: { status: 'CANCELED' },
      });
      throw error;
    }
  }

  async sendGift(userId: string, room: string, dto: SendGiftDto) {
    this.requireEnabled();
    if (!/^[\w.@:-]{3,128}$/.test(room))
      throw new BadRequestException('Invalid room.');
    const gift = LIVE_GIFTS[dto.giftCode as LiveGiftCode];
    if (!gift) throw new BadRequestException('Unknown gift.');

    const existing = await this.prisma.giftTransaction.findUnique({
      where: { clientRequestId: dto.clientRequestId },
    });
    if (existing) {
      if (existing.senderId !== userId)
        throw new ConflictException('Gift request ID already used.');
      return this.giftResult(existing, null);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const session = await tx.liveSession.findUnique({
          where: { room },
          include: {
            participants: { where: { status: 'APPROVED' } },
          },
        });
        if (
          !session ||
          session.status !== 'LIVE' ||
          session.updatedAt.getTime() < Date.now() - ACTIVE_LIVE_WINDOW_MS
        ) {
          throw new BadRequestException('This live is no longer active.');
        }

        const allowedRecipients = new Set([
          session.hostId,
          ...session.participants
            .filter((p) => p.role === 'COHOST')
            .map((p) => p.userId),
        ]);
        const recipientId = dto.recipientId ?? session.hostId;
        if (!allowedRecipients.has(recipientId)) {
          throw new BadRequestException(
            'Gifts can only be sent to an active host or co-host.',
          );
        }
        if (recipientId === userId)
          throw new BadRequestException('You cannot send a gift to yourself.');

        const debit = await tx.coinWallet.updateMany({
          where: { userId, balanceCoins: { gte: gift.coins } },
          data: {
            balanceCoins: { decrement: gift.coins },
            lifetimeSpent: { increment: gift.coins },
          },
        });
        if (debit.count !== 1)
          throw new BadRequestException('Not enough NXQ Coins.');

        const creatorEarningsCoins = Math.floor(
          (gift.coins * this.creatorShareBps()) / 10_000,
        );
        await tx.coinWallet.upsert({
          where: { userId: recipientId },
          create: { userId: recipientId, creatorEarningsCoins },
          update: { creatorEarningsCoins: { increment: creatorEarningsCoins } },
        });

        const battle = await tx.liveBattle.findFirst({
          where: {
            sessionId: session.id,
            status: 'ACTIVE',
            endsAt: { gt: new Date() },
          },
          orderBy: { startedAt: 'desc' },
        });
        let battleId: string | undefined;
        if (battle) {
          const sideRecipient =
            dto.battleSide === 1 ? battle.opponentId : battle.hostId;
          if (recipientId !== sideRecipient) {
            throw new BadRequestException(
              'The selected battle side does not match the gift recipient.',
            );
          }
          battleId = battle.id;
          await tx.liveBattle.update({
            where: { id: battle.id },
            data:
              dto.battleSide === 1
                ? { opponentScoreCoins: { increment: gift.coins } }
                : { hostScoreCoins: { increment: gift.coins } },
          });
        }

        const transaction = await tx.giftTransaction.create({
          data: {
            clientRequestId: dto.clientRequestId,
            sessionId: session.id,
            battleId,
            senderId: userId,
            recipientId,
            giftCode: gift.code,
            coins: gift.coins,
            creatorEarningsCoins,
          },
        });
        const wallet = await tx.coinWallet.findUniqueOrThrow({
          where: { userId },
        });
        const scores = battleId
          ? await tx.liveBattle.findUnique({ where: { id: battleId } })
          : null;
        return this.giftResult(transaction, scores, wallet.balanceCoins);
      });
    } catch (error: unknown) {
      if (this.hasErrorCode(error, 'P2002')) {
        const duplicate = await this.prisma.giftTransaction.findUnique({
          where: { clientRequestId: dto.clientRequestId },
        });
        if (duplicate?.senderId === userId)
          return this.giftResult(duplicate, null);
      }
      throw error;
    }
  }

  async recent(room: string, after?: string) {
    if (!/^[\w.@:-]{3,128}$/.test(room))
      throw new BadRequestException('Invalid room.');
    const afterDate = after ? new Date(after) : new Date(Date.now() - 15_000);
    if (Number.isNaN(afterDate.getTime()))
      throw new BadRequestException('Invalid gift cursor.');

    const transactions = await this.prisma.giftTransaction.findMany({
      where: {
        session: { room },
        createdAt: { gt: afterDate },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        sender: {
          select: {
            username: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
    return transactions.map((transaction) => {
      const gift = LIVE_GIFTS[transaction.giftCode as LiveGiftCode];
      return {
        id: transaction.id,
        senderId: transaction.senderId,
        senderName:
          transaction.sender.profile?.displayName ??
          transaction.sender.username,
        recipientId: transaction.recipientId,
        giftCode: transaction.giftCode,
        emoji: gift?.emoji ?? '🎁',
        coins: transaction.coins,
        battleId: transaction.battleId,
        createdAt: transaction.createdAt,
      };
    });
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const stripe = this.requireStripe();
    const secret = this.config
      .get<string>('STRIPE_GIFTS_WEBHOOK_SECRET', '')
      .trim();
    if (!secret)
      throw new ServiceUnavailableException('Gift webhook is not configured.');

    let event: StripeEvent;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid webhook signature.');
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await this.creditPurchase(
        event.id,
        event.type,
        event.data.object as StripeCheckoutSession,
      );
    } else if (
      event.type === 'charge.refunded' ||
      event.type === 'charge.dispute.created'
    ) {
      await this.reversePurchase(event.id, event.type, event.data.object);
    }
    return { received: true };
  }

  private async creditPurchase(
    eventId: string,
    eventType: string,
    session: StripeCheckoutSession,
  ) {
    if (
      session.metadata?.nxq_kind !== 'coin_purchase' ||
      session.payment_status !== 'paid'
    )
      return;
    const purchaseId = session.metadata.nxq_purchase_id;
    const userId = session.metadata.nxq_user_id;
    if (!purchaseId || !userId) return;
    await this.processWebhookOnce(eventId, eventType, async (tx) => {
      const purchase = await tx.coinPurchase.findUnique({
        where: { id: purchaseId },
      });
      if (
        !purchase ||
        purchase.userId !== userId ||
        purchase.status !== 'PENDING'
      )
        return;
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      await tx.coinPurchase.update({
        where: { id: purchase.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId ?? null,
        },
      });
      await tx.coinWallet.upsert({
        where: { userId: purchase.userId },
        create: {
          userId: purchase.userId,
          balanceCoins: purchase.coins,
          lifetimePurchased: purchase.coins,
        },
        update: {
          balanceCoins: { increment: purchase.coins },
          lifetimePurchased: { increment: purchase.coins },
        },
      });
    });
  }

  private async reversePurchase(
    eventId: string,
    eventType: string,
    charge: StripeCharge,
  ) {
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (!paymentIntentId) return;
    await this.processWebhookOnce(eventId, eventType, async (tx) => {
      const purchase = await tx.coinPurchase.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
      });
      if (!purchase || purchase.status !== 'PAID') return;
      const status =
        eventType === 'charge.dispute.created' ? 'DISPUTED' : 'REFUNDED';
      await tx.coinPurchase.update({
        where: { id: purchase.id },
        data: { status, reversedAt: new Date() },
      });
      await tx.coinWallet.updateMany({
        where: { userId: purchase.userId },
        data: { balanceCoins: { decrement: purchase.coins } },
      });
    });
  }

  private async processWebhookOnce(
    eventId: string,
    eventType: string,
    handler: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.giftWebhookEvent.create({
          data: { id: eventId, type: eventType },
        });
        await handler(tx);
      });
    } catch (error: unknown) {
      if (this.hasErrorCode(error, 'P2002')) return;
      this.logger.error(`Gift webhook ${eventId} failed`);
      throw error;
    }
  }

  private giftResult(
    transaction: GiftTransaction,
    battle: LiveBattle | null,
    balanceCoins?: number,
  ) {
    const catalogGift = LIVE_GIFTS[transaction.giftCode as LiveGiftCode];
    return {
      transactionId: transaction.id,
      gift: {
        code: transaction.giftCode,
        emoji: catalogGift?.emoji ?? '🎁',
        coins: transaction.coins,
      },
      senderId: transaction.senderId,
      recipientId: transaction.recipientId,
      balanceCoins,
      battle: battle
        ? {
            id: battle.id,
            hostScoreCoins: battle.hostScoreCoins,
            opponentScoreCoins: battle.opponentScoreCoins,
            status: battle.status,
            endsAt: battle.endsAt,
          }
        : null,
    };
  }

  private creatorShareBps() {
    const raw = Number(
      this.config.get<string>('CREATOR_GIFT_SHARE_BPS', '5000'),
    );
    return Number.isInteger(raw) && raw >= 0 && raw <= 10_000 ? raw : 5000;
  }

  private currency() {
    const value = this.config.get<string>('GIFT_CURRENCY', 'usd').toLowerCase();
    return /^[a-z]{3}$/.test(value) ? value : 'usd';
  }

  private isEnabled() {
    return this.config.get<string>('GIFTS_ENABLED', 'false') === 'true';
  }

  private requireEnabled() {
    if (!this.isEnabled())
      throw new ServiceUnavailableException(
        'Paid live gifts are not enabled yet.',
      );
  }

  private requireStripe() {
    if (!this.stripe)
      throw new ServiceUnavailableException(
        'Gift payments are not configured.',
      );
    return this.stripe;
  }

  private hasErrorCode(error: unknown, expectedCode: string): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }
    return (error as { code?: unknown }).code === expectedCode;
  }

  private randomLetters(length: number) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    return Array.from(
      randomBytes(length),
      (value) => alphabet[value % alphabet.length],
    ).join('');
  }
}
