// Match the live API's new-password rules. Existing login passwords are never
// trimmed, normalized, or subjected to a new-password strength requirement.
export const PASSWORD_MIN_CHARACTERS = 12;
// The existing API uses bcrypt; prevent silently ignored UTF-8 suffixes when
// creating a password. Do not apply this limit to existing login credentials.
export const PASSWORD_MAX_BYTES = 72;

export function passwordBytes(value: string): number {
  return Array.from(value).reduce((bytes, char) => {
    const point = char.codePointAt(0)!;
    return bytes + (point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4);
  }, 0);
}

export function passwordRequirements(value: string) {
  return [
    { id: 'length', label: 'At least 12 characters', met: Array.from(value).length >= PASSWORD_MIN_CHARACTERS },
    { id: 'upper', label: 'An uppercase letter (A–Z)', met: /[A-Z]/.test(value) },
    { id: 'lower', label: 'A lowercase letter (a–z)', met: /[a-z]/.test(value) },
    { id: 'number', label: 'A number (0–9)', met: /[0-9]/.test(value) },
    { id: 'special', label: 'A symbol or space', met: /[^A-Za-z0-9]/.test(value) },
    { id: 'bytes', label: 'Within the 72-byte security limit', met: passwordBytes(value) <= PASSWORD_MAX_BYTES },
  ];
}

export function newPasswordError(password: string, confirmation: string): string | null {
  if (!password) return 'Enter a new password.';
  if (password.includes('\u0000')) return 'Remove the unsupported null character from your password.';
  const missing = passwordRequirements(password).filter((rule) => !rule.met);
  if (missing.some((rule) => rule.id === 'bytes')) {
    return 'This password is too long. Use up to 72 bytes; emoji and accented characters use more than one byte.';
  }
  if (missing.length) return `Your password needs: ${missing.map((rule) => rule.label.toLowerCase()).join(', ')}.`;
  if (!confirmation) return 'Confirm your new password.';
  if (password !== confirmation) return 'Passwords do not match. Re-enter the same password in both fields.';
  return null;
}

export function emailError(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? null : 'Enter a valid email address, such as name@example.com.';
}
