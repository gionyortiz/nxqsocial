import { emailError, newPasswordError, passwordBytes, passwordRequirements } from '../lib/password-policy';

const strong = 'Fixture-Only-123';
test.each(['Fixture-Only-123', '  Fixture-Only-123  ', 'ÉFixture-Only-123', '🔐Fixture-Only-123'])('accepts a compliant exact password %#', (value) => {
  expect(newPasswordError(value, value)).toBeNull();
});
test.each(['', 'Short1!', 'alllowercase123!', 'ALLUPPERCASE123!', 'NoNumbersHere!', 'NoSymbolsHere123'])('rejects noncompliant new password %#', (value) => {
  expect(newPasswordError(value, value)).not.toBeNull();
});
test('requires confirmation without silently trimming it', () => {
  expect(newPasswordError(strong, '')).toMatch(/Confirm/);
  expect(newPasswordError(strong, strong + ' ')).toMatch(/do not match/);
});
test('bounds UTF-8 bytes, not just UTF-16 string length', () => {
  expect(passwordBytes('aé🔐')).toBe(7);
  const atLimit = 'A1!' + 'a'.repeat(69);
  expect(newPasswordError(atLimit, atLimit)).toBeNull();
  expect(newPasswordError(atLimit + 'a', atLimit + 'a')).toMatch(/too long/);
  const unicode = 'A1!' + '🔐'.repeat(18);
  expect(newPasswordError(unicode, unicode)).toMatch(/too long/);
});
test('counts Unicode characters consistently with backend MinLength', () => {
  const value = 'Aa1!' + '🔐'.repeat(7);
  expect(passwordRequirements(value).find((rule) => rule.id === 'length')?.met).toBe(false);
});
test('rejects embedded null instead of silently truncating', () => {
  expect(newPasswordError(strong + '\0', strong + '\0')).toMatch(/null character/);
});
test.each(['', 'foo', 'foo@', '@example.com', 'foo @example.com'])('rejects incomplete email %#', (email) => expect(emailError(email)).not.toBeNull());
test('accepts plus-tagged emails and surrounding whitespace', () => expect(emailError(' person+tag@example.com ')).toBeNull());
