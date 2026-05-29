import { Test } from '@nestjs/testing';
import { TrustEngineService } from './trust-engine.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

function makeUser(overrides: Partial<{
  verificationStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  phone: string | null;
  createdAt: Date;
  reportsReceived: { status: string }[];
}> = {}) {
  return {
    verificationStatus: 'UNVERIFIED',
    email: 'test@example.com',
    emailVerified: false,
    phone: null,
    phoneVerified: false,
    createdAt: new Date(),
    reportsReceived: [],
    ...overrides,
  };
}

describe('TrustEngineService', () => {
  let service: TrustEngineService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TrustEngineService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(TrustEngineService);
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
  });

  // ── Base tier scores ──────────────────────────────────────────────────────

  it('UNVERIFIED user with nothing gets 0', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(makeUser({ verificationStatus: 'UNVERIFIED' }));
    const score = await service.recalculate('u1');
    expect(score).toBe(0);
  });

  it('BASIC user gets base 10', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(makeUser({ verificationStatus: 'BASIC' }));
    const score = await service.recalculate('u1');
    expect(score).toBe(10);
  });

  it('ID_VERIFIED user gets base 70', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(makeUser({ verificationStatus: 'ID_VERIFIED' }));
    const score = await service.recalculate('u1');
    expect(score).toBe(70);
  });

  // ── Bonus fields ──────────────────────────────────────────────────────────

  it('+10 only when emailVerified is true', async () => {
    const withEmail = makeUser({ verificationStatus: 'BASIC', emailVerified: true });
    const withoutEmail = makeUser({ verificationStatus: 'BASIC', emailVerified: false });

    mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(withEmail);
    const scoreWith = await service.recalculate('u1');

    mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(withoutEmail);
    const scoreWithout = await service.recalculate('u1');

    expect(scoreWith - scoreWithout).toBe(10);
  });

  it('+5 only when phoneVerified is true', async () => {
    const withPhone = makeUser({ verificationStatus: 'BASIC', phoneVerified: true });
    const withoutPhone = makeUser({ verificationStatus: 'BASIC', phoneVerified: false });

    mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(withPhone);
    const scoreWith = await service.recalculate('u1');

    mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(withoutPhone);
    const scoreWithout = await service.recalculate('u1');

    expect(scoreWith - scoreWithout).toBe(5);
  });

  it('+20 for account older than 30 days', async () => {
    const old = makeUser({
      verificationStatus: 'BASIC',
      createdAt: new Date(Date.now() - 31 * 86_400_000),
    });
    const fresh = makeUser({ verificationStatus: 'BASIC' });

    mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(old);
    const scoreOld = await service.recalculate('u1');

    mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce(fresh);
    const scoreFresh = await service.recalculate('u1');

    expect(scoreOld - scoreFresh).toBe(20);
  });

  // ── Penalties ─────────────────────────────────────────────────────────────

  it('-20 per ACTION_TAKEN report', async () => {
    const user = makeUser({
      verificationStatus: 'ID_VERIFIED',
      emailVerified: true,
      reportsReceived: [{ status: 'ACTION_TAKEN' }, { status: 'ACTION_TAKEN' }],
    });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(user);
    const score = await service.recalculate('u1');
    // 70 + 10 = 80, -20 * 2 = 40
    expect(score).toBe(40);
  });

  it('-10 per REVIEWED report', async () => {
    const user = makeUser({
      verificationStatus: 'BASIC',
      reportsReceived: [{ status: 'REVIEWED' }],
    });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(user);
    const score = await service.recalculate('u1');
    // 10 - 10 = 0
    expect(score).toBe(0);
  });

  it('score is clamped to [0, 100]', async () => {
    const heavilyReported = makeUser({
      verificationStatus: 'BASIC',
      reportsReceived: Array(10).fill({ status: 'ACTION_TAKEN' }),
    });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(heavilyReported);
    const score = await service.recalculate('u1');
    expect(score).toBe(0);

    const perfectUser = makeUser({
      verificationStatus: 'BUSINESS_VERIFIED',
      emailVerified: true,
      phoneVerified: true,
      createdAt: new Date(Date.now() - 60 * 86_400_000),
    });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(perfectUser);
    const maxScore = await service.recalculate('u1');
    expect(maxScore).toBeLessThanOrEqual(100);
  });

  // ── band() ────────────────────────────────────────────────────────────────

  it('returns correct bands', () => {
    expect(TrustEngineService.band(95)).toBe('Excellent');
    expect(TrustEngineService.band(75)).toBe('Good');
    expect(TrustEngineService.band(50)).toBe('Fair');
    expect(TrustEngineService.band(30)).toBe('Low');
    expect(TrustEngineService.band(10)).toBe('Very Low');
  });
});
