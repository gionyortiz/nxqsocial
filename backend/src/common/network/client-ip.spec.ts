import { getClientIpFromRequest } from './client-ip';

describe('getClientIpFromRequest', () => {
  it('prefers CF-Connecting-IP', () => {
    const ip = getClientIpFromRequest({
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.5, 10.0.0.1',
      },
      ip: '127.0.0.1',
    });
    expect(ip).toBe('203.0.113.10');
  });

  it('falls back to first X-Forwarded-For entry', () => {
    const ip = getClientIpFromRequest({
      headers: { 'x-forwarded-for': '198.51.100.5, 10.0.0.1' },
      ip: '127.0.0.1',
    });
    expect(ip).toBe('198.51.100.5');
  });

  it('falls back to req.ip', () => {
    const ip = getClientIpFromRequest({ headers: {}, ip: '127.0.0.1' });
    expect(ip).toBe('127.0.0.1');
  });
});
