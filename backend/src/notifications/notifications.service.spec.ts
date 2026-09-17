import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { NotificationsService } from './notifications.service';

describe('NotificationsService email delivery', () => {
  function buildService(overrides: Record<string, string | undefined> = {}) {
    const values: Record<string, string | undefined> = {
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'noreply@example.test',
      ...overrides,
    };
    const config = {
      get: jest.fn((name: string, fallback?: string) => {
        return values[name] ?? fallback;
      }),
    } as unknown as ConfigService;
    const redis = {
      smembers: jest.fn(),
      srem: jest.fn(),
    };
    const service = new NotificationsService(config, redis as unknown as Redis);
    const send = jest.fn();
    Object.defineProperty(service, 'resend', {
      value: { emails: { send } },
      configurable: true,
    });
    return { service, send, redis };
  }

  it('accepts a provider-confirmed email send', async () => {
    const { service, send } = buildService();
    send.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    await expect(
      service.sendEmailOtp('user@example.test', '123456', 'user'),
    ).resolves.toBeUndefined();
  });

  it('rejects when Resend resolves with an error result', async () => {
    const { service, send } = buildService();
    send.mockResolvedValue({
      data: null,
      error: { message: 'provider unavailable', name: 'application_error' },
    });

    await expect(
      service.sendEmailOtp('user@example.test', '123456', 'user'),
    ).rejects.toThrow('Email OTP delivery failed');
  });

  it('does not deliver OTP email to a restored customer in staging', async () => {
    const { service, send } = buildService({
      NXQ_RELEASE_TARGET: 'staging',
      STAGING_EMAIL_RECIPIENT_ALLOWLIST: 'operator@nxqsocial.test',
      STAGING_PUSH_TOKEN_ALLOWLIST: 'disabled',
    });

    await expect(
      service.sendEmailOtp('restored-customer@example.test', '123456', 'user'),
    ).rejects.toThrow(
      'Email OTP delivery is disabled for this staging recipient',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('does not call Expo when staging push delivery is disabled', async () => {
    const { service, redis } = buildService({
      NXQ_RELEASE_TARGET: 'staging',
      STAGING_EMAIL_RECIPIENT_ALLOWLIST: 'operator@nxqsocial.test',
      STAGING_PUSH_TOKEN_ALLOWLIST: 'disabled',
    });
    redis.smembers.mockResolvedValue(['ExponentPushToken[restored-device]']);
    const fetchSpy = jest.spyOn(global, 'fetch');

    await service.sendPushToUsers(['restored-user'], {
      title: 'NXQ Social',
      body: 'A restored-user notification',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does not call Twilio for a non-allowlisted staging phone recipient', async () => {
    const { service } = buildService({
      NXQ_RELEASE_TARGET: 'staging',
      STAGING_EMAIL_RECIPIENT_ALLOWLIST: 'operator@nxqsocial.test',
      STAGING_PHONE_RECIPIENT_ALLOWLIST: 'disabled',
      STAGING_PUSH_TOKEN_ALLOWLIST: 'disabled',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'twilio-test-token',
      TWILIO_FROM_NUMBER: '+15550000000',
    });
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      service.sendPhoneOtp('+15551234567', '123456'),
    ).rejects.toThrow(
      'Phone OTP delivery is disabled for this staging recipient',
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
