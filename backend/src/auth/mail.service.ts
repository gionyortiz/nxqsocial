import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly verificationUrl: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.from =
      process.env.EMAIL_FROM ??
      process.env.MAIL_FROM ??
      'NXQ Social <onboarding@resend.dev>';
    this.verificationUrl = verificationUrlFromEnvironment(process.env);
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY not set — emails will be logged, not sent.',
      );
    }
  }

  async sendPasswordReset(to: string, resetUrl: string) {
    const subject = 'Reset your NXQ Social password';
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#7c3aed;margin:0 0 12px;">Reset your password</h2>
        <p style="color:#374151;font-size:15px;line-height:1.6;">
          We received a request to reset your NXQ Social password. Click the button below to choose a new one.
          This link expires in 1 hour.
        </p>
        <p style="margin:24px 0;">
          <a href="${resetUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;
             padding:12px 24px;border-radius:9999px;font-weight:600;display:inline-block;">
            Reset password
          </a>
        </p>
        <p style="color:#9ca3af;font-size:13px;line-height:1.6;">
          If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
        <p style="color:#9ca3af;font-size:12px;word-break:break-all;">${resetUrl}</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.log(`[DEV] Password reset link for ${to}: ${resetUrl}`);
      return true;
    }

    try {
      const result = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      if (result.error) {
        this.logger.error(`Reset email provider rejected delivery to ${to}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${to}`, err);
      return false;
    }
  }

  async sendVerificationEmail(to: string, username: string) {
    const subject = 'Verify your NXQ Social email';
    const safeUsername = escapeHtml(username);
    const safeVerificationUrl = escapeHtml(this.verificationUrl);
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#7c3aed;margin:0 0 12px;">Verify your email, @${safeUsername}</h2>
        <p style="color:#374151;font-size:15px;line-height:1.6;">
          An admin has requested that you verify your email address on NXQ Social.
          Please log in and go to Settings → Verify to complete the process.
        </p>
        <p style="margin:24px 0;">
          <a href="${safeVerificationUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;
             padding:12px 24px;border-radius:9999px;font-weight:600;display:inline-block;">
            Go to Verify
          </a>
        </p>
        <p style="color:#9ca3af;font-size:13px;">NXQ Social Trust &amp; Safety Team</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.log(`[DEV] Verification email for ${to}`);
      return true;
    }

    try {
      const result = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      if (result.error) {
        this.logger.error(
          `Verification email provider rejected delivery to ${to}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${to}`, err);
      return false;
    }
  }
}

type MailEnvironment = Record<string, string | undefined>;

/**
 * Resolve the public verification route without ever falling back to the
 * production hostname. Production accepts only an exact canonical HTTPS
 * origin. Development and tests may use an exact localhost HTTP origin and
 * otherwise default to the local frontend.
 */
export function verificationUrlFromEnvironment(
  environment: MailEnvironment,
): string {
  const production = environment.NODE_ENV?.trim() === 'production';
  const configured = environment.APP_BASE_URL?.trim();
  const baseUrl = configured || (production ? '' : 'http://localhost:3001');

  if (!baseUrl) {
    throw new Error(
      'APP_BASE_URL is required to build verification email links in production',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(
      'APP_BASE_URL must be an exact canonical HTTPS origin for verification email links',
    );
  }

  const canonicalOrigin = parsed.origin;
  const isExactOrigin =
    baseUrl === canonicalOrigin &&
    parsed.pathname === '/' &&
    !parsed.username &&
    !parsed.password &&
    !parsed.search &&
    !parsed.hash;
  const isHttps = parsed.protocol === 'https:';
  const isLocalDevelopmentHttp =
    !production &&
    parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);

  if (!isExactOrigin || (!isHttps && !isLocalDevelopmentHttp)) {
    throw new Error(
      production
        ? 'APP_BASE_URL must be an exact canonical HTTPS origin for verification email links'
        : 'APP_BASE_URL must be an exact HTTPS origin or localhost HTTP origin for verification email links',
    );
  }

  return `${canonicalOrigin}/verify`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}
