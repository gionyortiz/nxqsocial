import { Test } from '@nestjs/testing';
import { OtpService } from './otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { TrustEngineService } from '../trust-engine/trust-engine.service';
import { BadRequestException } from '@nestjs/common';

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

describe('OtpService', () => {
  let service: OtpService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: TrustEngineService, useValue: mockTrustEngine },
      ],
    }).compile();

    service = module.get(OtpService);
    jest.clearAllMocks();
    mockPrisma.otpCode.create.mockResolvedValue({ id: 'otp-1' });
    mockPrisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.user.update.mockResolvedValue({});
  });

  // ── sendEmailOtp ──────────────────────────────────────────────────────────

  it('throws if email already verified', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'a@b.com', username: 'alice', emailVerified: true,
    });
    await expect(service.sendEmailOtp('u1')).rejects.toThrow(BadRequestException);
  });

  it('creates OTP record and calls email sender', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'a@b.com', username: 'alice', emailVerified: false,
    });
    const result = await service.sendEmailOtp('u1');
    expect(result.sent).toBe(true);
    expect(result.channel).toBe('email');
    expect(mockPrisma.otpCode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: 'email' }) }),
    );
    expect(mockNotifications.sendEmailOtp).toHaveBeenCalled();
  });

  // ── sendPhoneOtp ──────────────────────────────────────────────────────────

  it('throws if no phone number on account', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      phone: null, username: 'alice', phoneVerified: false,
    });
    await expect(service.sendPhoneOtp('u1')).rejects.toThrow(BadRequestException);
  });

  it('throws if phone already verified', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      phone: '+1234', username: 'alice', phoneVerified: true,
    });
    await expect(service.sendPhoneOtp('u1')).rejects.toThrow(BadRequestException);
  });

  // ── verifyOtp ─────────────────────────────────────────────────────────────

  it('throws if no active OTP found', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue(null);
    await expect(service.verifyOtp('u1', 'email', '123456')).rejects.toThrow(BadRequestException);
  });

  it('throws if code does not match', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-1', code: '999999',
    });
    await expect(service.verifyOtp('u1', 'email', '123456')).rejects.toThrow(BadRequestException);
  });

  it('marks OTP used and sets emailVerified on success', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-1', code: '654321',
    });
    mockPrisma.otpCode.update.mockResolvedValue({});

    const result = await service.verifyOtp('u1', 'email', '654321');

    expect(mockPrisma.otpCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { used: true } }),
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailVerified: true } }),
    );
    expect(result.verified).toBe(true);
    expect(result.channel).toBe('email');
    expect(mockTrustEngine.recalculate).toHaveBeenCalledWith('u1');
  });

  it('sets phoneVerified on successful phone OTP', async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp-2', code: '111222',
    });
    mockPrisma.otpCode.update.mockResolvedValue({});

    await service.verifyOtp('u1', 'phone', '111222');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phoneVerified: true } }),
    );
  });
});
