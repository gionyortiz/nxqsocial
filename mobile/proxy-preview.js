const http = require('http');
const { spawn } = require('child_process');

const expo = spawn('npx', ['expo', 'start', '--web', '--port', '8081', '--clear'], {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    EXPO_PUBLIC_LIVE_NATIVE_ENABLED: 'false',
    EXPO_PUBLIC_API_BASE_URL: 'http://localhost:8090/api',
  },
});

expo.stdout.on('data', (data) => process.stdout.write(data));
expo.stderr.on('data', (data) => process.stderr.write(data));

const server = http.createServer((req, res) => {
  if (!req.url || !req.url.startsWith('/api/')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,authorization',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    });
    res.end();
    return;
  }

  const targetUrl = new URL(`https://api.nxqsocial.com${req.url}`);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  headers['accept-encoding'] = 'identity';

  const upstream = httpsRequest(targetUrl, req.method || 'GET', headers, (upstreamRes) => {
    const responseHeaders = { ...upstreamRes.headers };
    responseHeaders['access-control-allow-origin'] = '*';
    responseHeaders['access-control-allow-headers'] = 'content-type,authorization';
    responseHeaders['access-control-allow-methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
    res.writeHead(upstreamRes.statusCode || 500, responseHeaders);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: err.message }));
  });

  req.pipe(upstream);
});

function httpsRequest(url, method, headers, cb) {
  return require('https').request(url, { method, headers }, cb);
}

server.listen(8090, () => {
  console.log('API proxy listening on http://localhost:8090/api -> https://api.nxqsocial.com/api');
});

process.on('SIGINT', () => {
  expo.kill('SIGINT');
  server.close(() => process.exit(0));
});
