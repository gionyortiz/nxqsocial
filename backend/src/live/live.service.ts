import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import type Redis from 'ioredis';
import type { Prisma } from '@prisma/client';

/**
 * A live session is considered "stale" (host's tab closed without a clean end)
 * if it hasn't sent a heartbeat in this many milliseconds. Stale LIVE sessions
 * are filtered out of the active list and lazily marked ENDED.
 * Set to 30s — heartbeat fires every 15s so this gives 2 missed beats.
 */
const STALE_MS = 30_000;
const MAX_COHOSTS = 5;

type GuestJoinRequest = {
  userId: string;
  displayName: string;
  ts: number;
};

type LiveSessionWithHost = Prisma.LiveSessionGetPayload<{
  include: {
    host: {
      select: {
        id: true;
        username: true;
        verificationStatus: true;
        profile: { select: { displayName: true; avatarUrl: true } };
      };
    };
  };
}>;

@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Host begins (or resumes) broadcasting in a room. */
  async start(hostId: string, room: string, title?: string) {
    if (!room || !/^[\w.@:-]{3,128}$/.test(room)) {
      throw new BadRequestException('Invalid room name.');
    }
    const existing = await this.prisma.liveSession.findUnique({
      where: { room },
    });
    if (existing && existing.hostId !== hostId && existing.status === 'LIVE') {
      // Someone else already owns this live room.
      throw new ForbiddenException('This live room is already in use.');
    }

    const session = await this.prisma.liveSession.upsert({
      where: { room },
      create: { room, hostId, title: title ?? null, status: 'LIVE' },
      update: {
        hostId,
        title: title ?? null,
        status: 'LIVE',
        endedAt: null,
        viewerCount: 0,
      },
    });
    if (
      existing &&
      (existing.status !== 'LIVE' || existing.hostId !== hostId)
    ) {
      await this.prisma.liveParticipant.updateMany({
        where: { sessionId: session.id, role: 'COHOST', status: 'APPROVED' },
        data: { status: 'LEFT', leftAt: new Date() },
      });
    }
    await this.prisma.liveParticipant.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: hostId } },
      create: {
        sessionId: session.id,
        userId: hostId,
        role: 'HOST',
        status: 'APPROVED',
      },
      update: { role: 'HOST', status: 'APPROVED', leftAt: null },
    });
    return this.shape(session);
  }

  /** Host ends the broadcast. */
  async end(hostId: string, room: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { room },
    });
    if (!session) return { ok: true };
    if (session.hostId !== hostId) {
      throw new ForbiddenException('Only the broadcaster can end this live.');
    }
    const endedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.liveSession.update({
        where: { room },
        data: { status: 'ENDED', endedAt, viewerCount: 0 },
      }),
      this.prisma.liveParticipant.updateMany({
        where: { sessionId: session.id, status: 'APPROVED' },
        data: { status: 'LEFT', leftAt: endedAt },
      }),
      this.prisma.liveBattle.updateMany({
        where: { sessionId: session.id, status: 'ACTIVE' },
        data: { status: 'ENDED', endedAt },
      }),
    ]);
    return { ok: true };
  }

  /** Host keepalive — refreshes updatedAt and records the current viewer count. */
  async heartbeat(hostId: string, room: string, viewerCount?: number) {
    const session = await this.prisma.liveSession.findUnique({
      where: { room },
    });
    if (!session || session.hostId !== hostId || session.status !== 'LIVE') {
      return { ok: false };
    }
    const vc = Math.max(0, viewerCount ?? 0);
    await this.prisma.liveSession.update({
      where: { room },
      data: {
        viewerCount: vc,
        peakViewers: vc > session.peakViewers ? vc : session.peakViewers,
        // updatedAt auto-bumps via @updatedAt
        updatedAt: new Date(),
      },
    });
    return { ok: true };
  }

  /** All currently-live broadcasts (excludes stale ones). */
  async active() {
    const since = new Date(Date.now() - STALE_MS);
    const sessions = await this.prisma.liveSession.findMany({
      where: { status: 'LIVE', updatedAt: { gte: since } },
      orderBy: { viewerCount: 'desc' },
      take: 50,
      include: {
        host: {
          select: {
            id: true,
            username: true,
            verificationStatus: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    });
    // Lazily retire stale LIVE rows so they stop showing up.
    void this.prisma.liveSession.updateMany({
      where: { status: 'LIVE', updatedAt: { lt: since } },
      data: { status: 'ENDED', endedAt: new Date(), viewerCount: 0 },
    });
    return sessions.map((s) => this.shapeWithHost(s));
  }

  /** The active live session for a specific username, or null. */
  async forUser(username: string) {
    const since = new Date(Date.now() - STALE_MS);
    const session = await this.prisma.liveSession.findFirst({
      where: { status: 'LIVE', updatedAt: { gte: since }, host: { username } },
      orderBy: { startedAt: 'desc' },
    });
    return session ? this.shape(session) : null;
  }

  async context(room: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { room },
      select: {
        status: true,
        hostId: true,
        host: { select: { username: true } },
        participants: {
          where: { status: 'APPROVED' },
          select: {
            userId: true,
            role: true,
            user: { select: { username: true } },
          },
        },
      },
    });
    if (!session || session.status !== 'LIVE') {
      throw new BadRequestException('This live is no longer active.');
    }
    return {
      hostId: session.hostId,
      hostUsername: session.host.username,
      participants: session.participants.map((participant) => ({
        userId: participant.userId,
        username: participant.user.username,
        role: participant.role,
      })),
    };
  }

  /** Viewer requests to join live as guest. Host polls to see requests. */
  async requestGuestJoin(room: string, userId: string, displayName: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { room },
    });
    if (!session || session.status !== 'LIVE') {
      throw new BadRequestException('This live is no longer active.');
    }
    if (session.hostId === userId) {
      throw new BadRequestException('The host is already on stage.');
    }
    const key = `live:guestreq:${room}`;
    const req = JSON.stringify({ userId, displayName, ts: Date.now() });
    const existing = await this.redis.lrange(key, 0, 99);
    for (const item of existing) {
      try {
        const parsed = this.parseGuestRequest(item);
        if (!parsed) {
          await this.redis.lrem(key, 1, item);
          continue;
        }
        if (parsed.userId === userId) {
          await this.redis.lrem(key, 1, item);
        }
      } catch {
        await this.redis.lrem(key, 1, item);
      }
    }
    // Store in a Redis list, TTL 5 min
    await this.redis.lpush(key, req);
    await this.redis.expire(key, 300);
    return { ok: true };
  }

  /** Host polls for pending guest requests. */
  async getGuestRequests(room: string, hostId: string) {
    await this.requireOwnedLive(room, hostId);
    const key = `live:guestreq:${room}`;
    const items = await this.redis.lrange(key, 0, 19);
    return items
      .map((item) => this.parseGuestRequest(item))
      .filter((item): item is GuestJoinRequest => item !== null);
  }

  /** Host approves a guest - writes approval to Redis so guest can poll. */
  async approveGuest(room: string, userId: string, hostId: string) {
    const session = await this.requireOwnedLive(room, hostId);
    const approvedCount = await this.prisma.liveParticipant.count({
      where: { sessionId: session.id, role: 'COHOST', status: 'APPROVED' },
    });
    const existing = await this.prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId } },
    });
    if (!existing && approvedCount >= MAX_COHOSTS) {
      throw new BadRequestException(
        `A live can have at most ${MAX_COHOSTS} co-hosts.`,
      );
    }
    const guest = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!guest || userId === hostId)
      throw new BadRequestException('Invalid co-host.');

    await this.prisma.liveParticipant.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId } },
      create: {
        sessionId: session.id,
        userId,
        role: 'COHOST',
        status: 'APPROVED',
      },
      update: { role: 'COHOST', status: 'APPROVED', leftAt: null },
    });
    // Remove from requests list
    const reqKey = `live:guestreq:${room}`;
    const items = await this.redis.lrange(reqKey, 0, 99);
    for (const item of items) {
      const parsed = this.parseGuestRequest(item);
      if (parsed?.userId === userId) {
        await this.redis.lrem(reqKey, 1, item);
        break;
      }
    }
    // Write approval flag - guest polls this key
    const approvalKey = `live:approved:${room}:${userId}`;
    await this.redis.set(approvalKey, '1', 'EX', 300);
    return { ok: true };
  }

  /** Guest polls this to know if they've been approved. */
  async checkApproval(room: string, userId: string) {
    const key = `live:approved:${room}:${userId}`;
    const val = await this.redis.get(key);
    if (val) {
      await this.redis.del(key); // consume once
      return { approved: true };
    }
    return { approved: false };
  }

  async guestStatus(room: string, userId: string) {
    const approved = await this.redis.exists(`live:approved:${room}:${userId}`);
    const reqKey = `live:guestreq:${room}`;
    const items = await this.redis.lrange(reqKey, 0, 99);
    const pending = items.some((item) => {
      try {
        return this.parseGuestRequest(item)?.userId === userId;
      } catch {
        return false;
      }
    });
    return { pending, approved: approved > 0 };
  }

  async clearGuestState(room: string, userId: string, actorId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { room },
    });
    if (!session) return { ok: true };
    if (actorId !== userId && session.hostId !== actorId) {
      throw new ForbiddenException('Only the host can remove another co-host.');
    }
    const reqKey = `live:guestreq:${room}`;
    const items = await this.redis.lrange(reqKey, 0, 99);
    for (const item of items) {
      try {
        const parsed = this.parseGuestRequest(item);
        if (parsed?.userId === userId) {
          await this.redis.lrem(reqKey, 1, item);
        }
      } catch {
        await this.redis.lrem(reqKey, 1, item);
      }
    }
    await this.redis.del(`live:approved:${room}:${userId}`);
    await this.prisma.liveParticipant.updateMany({
      where: {
        sessionId: session.id,
        userId,
        role: 'COHOST',
        status: 'APPROVED',
      },
      data: { status: 'LEFT', leftAt: new Date() },
    });
    return { ok: true };
  }

  /** Server-side source of truth for LiveKit publish authority. */
  async canPublish(room: string, userId: string): Promise<boolean> {
    const session = await this.prisma.liveSession.findUnique({
      where: { room },
      select: {
        status: true,
        hostId: true,
        participants: {
          where: { userId, status: 'APPROVED' },
          select: { role: true },
        },
      },
    });
    if (!session || session.status !== 'LIVE') return false;
    return (
      session.hostId === userId ||
      session.participants.some((p) => p.role === 'COHOST')
    );
  }

  async startBattle(
    hostId: string,
    room: string,
    opponentId: string,
    durationSec = 60,
  ) {
    const session = await this.requireOwnedLive(room, hostId);
    const opponent = await this.prisma.liveParticipant.findFirst({
      where: {
        sessionId: session.id,
        userId: opponentId,
        role: 'COHOST',
        status: 'APPROVED',
      },
    });
    if (!opponent)
      throw new BadRequestException(
        'Battle opponent must be an approved co-host.',
      );

    const duration = Math.min(300, Math.max(30, durationSec));
    const now = new Date();
    await this.prisma.liveBattle.updateMany({
      where: { sessionId: session.id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: now },
    });
    return this.prisma.liveBattle.create({
      data: {
        sessionId: session.id,
        hostId,
        opponentId,
        endsAt: new Date(now.getTime() + duration * 1000),
      },
    });
  }

  async activeBattle(room: string) {
    const battle = await this.prisma.liveBattle.findFirst({
      where: { session: { room }, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });
    if (!battle) return null;
    if (battle.endsAt.getTime() <= Date.now()) {
      return this.prisma.liveBattle.update({
        where: { id: battle.id },
        data: { status: 'ENDED', endedAt: new Date() },
      });
    }
    return battle;
  }

  async endBattle(hostId: string, room: string) {
    const session = await this.requireOwnedLive(room, hostId);
    const { count } = await this.prisma.liveBattle.updateMany({
      where: { sessionId: session.id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    return { ok: true, ended: count };
  }

  private async requireOwnedLive(room: string, hostId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { room },
    });
    if (!session || session.status !== 'LIVE') {
      throw new BadRequestException('This live is no longer active.');
    }
    if (session.hostId !== hostId) {
      throw new ForbiddenException(
        'Only the broadcaster can manage this live.',
      );
    }
    return session;
  }

  private shape(s: {
    room: string;
    title: string | null;
    status: string;
    viewerCount: number;
    startedAt: Date;
  }) {
    return {
      room: s.room,
      title: s.title,
      status: s.status,
      viewerCount: s.viewerCount,
      startedAt: s.startedAt,
    };
  }

  private shapeWithHost(s: LiveSessionWithHost) {
    return {
      room: s.room,
      title: s.title,
      viewerCount: s.viewerCount,
      startedAt: s.startedAt,
      host: {
        id: s.host.id,
        username: s.host.username,
        displayName: s.host.profile?.displayName ?? s.host.username,
        avatarUrl: s.host.profile?.avatarUrl ?? null,
        verificationStatus: s.host.verificationStatus,
      },
    };
  }

  private parseGuestRequest(value: string): GuestJoinRequest | null {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('userId' in parsed) ||
        !('displayName' in parsed) ||
        !('ts' in parsed) ||
        typeof parsed.userId !== 'string' ||
        typeof parsed.displayName !== 'string' ||
        typeof parsed.ts !== 'number'
      ) {
        return null;
      }
      return {
        userId: parsed.userId,
        displayName: parsed.displayName,
        ts: parsed.ts,
      };
    } catch {
      return null;
    }
  }
}
