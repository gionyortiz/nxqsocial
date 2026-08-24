import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';

describe('NotificationsService email delivery', () => {
  function buildService() {
    const config = {
      get: jest.fn((name: string, fallback?: string) => {
        if (name === 'RESEND_API_KEY') return 're_test_key';
        if (name === 'EMAIL_FROM') return 'noreply@example.test';
        return fallback;
      }),
    } as unknown as ConfigService;
    const service = new NotificationsService(config, {} as any);
    const send = jest.fn();
    (service as any).resend = { emails: { send } };
    return { service, send };
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
});
