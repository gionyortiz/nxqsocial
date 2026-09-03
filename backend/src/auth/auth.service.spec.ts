import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService registration commit semantics', () => {
  const originalHardening = process.env.SIGNUP_HARDENING_ENABLED;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalHardening === undefined) {
      delete process.env.SIGNUP_HARDENING_ENABLED;
    } else {
      process.env.SIGNUP_HARDENING_ENABLED = originalHardening;
    }
  });

  function buildService() {
    process.env.SIGNUP_HARDENING_ENABLED = 'false';
    const user = {
      id: 'user-1',
      email: 'new@example.test',
      username: 'new_user',
      role: 'USER',
      verificationStatus: 'BASIC',
      trustScore: 10,
      emailVerified: false,
      emailVerificationRequired: false,
      phoneVerified: false,
      createdAt: new Date('2026-08-24T00:00:00Z'),
      updatedAt: new Date('2026-08-24T00:00:00Z'),
      profile: {
        displayName: 'New User',
        bio: null,
        avatarUrl: null,
        bannerUrl: null,
        location: null,
        website: null,
      },
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(user),
      },
      analyticsEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const jwt = { sign: jest.fn().mockReturnValue('access-token') };
    const service = new AuthService(
      prisma as any,
      jwt as any,
      {} as any,
      {} as any,
      { verifySignup: jest.fn() } as any,
      { get: jest.fn((_key, fallback) => fallback) } as any,
    );
    return { service, prisma, user };
  }

  const registration = {
    email: 'new@example.test',
    username: 'New_User',
    displayName: 'New User',
    password: 'Strong-Passw0rd!',
  };

  it('maps a concurrent unique-constraint race to a 409 conflict', async () => {
    const { service, prisma } = buildService();
    prisma.user.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(service.register(registration as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('does not report a committed registration as failed when analytics is unavailable', async () => {
    const { service, prisma, user } = buildService();
    prisma.analyticsEvent.create.mockRejectedValueOnce(
      new Error('analytics unavailable'),
    );

    await expect(service.register(registration as any)).resolves.toEqual({
      access_token: 'access-token',
      user: expect.objectContaining({ id: user.id, email: user.email }),
    });
  });
});

describe('AuthService password reset delivery', () => {
  function buildService({ userExists = true, accepted = true } = {}) {
    const user = userExists
      ? { id: 'user-1', email: 'user@example.test' }
      : null;
    let idempotentToken: Record<string, unknown> | null = null;
    const passwordResetToken = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'reset-1' }),
      upsert: jest.fn().mockImplementation(({ where, create, update }) => {
        if (idempotentToken?.tokenHash === where.tokenHash) {
          idempotentToken = { ...idempotentToken, ...update };
        } else {
          idempotentToken = { id: 'reset-idempotent', ...create };
        }
        return Promise.resolve(idempotentToken);
      }),
      delete: jest.fn().mockResolvedValue({ id: 'reset-1' }),
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      passwordResetToken,
      $transaction: jest.fn((action) => action(prisma)),
    };
    const mail = {
      sendPasswordReset: jest.fn().mockResolvedValue(accepted),
    };
    const service = new AuthService(
      prisma as any,
      {} as any,
      mail as any,
      {} as any,
      {} as any,
      {
        get: jest.fn(
          () => 'fixture-password-reset-pepper-which-is-long-enough',
        ),
      } as any,
    );
    return { service, prisma, mail };
  }

  it('returns the same public response for an unknown email', async () => {
    const { service, prisma, mail } = buildService({ userExists: false });

    await expect(
      service.forgotPassword({ email: 'missing@example.test' }),
    ).resolves.toEqual({
      message: 'If that email is registered, a reset link has been sent.',
    });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('removes an undelivered reset token without changing the public response', async () => {
    const { service, prisma } = buildService({ accepted: false });

    await expect(
      service.forgotPassword({ email: 'user@example.test' }),
    ).resolves.toEqual({
      message: 'If that email is registered, a reset link has been sent.',
    });
    expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({
      where: { id: 'reset-1' },
    });
  });

  it('reuses the same token and provider idempotency key for a transport replay', async () => {
    const { service, prisma, mail } = buildService();
    const key = 'nxq-reset-11111111-1111-4111-8111-111111111111';

    await service.forgotPassword({ email: 'user@example.test' }, key);
    await service.forgotPassword({ email: 'user@example.test' }, key);

    expect(prisma.passwordResetToken.upsert).toHaveBeenCalledTimes(2);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(2);
    expect(mail.sendPasswordReset.mock.calls[0][1]).toBe(
      mail.sendPasswordReset.mock.calls[1][1],
    );
    expect(mail.sendPasswordReset.mock.calls[0][2]).toBe(key);
    expect(mail.sendPasswordReset.mock.calls[1][2]).toBe(key);
  });

  it('rejects malformed idempotency keys before querying an account', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.forgotPassword(
        { email: 'user@example.test' },
        'attacker-controlled-value',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
