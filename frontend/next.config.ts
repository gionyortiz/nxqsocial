import type { NextConfig } from "next";

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const localApiOrigin = process.env.NXQ_LOCAL_API_ORIGIN?.trim() || 'http://127.0.0.1:3000';

const mobileTurnstileCsp = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "connect-src 'self' https://challenges.cloudflare.com",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '3000' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/turnstile/mobile-signup',
        headers: [
          { key: 'Content-Security-Policy', value: mobileTurnstileCsp },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
  async rewrites() {
    if (process.env.NODE_ENV !== 'development' || configuredApiUrl) return [];

    return [
      {
        source: '/api/:path*',
        destination: `${localApiOrigin}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${localApiOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
