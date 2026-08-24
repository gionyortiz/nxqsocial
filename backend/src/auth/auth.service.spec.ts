import { ConflictException } from '@nestjs/common';
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
