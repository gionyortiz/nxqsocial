import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  allowedTurnstileHostnames,
  turnstileTestBypassEnabled,
} from './signup-hardening.config';

interface TurnstileResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EXPECTED_ACTION = 'register';
const VERIFY_TIMEOUT_MS = 5000;

@Injectable()
export class TurnstileService {
  constructor(private readonly config: ConfigService) {}

  async verifySignup(
    token: string | undefined,
    remoteIp: string,
  ): Promise<void> {
    if (turnstileTestBypassEnabled()) return;

    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      throw turnstileError(
        400,
        'TURNSTILE_REQUIRED',
        'Complete the security check before creating an account.',
      );
    }

    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY', '').trim();
    if (!secret) {
      throw turnstileError(
        503,
        'TURNSTILE_UNAVAILABLE',
        'Signup security verification is unavailable.',
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
      const body = new URLSearchParams({ secret, response: normalizedToken });
      if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);

      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw turnstileError(
          503,
          'TURNSTILE_UNAVAILABLE',
          'Signup security verification is unavailable.',
        );
      }

      const result = (await response.json()) as TurnstileResponse;
      const hostname =
        result.hostname?.trim().toLowerCase().replace(/\.$/, '') ?? '';
      const hostnameAllowed =
        hostname !== '' && allowedTurnstileHostnames().has(hostname);
      if (
        !result.success ||
        result.action !== EXPECTED_ACTION ||
        !hostnameAllowed
      ) {
        throw turnstileError(
          400,
          'TURNSTILE_INVALID',
          'The security check expired or was invalid. Please try again.',
        );
      }
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      throw turnstileError(
        503,
        'TURNSTILE_UNAVAILABLE',
        'Signup security verification is unavailable.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function turnstileError(status: 400 | 503, code: string, message: string) {
  const body = {
    statusCode: status,
    error: status === 400 ? 'Bad Request' : 'Service Unavailable',
    code,
    message,
  };
  return status === 400
    ? new BadRequestException(body)
    : new ServiceUnavailableException(body);
}
