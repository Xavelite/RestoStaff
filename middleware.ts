const hiddenHosts = new Set(['xbesnard.com', 'www.xbesnard.com']);

const blankPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <link rel="icon" href="data:,">
  <title>xbesnard.com</title>
  <style>html,body{margin:0;min-height:100%;background:#fff}</style>
</head>
<body></body>
</html>`;

const responseHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
};

// Replace the old offline shell without clearing accounts, preferences or data.
const holdingWorker = `
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(new Response(${JSON.stringify(blankPage)}, { headers: ${JSON.stringify(responseHeaders)} }));
  }
});
`;

// This hosting-only gate leaves local development and other domains untouched.
// Remove a host from hiddenHosts and redeploy when it should become public.
export default function middleware(request: Request) {
  const url = new URL(request.url);
  if (!hiddenHosts.has(url.hostname)) return;

  const isWorker = url.pathname === '/service-worker.js';
  return new Response(request.method === 'HEAD' ? null : isWorker ? holdingWorker : blankPage, {
    headers: {
      ...responseHeaders,
      'Content-Type': isWorker ? 'application/javascript; charset=utf-8' : responseHeaders['Content-Type']
    }
  });
}
