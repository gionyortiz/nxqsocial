import { Test } from '@nestjs/testing';
import { SafetyService } from './safety.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  safetyFlag: {
    createMany: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

describe('SafetyService', () => {
  let service: SafetyService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SafetyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(SafetyService);
    jest.clearAllMocks();
  });

  // ── scan() ────────────────────────────────────────────────────────────────

  it('returns safe for clean text', () => {
    const result = service.scan('Beautiful sunset photo from my holiday!');
    expect(result.safe).toBe(true);
    expect(result.riskScore).toBe(0);
    expect(result.flags).toHaveLength(0);
  });

  it('detects phishing keywords', () => {
    const result = service.scan('Urgent: verify your wallet immediately or lose access!');
    expect(result.safe).toBe(false);
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.flags.some(f => f.type === 'phishing' || f.type === 'urgency_manipulation')).toBe(true);
  });

  it('detects crypto scam patterns', () => {
    const result = service.scan('Send 0.1 ETH to this address and get 2x back! Bitcoin giveaway NOW!');
    expect(result.safe).toBe(false);
    expect(result.riskScore).toBeGreaterThan(50);
    expect(result.flags.some(f => f.type === 'crypto_scam')).toBe(true);
  });

  it('detects fake giveaway', () => {
    const result = service.scan('Congratulations! You have won a prize. Claim your prize now — DM me!');
    expect(result.safe).toBe(false);
    expect(result.flags.some(f => f.type === 'fake_giveaway')).toBe(true);
  });

  it('detects suspicious URL shorteners', () => {
    const result = service.scan('Check this out: https://bit.ly/abc123xyz');
    expect(result.safe).toBe(false);
    expect(result.flags.some(f => f.type === 'suspicious_url')).toBe(true);
  });

  it('accumulates risk scores across multiple flag types', () => {
    const result = service.scan(
      'Send 0.5 BTC to win! Urgent act now! Visit bit.ly/win now!',
    );
    expect(result.riskScore).toBeGreaterThan(50);
  });

  it('is case-insensitive', () => {
    const result = service.scan('SEND 0.5 BTC AND GET 2X BACK!!');
    expect(result.safe).toBe(false);
  });

  // ── scanAndPersist() ──────────────────────────────────────────────────────

  it('creates SafetyFlag records when unsafe', async () => {
    mockPrisma.safetyFlag.createMany.mockResolvedValue({ count: 1 });

    await service.scanAndPersist('post', 'post-123', 'Send 0.5 BTC to get rich!');
    expect(mockPrisma.safetyFlag.createMany).toHaveBeenCalled();
  });

  it('does not create SafetyFlag for clean content', async () => {
    await service.scanAndPersist('post', 'post-123', 'Great day out in the park!');
    expect(mockPrisma.safetyFlag.createMany).not.toHaveBeenCalled();
  });

  // ── getPendingFlags() ─────────────────────────────────────────────────────

  it('returns only unresolved flags', async () => {
    const flags = [{ id: 'f1', resolvedAt: null }, { id: 'f2', resolvedAt: null }];
    mockPrisma.safetyFlag.findMany.mockResolvedValue(flags);

    const result = await service.getPendingFlags();
    expect(result).toHaveLength(2);
    expect(mockPrisma.safetyFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { resolvedAt: null } }),
    );
  });

  // ── resolveFlag() ─────────────────────────────────────────────────────────

  it('sets resolvedAt on a flag', async () => {
    mockPrisma.safetyFlag.update.mockResolvedValue({ id: 'f1', resolvedAt: new Date() });
    const result = await service.resolveFlag('f1');
    expect(mockPrisma.safetyFlag.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f1' } }),
    );
    expect(result.resolvedAt).toBeDefined();
  });
});
