import { IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

// Shared strong-password rules for new and changed passwords.
const STRONG_PASSWORD = (target: string) => [
  MinLength(12, { message: `${target} must be at least 12 characters long.` }),
  Matches(/[A-Z]/, { message: `${target} must contain an uppercase letter.` }),
  Matches(/[a-z]/, { message: `${target} must contain a lowercase letter.` }),
  Matches(/[0-9]/, { message: `${target} must contain a number.` }),
  Matches(/[^A-Za-z0-9]/, { message: `${target} must contain a special character.` }),
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
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName: string;

  @IsString()
  @StrongPassword()
  password: string;

  /** Required when invite gating is enabled (REQUIRE_INVITE_CODE=true). */
  @IsOptional()
  @IsString()
  inviteCode?: string;
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
