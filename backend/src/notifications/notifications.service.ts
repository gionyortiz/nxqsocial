import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private resend: Resend;

  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY', 're_placeholder'));
  }

  async sendEmailOtp(to: string, code: string, username: string) {
    const from = this.config.get<string>('EMAIL_FROM', 'noreply@nxqsocial.com');
    try {
      await this.resend.emails.send({
        from,
        to,
        subject: `Your NXQ Social verification code: ${code}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#7c3aed">NXQ Social</h2>
            <p>Hi <strong>${username}</strong>,</p>
            <p>Your email verification code is:</p>
            <div style="font-size:2.5rem;font-weight:bold;letter-spacing:0.3rem;color:#7c3aed;padding:16px 0">${code}</div>
            <p>This code expires in <strong>10 minutes</strong>.</p>
            <p style="color:#9ca3af;font-size:0.85rem">If you did not request this, please ignore this email.</p>
          </div>
        `,
      });
      this.logger.log(`Email OTP sent to ${to}`);
    } catch (err: any) {
      this.logger.error(`Failed to send email OTP to ${to}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Phone OTP via Twilio.
   * Twilio is not installed by default — this will use the REST API directly
   * so we don't add another dependency.
   */
  async sendPhoneOtp(to: string, code: string) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID', '');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN', '');
    const from = this.config.get<string>('TWILIO_FROM_NUMBER', '');

    if (!accountSid || !authToken || !from) {
      this.logger.warn('Twilio not configured — phone OTP skipped');
      return;
    }

    const body = `Your NXQ Social code is: ${code}. Expires in 10 minutes.`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const encoded = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${encoded}`,
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Failed to send phone OTP to ${to}: ${err}`);
      throw new Error('Phone OTP delivery failed');
    }
    this.logger.log(`Phone OTP sent to ${to}`);
  }
}
