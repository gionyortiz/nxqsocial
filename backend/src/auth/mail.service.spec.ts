import { MailService, verificationUrlFromEnvironment } from './mail.service';

describe('MailService', () => {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    APP_BASE_URL: process.env.APP_BASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.APP_BASE_URL = 'https://staging.nxqsocial.test';
  });

  afterEach(() => {
    restoreEnvironment('NODE_ENV', originalEnvironment.NODE_ENV);
    restoreEnvironment('APP_BASE_URL', originalEnvironment.APP_BASE_URL);
    restoreEnvironment('RESEND_API_KEY', originalEnvironment.RESEND_API_KEY);
    jest.restoreAllMocks();
  });

  function buildService() {
    process.env.RESEND_API_KEY = 're_test_key';
    const service = new MailService();
    const send = jest.fn<Promise<TestEmailResult>, [TestEmailMessage]>();
    Object.defineProperty(service, 'resend', {
      value: { emails: { send } },
      configurable: true,
    });
    return { service, send };
  }

  it.each([
    [
      'password reset',
      (service: MailService) =>
        service.sendPasswordReset(
          'user@example.test',
          'https://app.example.test/reset-password?token=test',
        ),
    ],
    [
      'verification reminder',
      (service: MailService) =>
        service.sendVerificationEmail('user@example.test', 'safe_user'),
    ],
  ])(
    'returns false when Resend resolves with an error for %s',
    async (_name, invoke) => {
      const { service, send } = buildService();
      send.mockResolvedValue({
        data: null,
        error: { message: 'provider unavailable', name: 'application_error' },
      });

      await expect(invoke(service)).resolves.toBe(false);
    },
  );

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

  it('derives the verification link from APP_BASE_URL and escapes the username', async () => {
    process.env.APP_BASE_URL = 'https://railway-staging.nxqsocial.com';
    const { service, send } = buildService();
    let deliveredMessage: TestEmailMessage | undefined;
    send.mockImplementation((message: TestEmailMessage) => {
      deliveredMessage = message;
      return Promise.resolve({ data: { id: 'email-1' }, error: null });
    });

    await service.sendVerificationEmail(
      'synthetic@staging.invalid',
      'fixture<script>',
    );

    expect(send).toHaveBeenCalledTimes(1);
    const html = deliveredMessage?.html ?? '';
    expect(html).toContain(
      'href="https://railway-staging.nxqsocial.com/verify"',
    );
    expect(html).toContain('@fixture&lt;script&gt;');
    expect(html).not.toContain('https://nxqsocial.com/verify');
    expect(html).not.toContain('<script>');
  });

  it('fails closed when APP_BASE_URL is missing in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APP_BASE_URL;

    expect(() => new MailService()).toThrow(
      'APP_BASE_URL is required to build verification email links in production',
    );
  });

  it.each([
    'http://staging.nxqsocial.com',
    'https://staging.nxqsocial.com/',
    'https://staging.nxqsocial.com/path',
    'https://user:password@staging.nxqsocial.com',
    'https://staging.nxqsocial.com?next=https://attacker.invalid',
  ])('rejects invalid production APP_BASE_URL %s', (appBaseUrl) => {
    expect(() =>
      verificationUrlFromEnvironment({
        NODE_ENV: 'production',
        APP_BASE_URL: appBaseUrl,
      }),
    ).toThrow('APP_BASE_URL must be an exact canonical HTTPS origin');
  });

  it('uses a local frontend fallback outside production', () => {
    expect(verificationUrlFromEnvironment({ NODE_ENV: 'test' })).toBe(
      'http://localhost:3001/verify',
    );
    expect(
      verificationUrlFromEnvironment({
        NODE_ENV: 'development',
        APP_BASE_URL: 'http://127.0.0.1:3100',
      }),
    ).toBe('http://127.0.0.1:3100/verify');
  });

  it('rejects non-local cleartext origins outside production', () => {
    expect(() =>
      verificationUrlFromEnvironment({
        NODE_ENV: 'development',
        APP_BASE_URL: 'http://staging.nxqsocial.test',
      }),
    ).toThrow('APP_BASE_URL must be an exact HTTPS origin');
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

interface TestEmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
}

interface TestEmailResult {
  data: { id: string } | null;
  error: { message: string; name: string } | null;
}
