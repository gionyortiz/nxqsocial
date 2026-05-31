export function getClientIpFromRequest(req: Record<string, any>): string {
  const headers = (req?.headers ?? {}) as Record<string, string | string[] | undefined>;

  const fromCf = firstHeaderValue(headers['cf-connecting-ip']);
  if (fromCf) return fromCf;

  const fromXff = firstHeaderValue(headers['x-forwarded-for']);
  if (fromXff) {
    const first = fromXff.split(',')[0]?.trim();
    if (first) return first;
  }

  const candidates = [req?.ip, req?.ips?.[0], req?.socket?.remoteAddress];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  return 'unknown';
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (!value) return '';
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value.trim();
}
