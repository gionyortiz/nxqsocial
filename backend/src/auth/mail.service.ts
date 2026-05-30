import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.from = process.env.MAIL_FROM ?? 'NXQ Social <onboarding@resend.dev>';
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged, not sent.');
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
      return;
    }

    try {
      await this.resend.emails.send({ from: this.from, to, subject, html });
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${to}`, err as any);
    }
  }
}
