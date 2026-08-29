const PRODUCTION_PROJECT_ID = 'a4f27391-f0b4-4b73-9a2d-a1f87f68c77c';
const PRODUCTION_VARIANT = 'production';
const STAGING_VARIANT = 'staging';
const REQUIRED_SENTINEL = '__REQUIRED__';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVED_HOSTS = ['example.com', 'example.net', 'example.org'];
const RESERVED_SUFFIXES = ['.example', '.invalid', '.localhost', '.local', '.test', '.internal'];

function isReservedOrNonPublicHost(hostname) {
  const isReservedDomain = RESERVED_HOSTS.some(
    (reserved) => hostname === reserved || hostname.endsWith(`.${reserved}`),
  );
  const isReservedSuffix = RESERVED_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
  return hostname === 'localhost'
    || !hostname.includes('.')
    || isReservedDomain
    || isReservedSuffix
    || isIpAddress;
}

function readVariant() {
  const variant = process.env.NXQ_MOBILE_VARIANT ?? PRODUCTION_VARIANT;
  if (variant !== PRODUCTION_VARIANT && variant !== STAGING_VARIANT) {
    throw new Error(`Unsupported NXQ_MOBILE_VARIANT: ${variant}`);
  }

  const publicVariant = process.env.EXPO_PUBLIC_APP_VARIANT ?? PRODUCTION_VARIANT;
  if (publicVariant !== variant) {
    throw new Error(
      `NXQ_MOBILE_VARIANT (${variant}) must match EXPO_PUBLIC_APP_VARIANT (${publicVariant}).`,
    );
  }

  return variant;
}

function requireStagingUrl(name) {
  const value = process.env[name];
  if (!value || value === REQUIRED_SENTINEL) {
    throw new Error(`${name} must be configured before a staging-native build.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }

  const rawHostname = url.hostname.toLowerCase();
  const hostname = rawHostname.replace(/\.+$/, '');
  const hasNonCanonicalHostname = rawHostname !== hostname;
  const isProduction = hostname === 'nxqsocial.com' || hostname.endsWith('.nxqsocial.com');
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || hasNonCanonicalHostname
    || isReservedOrNonPublicHost(hostname)
    || isProduction
  ) {
    throw new Error(
      `${name} must be a canonical public non-production HTTPS URL without credentials, query, or fragment.`,
    );
  }

  return value;
}

module.exports = ({ config }) => {
  const variant = readVariant();

  if (variant === PRODUCTION_VARIANT) {
    return config;
  }

  if (process.env.NXQ_STAGING_CONFIG_READY !== 'true') {
    throw new Error(
      'staging-native is intentionally blocked until NXQ_STAGING_CONFIG_READY is true.',
    );
  }

  const stagingProjectId = process.env.NXQ_STAGING_EAS_PROJECT_ID;
  if (
    !stagingProjectId
    || stagingProjectId === REQUIRED_SENTINEL
    || stagingProjectId.toLowerCase() === PRODUCTION_PROJECT_ID
    || !UUID_PATTERN.test(stagingProjectId)
  ) {
    throw new Error(
      'NXQ_STAGING_EAS_PROJECT_ID must be a valid UUID different from the production project ID.',
    );
  }

  requireStagingUrl('EXPO_PUBLIC_API_BASE_URL');
  requireStagingUrl('EXPO_PUBLIC_WEB_BASE_URL');
  requireStagingUrl('EXPO_PUBLIC_TURNSTILE_MOBILE_URL');

  const stagingInfoPlist = {
    ...config.ios?.infoPlist,
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: false,
    },
  };

  return {
    ...config,
    name: 'NXQ Social Staging',
    slug: 'nxq-social-mobile-staging',
    scheme: 'nxqsocial-staging',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.gionyortiz.nxqsocial.staging',
      associatedDomains: [],
      infoPlist: stagingInfoPlist,
    },
    android: {
      ...config.android,
      package: 'com.gionyortiz.nxqsocial.staging',
    },
    extra: {
      ...config.extra,
      eas: {
        projectId: stagingProjectId,
      },
    },
    runtimeVersion: {
      policy: 'fingerprint',
    },
    updates: {
      enabled: false,
      checkAutomatically: 'NEVER',
    },
  };
};
