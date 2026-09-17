export type OutboundEnvironment = Record<string, unknown>;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DISABLED_PUSH_ALLOWLIST = 'disabled';

/**
 * Staging is an external-delivery boundary, not a weaker production mode.
 * Treat either independently configured staging marker as restrictive so a
 * partially misconfigured Railway service cannot contact restored users.
 */
export function isStagingOutboundRestricted(
  environment: OutboundEnvironment,
): boolean {
  return (
    normalized(environment.NXQ_RELEASE_TARGET) === 'staging' ||
    normalized(environment.RAILWAY_ENVIRONMENT_NAME) === 'staging'
  );
}

/**
 * Production has no allowlist behavior. In staging, an absent, malformed, or
 * non-matching allowlist denies delivery rather than falling back to sending.
 */
export function isStagingEmailRecipientAllowed(
  recipient: string,
  environment: OutboundEnvironment,
): boolean {
  if (!isStagingOutboundRestricted(environment)) return true;

  const normalizedRecipient = normalized(recipient);
  if (!EMAIL_PATTERN.test(normalizedRecipient)) return false;

  return stagingEmailAllowlist(environment).has(normalizedRecipient);
}

/**
 * In staging, push delivery is limited to an explicit test-device token list.
 * The literal `disabled` value is the safe default for a staging run that does
 * not need an actual device-push check.
 */
export function filterStagingPushTokens(
  tokens: readonly string[],
  environment: OutboundEnvironment,
): string[] {
  if (!isStagingOutboundRestricted(environment)) return [...tokens];

  const allowed = stagingPushTokenAllowlist(environment);
  if (allowed.size === 0) return [];
  return tokens.filter((token) => allowed.has(token.trim()));
}

/**
 * Return field-name-only diagnostics so startup/predeploy logs never reveal
 * recipient addresses or device tokens.
 */
export function validateStagingOutboundDeliveryConfiguration(
  environment: OutboundEnvironment,
): string[] {
  if (!isStagingOutboundRestricted(environment)) return [];

  const issues: string[] = [];
  const rawEmails = environment.STAGING_EMAIL_RECIPIENT_ALLOWLIST;
  const emails = splitList(rawEmails).map(normalized);
  if (
    emails.length === 0 ||
    emails.some((email) => !EMAIL_PATTERN.test(email)) ||
    new Set(emails).size !== emails.length
  ) {
    issues.push(
      'STAGING_EMAIL_RECIPIENT_ALLOWLIST must contain unique, valid test-recipient email addresses',
    );
  }

  const rawPushTokens = environment.STAGING_PUSH_TOKEN_ALLOWLIST;
  const pushTokens = splitList(rawPushTokens);
  if (
    pushTokens.length === 0 ||
    (pushTokens.length === 1 &&
      normalized(pushTokens[0]) === DISABLED_PUSH_ALLOWLIST)
  ) {
    if (normalized(rawPushTokens) !== DISABLED_PUSH_ALLOWLIST) {
      issues.push(
        'STAGING_PUSH_TOKEN_ALLOWLIST must be disabled or contain unique Expo push tokens',
      );
    }
  } else if (
    pushTokens.some((token) => !isExpoPushToken(token)) ||
    new Set(pushTokens).size !== pushTokens.length
  ) {
    issues.push(
      'STAGING_PUSH_TOKEN_ALLOWLIST must be disabled or contain unique Expo push tokens',
    );
  }

  return issues;
}

function stagingEmailAllowlist(environment: OutboundEnvironment): Set<string> {
  return new Set(
    splitList(environment.STAGING_EMAIL_RECIPIENT_ALLOWLIST).map(normalized),
  );
}

function stagingPushTokenAllowlist(
  environment: OutboundEnvironment,
): Set<string> {
  const tokens = splitList(environment.STAGING_PUSH_TOKEN_ALLOWLIST);
  if (
    tokens.length === 1 &&
    normalized(tokens[0]) === DISABLED_PUSH_ALLOWLIST
  ) {
    return new Set();
  }
  return new Set(tokens);
}

function splitList(value: unknown): string[] {
  return (typeof value === 'string' ? value : '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isExpoPushToken(token: string): boolean {
  return (
    /^ExponentPushToken\[[^\]]+\]$/.test(token) ||
    /^ExpoPushToken\[[^\]]+\]$/.test(token)
  );
}
