export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'nxq-social-frontend',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
