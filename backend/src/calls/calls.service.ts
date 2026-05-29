import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { PrismaService } from '../prisma/prisma.service';

interface CallerInfo {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface Invite {
  room: string;
  caller: CallerInfo;
  video: boolean;
  group: boolean;
  createdAt: number;
}

const INVITE_TTL_SECONDS = 45;

@Injectable()
export class CallsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private get apiKey() {
    return this.config.get<string>('LIVEKIT_API_KEY');
  }
  private get apiSecret() {
    return this.config.get<string>('LIVEKIT_API_SECRET');
  }
  get wsUrl() {
    return this.config.get<string>('LIVEKIT_URL') ?? '';
  }

  /** Generate a LiveKit access token for the given user to join a room. */
  async createToken(
    userId: string,
    room: string,
    opts: { video?: boolean } = {},
  ): Promise<{ token: string; url: string; room: string; identity: string }> {
    if (!this.apiKey || !this.apiSecret) {
      throw new BadRequestException(
        'Calling is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET and LIVEKIT_URL on the server.',
      );
    }
    if (!room || !/^[\w.@:-]{3,128}$/.test(room)) {
      throw new BadRequestException('Invalid room name.');
    }

    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } },
    });

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: profile?.profile?.displayName ?? profile?.username ?? 'User',
      metadata: JSON.stringify({
        username: profile?.username,
        avatarUrl: profile?.profile?.avatarUrl ?? null,
      }),
      ttl: '2h',
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      token: await at.toJwt(),
      url: this.wsUrl,
      room,
      identity: userId,
    };
  }

  /** Notify one or more users that they're being invited to a call. */
  async ring(
    callerId: string,
    room: string,
    targetUsernames: string[],
    opts: { video?: boolean; group?: boolean } = {},
  ): Promise<{ invited: string[] }> {
    const caller = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } },
    });
    if (!caller) throw new BadRequestException('Caller not found.');

    const targets = await this.prisma.user.findMany({
      where: { username: { in: targetUsernames } },
      select: { id: true, username: true },
    });

    const invite: Invite = {
      room,
      caller: {
        username: caller.username,
        displayName: caller.profile?.displayName ?? caller.username,
        avatarUrl: caller.profile?.avatarUrl ?? null,
      },
      video: opts.video ?? true,
      group: opts.group ?? false,
      createdAt: Date.now(),
    };

    const invited: string[] = [];
    for (const t of targets) {
      if (t.id === callerId) continue;
      await this.redis.set(
        `call:invite:${t.id}`,
        JSON.stringify(invite),
        'EX',
        INVITE_TTL_SECONDS,
      );
      invited.push(t.username);
    }
    return { invited };
  }

  /** Return a pending incoming call invite for the user, if any. */
  async getIncoming(userId: string): Promise<Invite | null> {
    const raw = await this.redis.get(`call:invite:${userId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Invite;
    } catch {
      return null;
    }
  }

  /** Clear a pending invite (decline / accepted / timed out). */
  async clearIncoming(userId: string): Promise<void> {
    await this.redis.del(`call:invite:${userId}`);
  }
}
