const placeholder =
  /(?:change[-_ ]?me|replace|placeholder|example|dummy|todo|tbd|required|your[-_ ]|__[^_]+__|\.\.\.$)/i;

export const REQUIRED_STAGING_SHARED_VARIABLES = Object.freeze([
  "JWT_SECRET",
  "OTP_PEPPER",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "STAGING_EMAIL_RECIPIENT_ALLOWLIST",
  "STAGING_EMAIL_RECIPIENT_ALLOWLIST_SUPPLEMENT",
  "STAGING_PHONE_RECIPIENT_ALLOWLIST",
  "STAGING_PUSH_TOKEN_ALLOWLIST",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "CLOUDFLARE_PROXY_CIDRS",
  "MIGRATION_DATABASE_URL",
  "RUNTIME_DATABASE_URL",
]);

// Public endpoints and non-sensitive recipient policy values may be readable.
// Both email recipient lists and all credentials/database URLs must remain
// sealed in Railway before an apply can proceed.
export const SEALED_STAGING_SHARED_VARIABLES = new Set([
  "JWT_SECRET",
  "OTP_PEPPER",
  "TURNSTILE_SECRET_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "STAGING_EMAIL_RECIPIENT_ALLOWLIST",
  "STAGING_EMAIL_RECIPIENT_ALLOWLIST_SUPPLEMENT",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "MIGRATION_DATABASE_URL",
  "RUNTIME_DATABASE_URL",
]);

export function missingStagingSharedVariables(shared) {
  return REQUIRED_STAGING_SHARED_VARIABLES.filter(
    (name) => !hasConfiguredStagingSharedVariable(name, shared?.[name]),
  );
}

export function hasConfiguredStagingSharedVariable(name, variable) {
  if (!variable || typeof variable !== "object") return false;
  if (SEALED_STAGING_SHARED_VARIABLES.has(name)) {
    return variable.isSealed === true;
  }
  if (variable.isSealed === true) return true;
  const configured = variable.value;
  return (
    typeof configured === "string" &&
    configured.trim() !== "" &&
    !placeholder.test(configured.trim())
  );
}
