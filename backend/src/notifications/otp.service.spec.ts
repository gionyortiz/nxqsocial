import { Test } from '@nestjs/testing';
import { OtpService } from './otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { TrustEngineService } from '../trust-engine/trust-engine.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../redis/redis.module';

const mockPrisma = {
  user: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  otpCode: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockNotifications = {
  sendEmailOtp: jest.fn().mockResolvedValue(undefined),
  sendPhoneOtp: jest.fn().mockResolvedValue(undefined),
};

const mockTrustEngine = {
  recalculate: jest.fn().mockResolvedValue(55),
};

const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(60),
  eval: jest.fn().mockResolvedValue(1),
};

const mockConfig = {
  get: (key: string, fallback = ''): string =>
    key === 'OTP_PEPPER'
      ? 'unit-test-otp-pepper-with-sufficient-entropy'
      : fallback,
};

describe('OtpService', () => {
  let service: OtpService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: TrustEngineService, useValue: mockTrustEngine },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(OtpService);
    jest.clearAllMocks();
    mockPrisma.otpCode.create.mockResolvedValue({ id: 'otp-1' });
    mockPrisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.update.mockResolvedValue({});
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(1);
  });

  // ── sendEmailOtp ──────────────────────────────────────────────────────────

  it('throws if email already verified', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'a@b.com',
      username: 'alice',
      emailVerified: true,
    });
    await expect(service.sendEmailOtp('u1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates OTP record and calls email sender', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'a@b.com',
      username: 'alice',
      emailVerified: false,
    });
    const result = await service.sendEmailOtp('u1');
    expect(result.sent).toBe(true);
    expect(result.channel).toBe('email');
    expect(mockPrisma.otpCode.create).toHaveBeenCalledTimes(1);
    expect(mockNotifications.sendEmailOtp).toHaveBeenCalledWith(
      'a@b.com',
      expect.stringMatching(/^\d{6}$/),
      'alice',
    );
  });

  // ── sendPhoneOtp ──────────────────────────────────────────────────────────

  it('throws if no phone number on account', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      phone: null,
      username: 'alice',
      phoneVerified: false,
    });
    await expect(service.sendPhoneOtp('u1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws if phone already verified', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      phone: '+1234',
      username: 'alice',
      phoneVerified: true,
    });
    await expect(service.sendPhoneOtp('u1')).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── verifyOtp ─────────────────────────────────────────────────────────────

  it('throws if no active OTP found', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue(null);
    await expect(service.verifyOtp('u1', 'email', '123456')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws if code does not match', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '999999',
      createdAt: new Date(),
    });
    await expect(service.verifyOtp('u1', 'email', '123456')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('expires a code after five incorrect attempts', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-limited',
      code: '999999',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 600_000),
    });
    mockRedis.eval
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5);

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(service.verifyOtp('u1', 'email', '123456')).rejects.toThrow(
        'Invalid verification code',
      );
    }

    await expect(
      service.verifyOtp('u1', 'email', '123456'),
    ).rejects.toMatchObject({ status: 429 });
    expect(mockPrisma.otpCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'otp-limited', used: false },
      data: { used: true },
    });
  });

  it('fails closed when the durable attempt counter is unavailable', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '123456',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 600_000),
    });
    mockRedis.eval.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      service.verifyOtp('u1', 'email', '123456'),
    ).rejects.toMatchObject({ status: 503 });
    expect(mockPrisma.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('rejects legacy plaintext codes older than the ten-minute compatibility window', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-old',
      code: '123456',
      createdAt: new Date(Date.now() - 10 * 60 * 1000 - 1),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyOtp('u1', 'email', '123456')).rejects.toThrow(
      'Invalid verification code',
    );
  });

  it('marks OTP used and sets emailVerified on success', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '654321',
      createdAt: new Date(),
    });

    const result = await service.verifyOtp('u1', 'email', '654321');

    expect(mockPrisma.otpCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'otp-1', used: false },
        data: { used: true },
      }),
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { emailVerified: true, emailVerificationRequired: false },
      }),
    );
    expect(result.verified).toBe(true);
    expect(result.channel).toBe('email');
    expect(mockTrustEngine.recalculate).toHaveBeenCalledWith('u1');
  });

  it('sets phoneVerified on successful phone OTP', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-2',
      code: '111222',
      createdAt: new Date(),
    });

    await service.verifyOtp('u1', 'phone', '111222');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phoneVerified: true } }),
    );
  });
});
