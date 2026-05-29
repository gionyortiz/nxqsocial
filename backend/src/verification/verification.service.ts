import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { TrustEngineService } from '../trust-engine/trust-engine.service';
import { AuditService } from '../audit/audit.service';

// Verification tier ordering
const TIER_ORDER = ['UNVERIFIED', 'BASIC', 'HUMAN_VERIFIED', 'ID_VERIFIED', 'BUSINESS_VERIFIED'];

/** Map Stripe Identity outcome → our tier */
const STRIPE_LEVEL_MAP: Record<string, string> = {
  id_number: 'HUMAN_VERIFIED',
  document: 'ID_VERIFIED',
  document_and_selfie: 'ID_VERIFIED',
};

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private stripe!: InstanceType<typeof Stripe>;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private trustEngine: TrustEngineService,
    private audit: AuditService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY', 'sk_test_placeholder'), {
      apiVersion: '2025-04-30.basil' as any,
    });
  }

  async getStatus(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        verificationStatus: true,
        trustScore: true,
        verifications: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  /**
   * Phase 1 self-attestation request (no Stripe — just queues for admin review)
   * Used for HUMAN_VERIFIED (phone/selfie).
   */
  async requestVerification(userId: string, tier: string) {
    const validTiers = ['HUMAN_VERIFIED', 'ID_VERIFIED', 'BUSINESS_VERIFIED'];
    if (!validTiers.includes(tier)) throw new BadRequestException('Invalid verification tier');

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { verificationStatus: true },
    });

    const currentIdx = TIER_ORDER.indexOf(user.verificationStatus);
    const requestedIdx = TIER_ORDER.indexOf(tier);
    if (requestedIdx <= currentIdx) {
      throw new BadRequestException('You already have this or a higher verification tier');
    }

    // Check no pending request already exists
    const pending = await this.prisma.verification.findFirst({
      where: { userId, level: tier as any, status: 'PENDING' },
    });
    if (pending) throw new BadRequestException('You already have a pending request for this tier');

    return this.prisma.verification.create({
      data: {
        userId,
        level: tier as any,
        provider: 'SELF',
        providerRef: `self-${userId}-${Date.now()}`,
        status: 'PENDING',
      },
    });
  }

  /**
   * Starts a Stripe Identity verification session.
   * Returns the Stripe-hosted verification URL for the client to redirect to.
   * Used for ID_VERIFIED tier.
   */
  async startStripeIdentityCheck(userId: string) {
    const appUrl = this.config.get<string>('APP_BASE_URL', 'http://localhost:3001');

    const session = await this.stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { nxqsocial_user_id: userId },
      options: { document: { allowed_types: ['driving_license', 'passport', 'id_card'], require_id_number: false } },
      return_url: `${appUrl}/verify/complete?session_id={VERIFICATION_SESSION_ID}`,
    });

    // Store the session ref so the webhook can look it up
    await this.prisma.verification.create({
      data: {
        userId,
        level: 'ID_VERIFIED',
        provider: 'stripe',
        providerRef: session.id,
        status: 'PENDING',
      },
    });

    return { url: session.url, sessionId: session.id };
  }

  /**
   * Stripe webhook handler — called by NestJS controller with raw body.
   * Validates the signature before processing.
   */
  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    let event: any;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error('Stripe webhook signature verification failed', err);
      throw new BadRequestException('Invalid webhook signature');
    }

    if (event.type === 'identity.verification_session.verified') {
      await this.onStripeVerified(event.data.object as any);
    } else if (event.type === 'identity.verification_session.requires_input') {
      await this.onStripeRequiresInput(event.data.object as any);
    }

    return { received: true };
  }

  private async onStripeVerified(session: any) {
    const userId = session.metadata?.nxqsocial_user_id;
    if (!userId) return;

    const verification = await this.prisma.verification.findFirst({
      where: { providerRef: session.id },
    });
    if (!verification) return;

    const tier = STRIPE_LEVEL_MAP[session.type] ?? 'ID_VERIFIED';

    // Store only non-sensitive metadata — NEVER raw ID images
    await this.prisma.verification.update({
      where: { id: verification.id },
      data: {
        status: 'APPROVED',
        level: tier as any,
        verifiedAt: new Date(),
        country: (session as any).last_verification_report?.document?.issuing_country ?? null,
        ageBand: this.extractAgeBand(session),
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: tier as any },
    });

    // Recompute trust score with the new verification
    await this.trustEngine.recalculate(userId);

    this.logger.log(`User ${userId} verified at tier ${tier} via Stripe`);
  }

  private async onStripeRequiresInput(session: any) {
    await this.prisma.verification.updateMany({
      where: { providerRef: session.id },
      data: { status: 'REJECTED' },
    });
    this.logger.log(`Stripe verification failed for session ${session.id}`);
  }

  private extractAgeBand(session: any): string | null {
    const dob = (session as any).last_verification_report?.document?.dob;
    if (!dob) return null;
    const year = dob.year as number;
    if (!year) return null;
    const age = new Date().getFullYear() - year;
    if (age < 18) return 'under_18';
    if (age < 25) return '18_24';
    if (age < 35) return '25_34';
    if (age < 50) return '35_49';
    return '50_plus';
  }

  /** Admin: approve/reject self-attested requests */
  async reviewVerification(verificationId: string, approved: boolean, adminId?: string) {
    const ver = await this.prisma.verification.findUniqueOrThrow({ where: { id: verificationId } });

    const updated = await this.prisma.verification.update({
      where: { id: verificationId },
      data: { status: approved ? 'APPROVED' : 'REJECTED', verifiedAt: approved ? new Date() : null },
    });

    if (approved) {
      await this.prisma.user.update({
        where: { id: ver.userId },
        data: { verificationStatus: ver.level as any },
      });
      await this.trustEngine.recalculate(ver.userId);
    }

    // Audit trail
    if (adminId) {
      await this.audit.log({
        adminId,
        action: approved ? 'VERIFICATION_APPROVED' : 'VERIFICATION_REJECTED',
        targetUserId: ver.userId,
        meta: { verificationId, level: ver.level },
      });
    }

    return updated;
  }

  async getPendingVerifications() {
    return this.prisma.verification.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { id: true, username: true, verificationStatus: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}

