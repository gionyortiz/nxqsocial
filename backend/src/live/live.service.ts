import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A live session is considered "stale" (host's tab closed without a clean end)
 * if it hasn't sent a heartbeat in this many milliseconds. Stale LIVE sessions
 * are filtered out of the active list and lazily marked ENDED.
 * Set to 30s — heartbeat fires every 15s so this gives 2 missed beats.
 */
const STALE_MS = 30_000;

@Injectable()
export class LiveService {
  constructor(private readonly prisma: PrismaService) {}

  /** Host begins (or resumes) broadcasting in a room. */
  async start(hostId: string, room: string, title?: string) {
    if (!room || !/^[\w.@:-]{3,128}$/.test(room)) {
      throw new BadRequestException('Invalid room name.');
    }
    const existing = await this.prisma.liveSession.findUnique({ where: { room } });
    if (existing && existing.hostId !== hostId && existing.status === 'LIVE') {
      // Someone else already owns this live room.
      throw new ForbiddenException('This live room is already in use.');
    }

    const session = await this.prisma.liveSession.upsert({
      where: { room },
      create: { room, hostId, title: title ?? null, status: 'LIVE' },
      update: { hostId, title: title ?? null, status: 'LIVE', endedAt: null, viewerCount: 0 },
    });
    return this.shape(session);
  }

  /** Host ends the broadcast. */
  async end(hostId: string, room: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { room } });
    if (!session) return { ok: true };
    if (session.hostId !== hostId) {
      throw new ForbiddenException('Only the broadcaster can end this live.');
    }
    await this.prisma.liveSession.update({
      where: { room },
      data: { status: 'ENDED', endedAt: new Date(), viewerCount: 0 },
    });
    return { ok: true };
  }

  /** Host keepalive — refreshes updatedAt and records the current viewer count. */
  async heartbeat(hostId: string, room: string, viewerCount?: number) {
    const session = await this.prisma.liveSession.findUnique({ where: { room } });
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

  private shapeWithHost(s: any) {
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
}
