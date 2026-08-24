import { BlockList, isIP } from 'net';

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: unknown };
  connection?: { remoteAddress?: unknown };
}

export function getClientIpFromRequest(req: RequestLike | undefined): string {
  const headers = req?.headers ?? {};
  const peer = normalizeIp(
    req?.socket?.remoteAddress ?? req?.connection?.remoteAddress,
  );

  if (peer && isTrustedProxy(peer)) {
    // Railway's public edge overwrites X-Real-IP with the connecting client IP.
    // When Cloudflare is the connecting client, accept CF-Connecting-IP only
    // after proving X-Real-IP belongs to an explicitly configured Cloudflare
    // range. A caller hitting the Railway domain directly can otherwise forge
    // the Cloudflare header.
    if (isRailwayRuntime()) {
      const fromRailway = normalizeIp(firstHeaderValue(headers['x-real-ip']));
      if (
        fromRailway &&
        matchesCidrs(fromRailway, process.env.CLOUDFLARE_PROXY_CIDRS)
      ) {
        const fromCloudflare = normalizeIp(
          firstHeaderValue(headers['cf-connecting-ip']),
        );
        if (fromCloudflare) return fromCloudflare;
      }

      if (fromRailway) return fromRailway;

      // Railway documents X-Real-IP as the client-address source. If it is
      // absent or malformed, fail closed to the immediate edge address rather
      // than trusting an undocumented X-Forwarded-For fallback.
      return peer;
    }

    const fromCf = normalizeIp(firstHeaderValue(headers['cf-connecting-ip']));
    if (fromCf) return fromCf;

    const fromXff = firstForwardedIp(headers['x-forwarded-for']);
    if (fromXff) return fromXff;

    const fromRealIp = normalizeIp(firstHeaderValue(headers['x-real-ip']));
    if (fromRealIp) return fromRealIp;
  }

  const candidates = [
    peer,
    req?.socket?.remoteAddress,
    req?.connection?.remoteAddress,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized) return normalized;
  }

  return 'unknown';
}

export function isTrustedProxy(address: string): boolean {
  const normalized = normalizeIp(address);
  if (!normalized) return false;
  if (normalized === '127.0.0.1' || normalized === '::1') return true;

  const configuredIps = (process.env.TRUSTED_PROXY_IPS ?? '')
    .split(',')
    .map((value) => normalizeIp(value))
    .filter(Boolean);
  if (configuredIps.includes(normalized)) return true;

  if (matchesConfiguredCidrs(normalized)) return true;

  // Railway documents its immediate HTTP proxy network as 100.0.0.0/8. Only
  // trust that range when Railway injected its runtime identity variables, so
  // the same build remains fail-closed on a directly exposed host.
  return isRailwayRuntime() && isInCidr(normalized, '100.0.0.0/8');
}

export function normalizeIp(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const withoutMappedPrefix = trimmed.startsWith('::ffff:')
    ? trimmed.slice(7)
    : trimmed;
  return isIP(withoutMappedPrefix) ? withoutMappedPrefix : '';
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (!value) return '';
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value.trim();
}

function firstForwardedIp(value: string | string[] | undefined): string {
  const forwarded = firstHeaderValue(value);
  return normalizeIp(forwarded.split(',')[0]);
}

function isRailwayRuntime(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT_ID?.trim() &&
    process.env.RAILWAY_SERVICE_ID?.trim(),
  );
}

function matchesConfiguredCidrs(address: string): boolean {
  return matchesCidrs(address, process.env.TRUSTED_PROXY_CIDRS);
}

function matchesCidrs(address: string, configured: string | undefined): boolean {
  return (configured ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .some((cidr) => isInCidr(address, cidr));
}

function isInCidr(address: string, cidr: string): boolean {
  const separator = cidr.lastIndexOf('/');
  if (separator <= 0) return false;

  const network = normalizeIp(cidr.slice(0, separator));
  const prefix = Number(cidr.slice(separator + 1));
  const family = isIP(network);
  const addressFamily = isIP(address);
  const maxPrefix = family === 4 ? 32 : 128;

  if (
    !network ||
    family === 0 ||
    family !== addressFamily ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > maxPrefix
  ) {
    return false;
  }

  try {
    const list = new BlockList();
    const type = family === 4 ? 'ipv4' : 'ipv6';
    list.addSubnet(network, prefix, type);
    return list.check(address, type);
  } catch {
    return false;
  }
}
