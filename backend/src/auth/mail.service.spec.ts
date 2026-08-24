import { MailService } from './mail.service';

describe('MailService Resend result handling', () => {
  const originalKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  function buildService() {
    process.env.RESEND_API_KEY = 're_test_key';
    const service = new MailService();
    const send = jest.fn();
    (service as any).resend = { emails: { send } };
    return { service, send };
  }

  it.each([
    ['password reset', (service: MailService) =>
      service.sendPasswordReset(
        'user@example.test',
        'https://app.example.test/reset-password?token=test',
      )],
    ['verification reminder', (service: MailService) =>
      service.sendVerificationEmail('user@example.test', 'safe_user')],
  ])('returns false when Resend resolves with an error for %s', async (_name, invoke) => {
    const { service, send } = buildService();
    send.mockResolvedValue({
      data: null,
      error: { message: 'provider unavailable', name: 'application_error' },
    });

    await expect(invoke(service)).resolves.toBe(false);
  });

  it('returns true only after a provider-confirmed send', async () => {
    const { service, send } = buildService();
    send.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    await expect(
      service.sendPasswordReset(
        'user@example.test',
        'https://app.example.test/reset-password?token=test',
      ),
    ).resolves.toBe(true);
  });
});
