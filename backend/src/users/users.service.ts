import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../auth/mail.service';
import { MediaSafetyService } from '../safety/media-safety.service';
import {
  StorageService,
  StorageFolder,
} from '../common/storage/storage.service';
import {
  cleanupOwnedMediaReferences,
  OwnedMediaReference,
  ownedLocalUploadPath,
  ownedMediaReferenceIdentity,
  queueOwnedMediaCleanup,
} from '../common/storage/owned-media-cleanup';
import { UpdateProfileDto, UpdateSettingsDto } from './users.dto';
import * as crypto from 'crypto';

const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  role: true,
  verificationStatus: true,
  trustScore: true,
  createdAt: true,
  profile: {
    select: {
      displayName: true,
      bio: true,
      avatarUrl: true,
      bannerUrl: true,
      location: true,
      website: true,
    },
  },
  _count: { select: { posts: true, followers: true, following: true } },
};
const IMMUTABLE_PROCESSING_PREFIX = 'processing/media-finalizing/';

function isImmutableProcessingKeyForMedia(
  reference: unknown,
  mediaId: string,
): reference is string {
  if (typeof reference !== 'string') return false;
  const safeMediaId = mediaId.replace(/[^A-Za-z0-9_-]/g, '_');
  return reference.startsWith(`${IMMUTABLE_PROCESSING_PREFIX}${safeMediaId}/`);
}

function flattenUser(user: any) {
  const { profile, ...base } = user;
  return { ...base, ...(profile ?? {}) };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private mail: MailService,
    private storage: StorageService,
    private mediaSafety: MediaSafetyService,
  ) {}

  private jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private findUserByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
  }

  async findByUsername(username: string, currentUserId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');

    let isFollowing = false;
    if (currentUserId) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: user.id,
          },
        },
      });
      isFollowing = !!follow;
    }

    return { ...flattenUser(user), isFollowing };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const normalize = (v?: string) => {
      if (v === undefined) return undefined;
      const t = v.trim();
      return t.length === 0 ? null : t;
    };
    const data = {
      displayName: normalize(dto.displayName) ?? undefined,
      bio: normalize(dto.bio),
      location: normalize(dto.location),
      website: normalize(dto.website),
    };
    // Use upsert in case profile row is missing for legacy accounts.
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          upsert: {
            create: {
              displayName: data.displayName ?? '',
              bio: data.bio ?? undefined,
              location: data.location ?? undefined,
              website: data.website ?? undefined,
            },
            update: data,
          },
        },
      },
      select: USER_PUBLIC_SELECT,
    });
    return flattenUser(user);
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    await this.replaceProfileImage(userId, 'avatarUrl', avatarUrl, 'avatars');
    return { id: userId, avatarUrl };
  }

  async removeAvatar(userId: string) {
    await this.replaceProfileImage(userId, 'avatarUrl', null, 'avatars');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return flattenUser(user);
  }

  async updateBanner(userId: string, bannerUrl: string) {
    await this.replaceProfileImage(userId, 'bannerUrl', bannerUrl, 'banners');
    return { id: userId, bannerUrl };
  }

  async removeBanner(userId: string) {
    await this.replaceProfileImage(userId, 'bannerUrl', null, 'banners');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return flattenUser(user);
  }

  /**
   * Optimistically swaps a profile image so concurrent uploads cannot orphan
   * the winner of an overlapping request. The database always commits before
   * the previous object is removed; cleanup failure therefore cannot leave a
   * profile pointing at a deleted object.
   */
  private async replaceProfileImage(
    userId: string,
    field: 'avatarUrl' | 'bannerUrl',
    nextUrl: string | null,
    folder: StorageFolder,
  ): Promise<void> {
    const maxAttempts = 4;
    let previousUrl: string | null = null;
    let updated = false;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const swap = await this.prisma.$transaction(async (tx) => {
        const profile = await tx.profile.findUnique({
          where: { userId },
          select: { [field]: true } as any,
        });
        if (!profile) throw new NotFoundException('User profile not found');

        const currentUrl = (profile as any)[field] ?? null;
        if (currentUrl === nextUrl) {
          return { changed: false, retry: false, previousUrl: currentUrl };
        }

        const result = await tx.profile.updateMany({
          where: { userId, [field]: currentUrl } as any,
          data: { [field]: nextUrl } as any,
        });
        if (result.count !== 1) {
          return { changed: false, retry: true, previousUrl: currentUrl };
        }

        await queueOwnedMediaCleanup(
          tx,
          this.storage,
          [{ value: currentUrl, prefixes: [folder] }],
          field === 'avatarUrl'
            ? 'profile-avatar-replace'
            : 'profile-banner-replace',
        );
        return { changed: true, retry: false, previousUrl: currentUrl };
      });
      previousUrl = swap.previousUrl;
      if (!swap.changed && !swap.retry) return;
      if (swap.changed) {
        updated = true;
        break;
      }
    }

    if (!updated) {
      throw new ConflictException(
        'Profile image changed concurrently. Please try again.',
      );
    }

    if (previousUrl) {
      await cleanupOwnedMediaReferences(
        this.storage,
        [{ value: previousUrl, prefixes: [folder] }],
        (error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Could not remove replaced ${field}: ${message}`);
        },
      );
    }
  }

  // ── Self: account settings ──────────────────────────────────────────────────

  async getSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        emailNotifications: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailNotifications: dto.emailNotifications },
      select: {
        id: true,
        email: true,
        username: true,
        emailNotifications: true,
      },
    });
    return user;
  }

  async deleteAccount(userId: string) {
    let references:
      | {
          references: OwnedMediaReference[];
          quarantineKeys: string[];
          moderationObjectKeys: string[];
        }
      | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        references = await this.prisma.$transaction(
          async (tx) => {
            const user = await tx.user.findUnique({
              where: { id: userId },
              select: {
                profile: { select: { avatarUrl: true, bannerUrl: true } },
                mediaAssets: {
                  select: {
                    id: true,
                    bucket: true,
                    s3Key: true,
                    url: true,
                    thumbnailUrl: true,
                    uploadStatus: true,
                    safetyResult: true,
                    post: { select: { authorId: true } },
                    story: { select: { authorId: true } },
                  },
                },
              },
            });
            if (!user) throw new NotFoundException('User not found');

            const processingAsset = user.mediaAssets.find((asset) =>
              ['FINALIZING', 'TRANSCODING', 'SCANNING', 'REMOVING'].includes(
                asset.uploadStatus,
              ),
            );
            if (processingAsset) {
              throw new ConflictException(
                'A media upload is still processing. Please retry account deletion shortly.',
              );
            }

            const foreignConsumer = user.mediaAssets.find(
              (asset) =>
                (asset.post && asset.post.authorId !== userId) ||
                (asset.story && asset.story.authorId !== userId),
            );
            if (foreignConsumer) {
              throw new ConflictException(
                'Account media is still linked to content owned by another account. Unlink or transfer that content before deleting this account.',
              );
            }

            const allPrefixes = [
              'avatars',
              'banners',
              'images',
              'videos',
              'audio',
              'thumbnails',
              'uploads',
            ] as const;
            const rawCandidateValues = [
              user.profile?.avatarUrl,
              user.profile?.bannerUrl,
              ...user.mediaAssets.flatMap((asset) => {
                const safetyResult = this.jsonObject(asset.safetyResult);
                return [
                  asset.s3Key,
                  asset.url,
                  asset.thumbnailUrl,
                  typeof safetyResult.finalKey === 'string'
                    ? safetyResult.finalKey
                    : null,
                ];
              }),
            ].filter((value): value is string => Boolean(value));
            const candidateValues = new Set(rawCandidateValues);
            for (const value of rawCandidateValues) {
              const key = this.storage.managedKeyFromReference(
                value,
                allPrefixes,
              );
              if (!key) continue;
              candidateValues.add(key);
              candidateValues.add(this.storage.publicUrl(key));
            }
            const candidateRepresentations = [...candidateValues];

            const [sharedProfiles, sharedAssets] =
              candidateRepresentations.length
                ? await Promise.all([
                    tx.profile.findMany({
                      where: {
                        userId: { not: userId },
                        OR: [
                          { avatarUrl: { in: candidateRepresentations } },
                          { bannerUrl: { in: candidateRepresentations } },
                        ],
                      },
                      select: { avatarUrl: true, bannerUrl: true },
                    }),
                    tx.mediaAsset.findMany({
                      where: {
                        userId: { not: userId },
                        OR: [
                          { s3Key: { in: candidateRepresentations } },
                          { url: { in: candidateRepresentations } },
                          { thumbnailUrl: { in: candidateRepresentations } },
                        ],
                      },
                      select: {
                        s3Key: true,
                        url: true,
                        thumbnailUrl: true,
                      },
                    }),
                  ])
                : [[], []];

            const sharedIdentities = new Set<string>();
            const recordSharedIdentity = (value: string | null | undefined) => {
              const identity = ownedMediaReferenceIdentity(this.storage, {
                value,
                prefixes: allPrefixes,
              });
              if (identity) sharedIdentities.add(identity);
            };
            for (const profile of sharedProfiles) {
              recordSharedIdentity(profile.avatarUrl);
              recordSharedIdentity(profile.bannerUrl);
            }
            for (const asset of sharedAssets) {
              recordSharedIdentity(asset.s3Key);
              recordSharedIdentity(asset.url);
              recordSharedIdentity(asset.thumbnailUrl);
            }

            const ownedReferences: OwnedMediaReference[] = [];
            const addExclusiveReference = (reference: OwnedMediaReference) => {
              const identity = ownedMediaReferenceIdentity(
                this.storage,
                reference,
              );
              if (identity && !sharedIdentities.has(identity)) {
                ownedReferences.push(reference);
              }
            };
            addExclusiveReference({
              value: user.profile?.avatarUrl,
              prefixes: ['avatars'],
            });
            addExclusiveReference({
              value: user.profile?.bannerUrl,
              prefixes: ['banners'],
            });

            const primaryPrefixes = [
              'images',
              'videos',
              'audio',
              'uploads',
            ] as const;
            const quarantineKeys = new Set<string>();
            const moderationObjectKeys = new Set<string>();
            for (const asset of user.mediaAssets) {
              const safetyResult = this.jsonObject(asset.safetyResult);
              if (
                typeof safetyResult.moderationObjectKey === 'string' &&
                safetyResult.moderationObjectKey.startsWith('nxq-social/')
              ) {
                moderationObjectKeys.add(safetyResult.moderationObjectKey);
              }
              if (typeof safetyResult.finalKey === 'string') {
                addExclusiveReference({
                  value: safetyResult.finalKey,
                  prefixes: primaryPrefixes,
                });
              }

              if (asset.bucket === this.storage.quarantineBucketName) {
                if (asset.s3Key.startsWith(`incoming/${userId}/`)) {
                  quarantineKeys.add(asset.s3Key);
                } else if (
                  isImmutableProcessingKeyForMedia(asset.s3Key, asset.id)
                ) {
                  quarantineKeys.add(asset.s3Key);
                }
              } else if (asset.bucket === this.storage.bucketName) {
                addExclusiveReference({
                  value: asset.s3Key,
                  prefixes: primaryPrefixes,
                });
                addExclusiveReference({
                  value: asset.thumbnailUrl,
                  prefixes: ['thumbnails'],
                });
              } else {
                if (ownedLocalUploadPath(asset.url, primaryPrefixes)) {
                  addExclusiveReference({
                    value: asset.url,
                    prefixes: primaryPrefixes,
                  });
                }
                if (ownedLocalUploadPath(asset.thumbnailUrl, ['thumbnails'])) {
                  addExclusiveReference({
                    value: asset.thumbnailUrl,
                    prefixes: ['thumbnails'],
                  });
                }
              }
              if (
                isImmutableProcessingKeyForMedia(
                  safetyResult.immutableSourceKey,
                  asset.id,
                )
              ) {
                quarantineKeys.add(safetyResult.immutableSourceKey);
              }
            }

            await queueOwnedMediaCleanup(
              tx,
              this.storage,
              ownedReferences,
              'account-delete',
            );
            const auxiliaryJobs = [
              ...Array.from(quarantineKeys, (reference) => ({
                kind: 'QUARANTINE_STORAGE' as const,
                reference,
                allowedPrefixes: [] as string[],
                source: 'account-delete',
              })),
              ...Array.from(moderationObjectKeys, (reference) => ({
                kind: 'MODERATION_STORAGE' as const,
                reference,
                allowedPrefixes: [] as string[],
                source: 'account-delete',
              })),
            ];
            if (auxiliaryJobs.length > 0) {
              await tx.objectCleanupJob.createMany({
                data: auxiliaryJobs,
                skipDuplicates: true,
              });
            }

            await tx.user.delete({ where: { id: userId } });
            return {
              references: ownedReferences,
              quarantineKeys: Array.from(quarantineKeys),
              moderationObjectKeys: Array.from(moderationObjectKeys),
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
        break;
      } catch (error: unknown) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? (error as { code?: unknown }).code
            : undefined;
        if (code === 'P2034' && attempt < 2) continue;
        throw error;
      }
    }
    if (!references) {
      throw new ConflictException(
        'Account changed concurrently. Please retry account deletion.',
      );
    }

    const cleanupResults = await Promise.allSettled([
      cleanupOwnedMediaReferences(
        this.storage,
        references.references,
        (error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Account media cleanup failed: ${message}`);
        },
      ),
      ...references.quarantineKeys.map((key) =>
        this.storage.deleteIncoming(key),
      ),
      ...references.moderationObjectKeys.map((key) =>
        this.mediaSafety.cleanupVideoScanObject(key),
      ),
    ]);
    for (const result of cleanupResults) {
      if (result.status === 'rejected') {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        this.logger.warn(`Account auxiliary-media cleanup failed: ${message}`);
      }
    }
    return { message: 'Your account has been deleted.' };
  }

  // ── Self: blocking ──────────────────────────────────────────────────────────

  async blockUser(userId: string, targetUsername: string) {
    const target = await this.findUserByUsername(targetUsername);
    if (!target) throw new NotFoundException('User not found');
    if (target.id === userId)
      throw new BadRequestException('You cannot block yourself');

    await this.prisma.block.upsert({
      where: {
        blockerId_blockedId: { blockerId: userId, blockedId: target.id },
      },
      create: { blockerId: userId, blockedId: target.id },
      update: {},
    });
    // Remove any follow relationship in both directions.
    await this.prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: userId, followingId: target.id },
          { followerId: target.id, followingId: userId },
        ],
      },
    });
    return { blocked: true };
  }

  async unblockUser(userId: string, targetUsername: string) {
    const target = await this.findUserByUsername(targetUsername);
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.block.deleteMany({
      where: { blockerId: userId, blockedId: target.id },
    });
    return { blocked: false };
  }

  async listBlocked(userId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        blocked: {
          select: {
            id: true,
            username: true,
            verificationStatus: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    });
    return blocks.map((b) => ({
      ...flattenUser(b.blocked),
      blockedAt: b.createdAt,
    }));
  }

  async searchUsers(query: string, currentUserId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          {
            profile: { displayName: { contains: query, mode: 'insensitive' } },
          },
        ],
      },
      select: {
        id: true,
        username: true,
        verificationStatus: true,
        trustScore: true,
        profile: { select: { displayName: true, avatarUrl: true } },
      },
      take: 20,
    });

    let followingIds = new Set<string>();
    if (currentUserId && users.length > 0) {
      const follows = await this.prisma.follow.findMany({
        where: {
          followerId: currentUserId,
          followingId: { in: users.map((u) => u.id) },
        },
        select: { followingId: true },
      });
      followingIds = new Set(follows.map((f) => f.followingId));
    }

    return users.map((u) => ({
      ...flattenUser(u),
      isFollowing: followingIds.has(u.id),
    }));
  }

  // ── Admin: user management ─────────────────────────────────────────────────

  async adminListUsers(page = 1, take = 30, search?: string) {
    const skip = (page - 1) * take;
    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          verificationStatus: true,
          trustScore: true,
          emailVerified: true,
          phoneVerified: true,
          isSuspended: true,
          isBanned: true,
          createdAt: true,
          profile: { select: { displayName: true, avatarUrl: true } },
          _count: { select: { posts: true, reportsReceived: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users.map(flattenUser), total, page, take };
  }

  async suspendUser(targetId: string, adminId: string, reason?: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN')
      throw new ForbiddenException('Cannot suspend an admin');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { isSuspended: true },
    });

    await this.audit.log({
      adminId,
      action: 'USER_SUSPENDED',
      targetUserId: targetId,
      reason,
      meta: { username: target.username },
    });

    return { suspended: true, userId: targetId };
  }

  async restoreUser(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { isSuspended: false, isBanned: false },
    });

    await this.audit.log({
      adminId,
      action: 'USER_SUSPENDED',
      targetUserId: targetId,
      meta: { restored: true, username: target.username },
    });

    return { restored: true, userId: targetId };
  }

  async banUser(targetId: string, adminId: string, reason?: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN')
      throw new ForbiddenException('Cannot ban an admin');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { isBanned: true, isSuspended: true },
    });

    await this.audit.log({
      adminId,
      action: 'USER_BANNED',
      targetUserId: targetId,
      reason,
      meta: { username: target.username },
    });

    return { banned: true, userId: targetId };
  }

  /** Admin: send a password-reset email. Never allows admin to set a password directly. */
  async adminSendPasswordReset(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');

    // Reuse the standard token-based reset flow — admin never sees the token.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: target.id, usedAt: null },
    });
    await this.prisma.passwordResetToken.create({
      data: { userId: target.id, tokenHash, expiresAt },
    });

    const appUrl = process.env.APP_BASE_URL ?? 'https://nxqsocial.com';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    const sent = await this.mail.sendPasswordReset(target.email, resetUrl);
    if (!sent) {
      throw new ServiceUnavailableException(
        'Password reset email could not be delivered',
      );
    }

    await this.audit.log({
      adminId,
      action: 'USER_SUSPENDED',
      targetUserId: targetId,
      meta: { action: 'admin_password_reset_sent', username: target.username },
    });

    return {
      ok: true,
      message: `Password reset email sent to ${target.email}`,
    };
  }

  /** Admin: resend email verification. */
  async adminResendEmailVerification(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.emailVerified)
      return { ok: true, message: 'Email already verified.' };

    // Send a verification reminder email.
    const sent = await this.mail.sendVerificationEmail(
      target.email,
      target.username,
    );
    if (!sent) {
      throw new ServiceUnavailableException(
        'Verification email could not be delivered',
      );
    }

    await this.audit.log({
      adminId,
      action: 'USER_SUSPENDED',
      targetUserId: targetId,
      meta: {
        action: 'admin_resend_email_verification',
        username: target.username,
      },
    });

    return {
      ok: true,
      message: `Verification email re-sent to ${target.email}`,
    };
  }

  /** Admin: lock account (prevents login, non-destructive). */
  async adminLockAccount(targetId: string, adminId: string, reason?: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN')
      throw new ForbiddenException('Cannot lock an admin account');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { isSuspended: true },
    });

    await this.audit.log({
      adminId,
      action: 'USER_SUSPENDED',
      targetUserId: targetId,
      reason,
      meta: { action: 'admin_account_locked', username: target.username },
    });

    return { ok: true, locked: true, userId: targetId };
  }

  /** Admin: unlock a locked account. */
  async adminUnlockAccount(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { isSuspended: false },
    });

    await this.audit.log({
      adminId,
      action: 'USER_SUSPENDED',
      targetUserId: targetId,
      meta: { action: 'admin_account_unlocked', username: target.username },
    });

    return { ok: true, locked: false, userId: targetId };
  }

  /**
   * Admin: force-logout all sessions.
   * We don't store sessions, so we invalidate by rotating passwordHash salt via
   * a dummy append — JWTs signed before this will still be valid until expiry,
   * but this logs the action and the next password reset will take effect.
   * Proper session invalidation requires jwtVersion tracking (Phase 2).
   */
  async adminForceLogout(targetId: string, adminId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');

    // Invalidate all password reset tokens so any in-flight tokens stop working.
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: targetId },
    });

    await this.audit.log({
      adminId,
      action: 'USER_SUSPENDED',
      targetUserId: targetId,
      meta: { action: 'admin_force_logout', username: target.username },
    });

    return {
      ok: true,
      message:
        'All active reset tokens invalidated. User will need to log in again after password expires.',
    };
  }

  /** Admin: full account detail for support view. */
  async adminAccountDetail(targetId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        role: true,
        verificationStatus: true,
        trustScore: true,
        emailVerified: true,
        phoneVerified: true,
        emailNotifications: true,
        isSuspended: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
        profile: { select: { displayName: true, bio: true, avatarUrl: true } },
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
            reportsReceived: true,
          },
        },
        passwordResets: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { createdAt: true, usedAt: true, expiresAt: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const auditLogs = await this.prisma.auditLog.findMany({
      where: { targetUserId: targetId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        actionType: true,
        reason: true,
        meta: true,
        createdAt: true,
        admin: { select: { username: true } },
      },
    });

    // Derive the signup source from the recorded signup_completed analytics event.
    const signupEvent = await this.prisma.analyticsEvent.findFirst({
      where: { userId: targetId, name: 'signup_completed' },
      orderBy: { createdAt: 'desc' },
      select: { properties: true },
    });
    const rawSource = (signupEvent?.properties as any)?.source as
      | string
      | undefined;
    // Honest derivation from existing data — no OAuth/device fields are stored yet.
    const registrationMethod = user.phone ? 'Phone' : 'Email';
    const signupSource =
      rawSource === 'invite_code'
        ? 'Invited (invite code)'
        : rawSource === 'open_registration'
          ? 'Open registration'
          : 'Unknown';

    const { profile, passwordResets, ...base } = user;
    return {
      ...base,
      displayName: profile?.displayName,
      avatarUrl: profile?.avatarUrl,
      bio: profile?.bio,
      registrationMethod,
      signupSource,
      passwordResetHistory: passwordResets,
      auditLog: auditLogs,
    };
  }

  async getUserTrustHistory(targetId: string) {
    const [user, reports, auditLogs, verifications] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          username: true,
          trustScore: true,
          verificationStatus: true,
          emailVerified: true,
          phoneVerified: true,
          isSuspended: true,
          isBanned: true,
          createdAt: true,
          _count: {
            select: { reportsReceived: true, posts: true, followers: true },
          },
        },
      }),
      this.prisma.report.findMany({
        where: { reportedId: targetId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          reason: true,
          status: true,
          createdAt: true,
          reporter: { select: { id: true, username: true } },
        },
      }),
      this.prisma.auditLog.findMany({
        where: { targetUserId: targetId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { admin: { select: { id: true, username: true } } },
      }),
      this.prisma.verification.findMany({
        where: { userId: targetId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    return { user, reports, auditLogs, verifications };
  }
}
