const association = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: ['5J49RDX477.com.gionyortiz.nxqsocial'],
        components: [
          {
            '/': '/reset-password',
            comment: 'Open NXQ Social password-reset links in the iOS app.',
          },
        ],
      },
    ],
  },
};

export const dynamic = 'force-static';

export function GET() {
  return Response.json(association, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
