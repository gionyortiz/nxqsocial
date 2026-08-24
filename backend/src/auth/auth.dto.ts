import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Shared strong-password rules for new and changed passwords.
const STRONG_PASSWORD = (target: string) => [
  MinLength(12, { message: `${target} must be at least 12 characters long.` }),
  Matches(/[A-Z]/, { message: `${target} must contain an uppercase letter.` }),
  Matches(/[a-z]/, { message: `${target} must contain a lowercase letter.` }),
  Matches(/[0-9]/, { message: `${target} must contain a number.` }),
  Matches(/[^A-Za-z0-9]/, {
    message: `${target} must contain a special character.`,
  }),
];

function StrongPassword(target = 'Password') {
  const decorators = STRONG_PASSWORD(target);
  return function (object: object, propertyName: string) {
    decorators.forEach((d) => d(object, propertyName));
  };
}

function normalizeEmail(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

export class RegisterDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  email: string;

  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_.]+$/, {
    message: 'Username may contain only letters, numbers, underscores, and dots.',
  })
  username: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName: string;

  @IsString()
  @StrongPassword()
  password: string;

  /**
   * @deprecated Retained temporarily so older clients do not fail strict DTO
   * validation. Open registration ignores this value.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  inviteCode?: string;

  /**
   * Current web clients send their locally validated consent checkbox. Keep it
   * optional for older mobile clients, but only accept the affirmative value.
   */
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  @Equals(true)
  agreeToTerms?: boolean;

  /** Cloudflare Turnstile response token; required when signup hardening is enabled. */
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  turnstileToken?: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  verificationToken: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string;
}

export class ResendEmailVerificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  verificationToken: string;
}

export class LoginDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @StrongPassword()
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @StrongPassword('New password')
  newPassword: string;
}
