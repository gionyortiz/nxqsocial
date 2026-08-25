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
  success: boolean;
  hostname?: string;
  action?: string;
}

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EXPECTED_ACTION = 'register';
const MAX_TOKEN_LENGTH = 2048;
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
    if (normalizedToken.length > MAX_TOKEN_LENGTH) {
      throw turnstileError(
        400,
        'TURNSTILE_INVALID',
        'The security check expired or was invalid. Please try again.',
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
    const allowedHostnames = allowedTurnstileHostnames();
    if (allowedHostnames.size === 0) {
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

      const result = parseTurnstileResponse(await response.json());
      const hostname =
        result.hostname?.trim().toLowerCase().replace(/\.$/, '') ?? '';
      const hostnameAllowed = hostname !== '' && allowedHostnames.has(hostname);
      if (
        result.success !== true ||
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

function parseTurnstileResponse(value: unknown): TurnstileResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid Turnstile response');
  }

  const result = value as Record<string, unknown>;
  if (typeof result.success !== 'boolean') {
    throw new Error('Invalid Turnstile response');
  }
  if (result.hostname !== undefined && typeof result.hostname !== 'string') {
    throw new Error('Invalid Turnstile response');
  }
  if (result.action !== undefined && typeof result.action !== 'string') {
    throw new Error('Invalid Turnstile response');
  }

  return {
    success: result.success,
    hostname: result.hostname,
    action: result.action,
  };
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
