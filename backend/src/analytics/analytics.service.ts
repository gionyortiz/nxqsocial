import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackEventDto } from './analytics.dto';

const FUNNEL_EVENTS = [
  'signup_started',
  'signup_completed',
  'profile_completed',
  'first_post_created',
  'first_reel_created',
  'first_call_started',
  'first_call_completed',
  'first_live_started',
  'first_live_joined',
  'verification_started',
  'verification_completed',
] as const;

const PROFILE_EVENTS = [
  'avatar_added',
  'banner_added',
  'bio_added',
  'website_added',
  'verification_started',
  'verification_completed',
] as const;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async track(dto: TrackEventDto, userId?: string | null) {
    return this.prisma.analyticsEvent.create({
      data: {
        name: dto.name,
        sessionId: dto.sessionId,
        properties: dto.properties as any,
        userId: userId ?? undefined,
      },
      select: { id: true },
    });
  }

  async dashboard(days = 30) {
    const safeDays = Math.max(1, Math.min(90, Number(days) || 30));
    const now = new Date();
    const rangeStart = startOfDay(addDays(now, -(safeDays - 1)));

    const [
      eventsInRange,
      registrationsInRange,
      postsInRange,
      reportsInRange,
      verificationInRange,
      liveInRange,
      dauEvents,
      mauEvents,
      registrationsTotal,
      postsTotal,
      reelsTotal,
      liveTotal,
      reportsTotal,
      verificationTotal,
      allProfileRows,
      signupEvents,
      activityEvents,
      funnelEvents,
    ] = await Promise.all([
      this.prisma.analyticsEvent.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { name: true, userId: true, createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
      this.prisma.post.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true, type: true },
      }),
      this.prisma.report.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
      this.prisma.verification.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
      this.prisma.liveSession.findMany({
        where: { startedAt: { gte: rangeStart } },
        select: { startedAt: true },
      }),
      this.prisma.analyticsEvent.findMany({
        where: { createdAt: { gte: startOfDay(now) }, userId: { not: null } },
        select: { userId: true },
      }),
      this.prisma.analyticsEvent.findMany({
        where: { createdAt: { gte: addDays(startOfDay(now), -29) }, userId: { not: null } },
        select: { userId: true },
      }),
      this.prisma.user.count(),
      this.prisma.post.count(),
      this.prisma.post.count({ where: { type: { in: ['VIDEO', 'SHORT_VIDEO'] } } }),
      this.prisma.liveSession.count(),
      this.prisma.report.count(),
      this.prisma.verification.count(),
      this.prisma.user.findMany({
        select: {
          profile: { select: { avatarUrl: true, bannerUrl: true, bio: true, website: true } },
          verificationStatus: true,
        },
      }),
      this.prisma.analyticsEvent.findMany({
        where: { name: 'signup_completed', userId: { not: null }, createdAt: { gte: addDays(startOfDay(now), -14) } },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.analyticsEvent.findMany({
        where: { userId: { not: null }, createdAt: { gte: addDays(startOfDay(now), -30) } },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.analyticsEvent.findMany({
        where: { name: { in: [...FUNNEL_EVENTS] } },
        select: { name: true, userId: true, sessionId: true },
      }),
    ]);

    const daysList: string[] = [];
    const dailyMap = new Map<string, {
      date: string;
      registrations: number;
      posts: number;
      reels: number;
      callsStarted: number;
      callsCompleted: number;
      liveSessionsStarted: number;
      liveViewersJoined: number;
      verificationRequests: number;
      reportsSubmitted: number;
    }>();

    for (let i = 0; i < safeDays; i++) {
      const d = addDays(rangeStart, i);
      const key = dayKey(d);
      daysList.push(key);
      dailyMap.set(key, {
        date: key,
        registrations: 0,
        posts: 0,
        reels: 0,
        callsStarted: 0,
        callsCompleted: 0,
        liveSessionsStarted: 0,
        liveViewersJoined: 0,
        verificationRequests: 0,
        reportsSubmitted: 0,
      });
    }

    for (const r of registrationsInRange) {
      const key = dayKey(r.createdAt);
      const row = dailyMap.get(key);
      if (row) row.registrations += 1;
    }

    for (const p of postsInRange) {
      const key = dayKey(p.createdAt);
      const row = dailyMap.get(key);
      if (!row) continue;
      row.posts += 1;
      if (p.type === 'VIDEO' || p.type === 'SHORT_VIDEO') row.reels += 1;
    }

    for (const r of reportsInRange) {
      const key = dayKey(r.createdAt);
      const row = dailyMap.get(key);
      if (row) row.reportsSubmitted += 1;
    }

    for (const v of verificationInRange) {
      const key = dayKey(v.createdAt);
      const row = dailyMap.get(key);
      if (row) row.verificationRequests += 1;
    }

    for (const l of liveInRange) {
      const key = dayKey(l.startedAt);
      const row = dailyMap.get(key);
      if (row) row.liveSessionsStarted += 1;
    }

    for (const e of eventsInRange) {
      const key = dayKey(e.createdAt);
      const row = dailyMap.get(key);
      if (!row) continue;
      if (e.name === 'call_started' || e.name === 'first_call_started') row.callsStarted += 1;
      if (e.name === 'call_completed' || e.name === 'first_call_completed') row.callsCompleted += 1;
      if (e.name === 'live_joined' || e.name === 'first_live_joined') row.liveViewersJoined += 1;
    }

    const dau = new Set(dauEvents.map((e) => e.userId).filter(Boolean)).size;
    const mau = new Set(mauEvents.map((e) => e.userId).filter(Boolean)).size;

    const funnel: Record<string, number> = {};
    for (const name of FUNNEL_EVENTS) {
      const rows = funnelEvents.filter((e) => e.name === name);
      const hasUser = rows.some((e) => !!e.userId);
      funnel[name] = hasUser
        ? new Set(rows.map((e) => e.userId).filter(Boolean)).size
        : rows.length;
    }

    const profileCompletion = {
      usersTotal: allProfileRows.length,
      avatarAdded: allProfileRows.filter((u) => !!u.profile?.avatarUrl).length,
      bannerAdded: allProfileRows.filter((u) => !!u.profile?.bannerUrl).length,
      bioAdded: allProfileRows.filter((u) => !!u.profile?.bio?.trim()).length,
      websiteAdded: allProfileRows.filter((u) => !!u.profile?.website?.trim()).length,
      verificationStarted: funnel.verification_started ?? 0,
      verificationCompleted: allProfileRows.filter((u) => ['HUMAN_VERIFIED', 'ID_VERIFIED', 'BUSINESS_VERIFIED'].includes(u.verificationStatus)).length,
      profileCompleted: allProfileRows.filter((u) =>
        !!u.profile?.avatarUrl && !!u.profile?.bannerUrl && !!u.profile?.bio?.trim() && !!u.profile?.website?.trim(),
      ).length,
    };

    const activityByUser = new Map<string, Set<string>>();
    for (const e of activityEvents) {
      if (!e.userId) continue;
      const set = activityByUser.get(e.userId) ?? new Set<string>();
      set.add(dayKey(e.createdAt));
      activityByUser.set(e.userId, set);
    }

    const retentionCohort = signupEvents.length;
    let d1 = 0;
    let d3 = 0;
    let d7 = 0;

    for (const s of signupEvents) {
      if (!s.userId) continue;
      const active = activityByUser.get(s.userId) ?? new Set<string>();
      if (active.has(dayKey(addDays(startOfDay(s.createdAt), 1)))) d1 += 1;
      if (active.has(dayKey(addDays(startOfDay(s.createdAt), 3)))) d3 += 1;
      if (active.has(dayKey(addDays(startOfDay(s.createdAt), 7)))) d7 += 1;
    }

    const retention = {
      cohort: retentionCohort,
      day1: { users: d1, rate: retentionCohort ? Math.round((d1 / retentionCohort) * 1000) / 10 : 0 },
      day3: { users: d3, rate: retentionCohort ? Math.round((d3 / retentionCohort) * 1000) / 10 : 0 },
      day7: { users: d7, rate: retentionCohort ? Math.round((d7 / retentionCohort) * 1000) / 10 : 0 },
    };

    const profileEvents = await this.prisma.analyticsEvent.findMany({
      where: { name: { in: [...PROFILE_EVENTS] }, createdAt: { gte: rangeStart } },
      select: { name: true },
    });

    const kpis = {
      dau,
      mau,
      registrations: registrationsTotal,
      newRegistrations: registrationsInRange.length,
      postsCreated: postsInRange.length,
      reelsCreated: postsInRange.filter((p) => p.type === 'VIDEO' || p.type === 'SHORT_VIDEO').length,
      callsStarted: eventsInRange.filter((e) => e.name === 'call_started' || e.name === 'first_call_started').length,
      callsCompleted: eventsInRange.filter((e) => e.name === 'call_completed' || e.name === 'first_call_completed').length,
      liveSessionsStarted: liveInRange.length,
      liveViewersJoined: eventsInRange.filter((e) => e.name === 'live_joined' || e.name === 'first_live_joined').length,
      verificationRequests: verificationInRange.length,
      reportsSubmitted: reportsInRange.length,
      totals: {
        users: registrationsTotal,
        posts: postsTotal,
        reels: reelsTotal,
        liveSessions: liveTotal,
        reports: reportsTotal,
        verificationRequests: verificationTotal,
      },
    };

    return {
      range: {
        days: safeDays,
        start: rangeStart,
        end: now,
      },
      kpis,
      funnel,
      profileCompletion,
      retention,
      daily: daysList.map((d) => dailyMap.get(d)!),
      profileEventsVolume: profileEvents.reduce<Record<string, number>>((acc, e) => {
        acc[e.name] = (acc[e.name] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }
}
