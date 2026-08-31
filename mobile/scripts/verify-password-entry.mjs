import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manualEntryFields = [
  ['app/login.tsx', 'login-password'],
  ['app/register.tsx', 'register-password'],
  ['app/register.tsx', 'register-confirm-password'],
  ['app/reset-password.tsx', 'reset-password-new'],
  ['app/reset-password.tsx', 'reset-password-confirm'],
];

const failures = [];

for (const [relativePath, testId] of manualEntryFields) {
  const source = readFileSync(join(root, relativePath), 'utf8');
  const marker = `testID="${testId}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    failures.push(`${relativePath}: missing ${marker}`);
    continue;
  }

  const fieldStart = source.lastIndexOf('<PasswordField', markerIndex);
  const fieldEnd = source.indexOf('/>', markerIndex);
  const field = source.slice(fieldStart, fieldEnd);
  if (fieldStart === -1 || fieldEnd === -1 || !/\bdisableAutofill\b/.test(field)) {
    failures.push(`${relativePath}: ${testId} must disable native password AutoFill`);
  }
}

const component = readFileSync(join(root, 'components/PasswordField.tsx'), 'utf8');
for (const expected of [
  "autoComplete={disableAutofill ? 'off'",
  "textContentType={disableAutofill ? 'none'",
  'passwordRules={!disableAutofill',
  "importantForAutofill={disableAutofill ? 'no'",
]) {
  if (!component.includes(expected)) {
    failures.push(`components/PasswordField.tsx: missing ${expected}`);
  }
}

if (failures.length) {
  console.error('Password-entry regression check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Password-entry regression check passed (${manualEntryFields.length} fields).`);
