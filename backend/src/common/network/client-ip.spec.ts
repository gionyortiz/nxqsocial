import { getClientIpFromRequest } from './client-ip';

describe('getClientIpFromRequest', () => {
  const ORIGINAL_TRUSTED = process.env.TRUSTED_PROXY_IPS;
  const ORIGINAL_TRUSTED_CIDRS = process.env.TRUSTED_PROXY_CIDRS;
  const ORIGINAL_CLOUDFLARE_PROXY_CIDRS =
    process.env.CLOUDFLARE_PROXY_CIDRS;
  const ORIGINAL_RAILWAY_ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID;
  const ORIGINAL_RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID;

  beforeEach(() => {
    delete process.env.TRUSTED_PROXY_IPS;
    delete process.env.TRUSTED_PROXY_CIDRS;
    delete process.env.CLOUDFLARE_PROXY_CIDRS;
    delete process.env.RAILWAY_ENVIRONMENT_ID;
    delete process.env.RAILWAY_SERVICE_ID;
  });

  afterAll(() => {
    if (ORIGINAL_TRUSTED === undefined) delete process.env.TRUSTED_PROXY_IPS;
    else process.env.TRUSTED_PROXY_IPS = ORIGINAL_TRUSTED;
    if (ORIGINAL_TRUSTED_CIDRS === undefined)
      delete process.env.TRUSTED_PROXY_CIDRS;
    else process.env.TRUSTED_PROXY_CIDRS = ORIGINAL_TRUSTED_CIDRS;
    if (ORIGINAL_CLOUDFLARE_PROXY_CIDRS === undefined)
      delete process.env.CLOUDFLARE_PROXY_CIDRS;
    else
      process.env.CLOUDFLARE_PROXY_CIDRS = ORIGINAL_CLOUDFLARE_PROXY_CIDRS;
    if (ORIGINAL_RAILWAY_ENVIRONMENT_ID === undefined)
      delete process.env.RAILWAY_ENVIRONMENT_ID;
    else process.env.RAILWAY_ENVIRONMENT_ID = ORIGINAL_RAILWAY_ENVIRONMENT_ID;
    if (ORIGINAL_RAILWAY_SERVICE_ID === undefined)
      delete process.env.RAILWAY_SERVICE_ID;
    else process.env.RAILWAY_SERVICE_ID = ORIGINAL_RAILWAY_SERVICE_ID;
  });

  it('prefers CF-Connecting-IP from a loopback proxy', () => {
    const ip = getClientIpFromRequest({
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.5, 10.0.0.1',
      },
      socket: { remoteAddress: '127.0.0.1' },
    });
    expect(ip).toBe('203.0.113.10');
  });

  it('falls back to first X-Forwarded-For entry from a trusted proxy', () => {
    const ip = getClientIpFromRequest({
      headers: { 'x-forwarded-for': '198.51.100.5, 10.0.0.1' },
      socket: { remoteAddress: '::1' },
    });
    expect(ip).toBe('198.51.100.5');
  });

  it('ignores spoofed forwarding headers from an untrusted peer', () => {
    const ip = getClientIpFromRequest({
      headers: { 'cf-connecting-ip': '203.0.113.10' },
      socket: { remoteAddress: '192.0.2.40' },
    });
    expect(ip).toBe('192.0.2.40');
  });

  it('accepts forwarding headers from an explicitly configured proxy', () => {
    process.env.TRUSTED_PROXY_IPS = '192.0.2.40';
    const ip = getClientIpFromRequest({
      headers: { 'cf-connecting-ip': '203.0.113.10' },
      socket: { remoteAddress: '192.0.2.40' },
    });
    expect(ip).toBe('203.0.113.10');
  });

  it('accepts forwarding headers from an explicitly configured proxy CIDR', () => {
    process.env.TRUSTED_PROXY_CIDRS = '192.0.2.0/24, 2001:db8::/32';
    const ipv4 = getClientIpFromRequest({
      headers: { 'x-forwarded-for': '198.51.100.5' },
      socket: { remoteAddress: '192.0.2.40' },
    });
    const ipv6 = getClientIpFromRequest({
      headers: { 'x-forwarded-for': '2001:db9::5' },
      socket: { remoteAddress: '2001:db8::40' },
    });
    expect(ipv4).toBe('198.51.100.5');
    expect(ipv6).toBe('2001:db9::5');
  });

  it('ignores forwarding headers outside configured proxy CIDRs', () => {
    process.env.TRUSTED_PROXY_CIDRS = '192.0.2.0/24';
    const ip = getClientIpFromRequest({
      headers: { 'x-forwarded-for': '198.51.100.5' },
      socket: { remoteAddress: '192.0.3.40' },
    });
    expect(ip).toBe('192.0.3.40');
  });

  it('uses Railway X-Real-IP only for Railway runtime proxy traffic', () => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'environment-id';
    process.env.RAILWAY_SERVICE_ID = 'service-id';
    const ip = getClientIpFromRequest({
      headers: {
        'x-real-ip': '198.51.100.5',
        'cf-connecting-ip': '203.0.113.99',
        'x-forwarded-for': '192.0.2.10, 100.64.0.1',
      },
      socket: { remoteAddress: '100.64.0.12' },
    });
    expect(ip).toBe('198.51.100.5');
  });

  it('uses Cloudflare client IP only when Railway identifies a configured Cloudflare hop', () => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'environment-id';
    process.env.RAILWAY_SERVICE_ID = 'service-id';
    process.env.CLOUDFLARE_PROXY_CIDRS = '192.0.2.0/24,2001:db8::/32';
    const ipv4 = getClientIpFromRequest({
      headers: {
        'x-real-ip': '192.0.2.40',
        'cf-connecting-ip': '198.51.100.5',
      },
      socket: { remoteAddress: '100.64.0.12' },
    });
    const ipv6 = getClientIpFromRequest({
      headers: {
        'x-real-ip': '2001:db8::40',
        'cf-connecting-ip': '2001:db9::5',
      },
      socket: { remoteAddress: '100.64.0.12' },
    });
    expect(ipv4).toBe('198.51.100.5');
    expect(ipv6).toBe('2001:db9::5');
  });

  it('ignores a forged Cloudflare client header on direct Railway traffic', () => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'environment-id';
    process.env.RAILWAY_SERVICE_ID = 'service-id';
    process.env.CLOUDFLARE_PROXY_CIDRS = '192.0.2.0/24';
    const ip = getClientIpFromRequest({
      headers: {
        'x-real-ip': '198.51.100.5',
        'cf-connecting-ip': '203.0.113.99',
      },
      socket: { remoteAddress: '100.64.0.12' },
    });
    expect(ip).toBe('198.51.100.5');
  });

  it('does not fall back to Railway X-Forwarded-For when X-Real-IP is invalid', () => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'environment-id';
    process.env.RAILWAY_SERVICE_ID = 'service-id';
    const ip = getClientIpFromRequest({
      headers: {
        'x-real-ip': 'malformed',
        'x-forwarded-for': '198.51.100.5, 100.64.0.1',
      },
      socket: { remoteAddress: '100.64.0.12' },
    });
    expect(ip).toBe('100.64.0.12');
  });

  it('does not trust Railway proxy addresses outside Railway', () => {
    const ip = getClientIpFromRequest({
      headers: { 'x-real-ip': '198.51.100.5' },
      socket: { remoteAddress: '100.64.0.12' },
    });
    expect(ip).toBe('100.64.0.12');
  });

  it('does not trust malformed CIDR configuration', () => {
    process.env.TRUSTED_PROXY_CIDRS =
      'not-a-cidr,192.0.2.0/not-a-prefix,192.0.2.0/64';
    const ip = getClientIpFromRequest({
      headers: { 'x-forwarded-for': '198.51.100.5' },
      socket: { remoteAddress: '192.0.2.40' },
    });
    expect(ip).toBe('192.0.2.40');
  });

  it('rejects malformed forwarded values', () => {
    const ip = getClientIpFromRequest({
      headers: { 'cf-connecting-ip': 'not-an-ip' },
      socket: { remoteAddress: '127.0.0.1' },
    });
    expect(ip).toBe('127.0.0.1');
  });
});
