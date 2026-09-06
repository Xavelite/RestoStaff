const publicHosts = new Set(['xbesnard.com', 'www.xbesnard.com']);

const sharedHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
};

const welcomePage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="description" content="A small door into the things Xavier is building.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23141b27'/%3E%3Cpath d='M19 18l26 28m0-28L19 46' stroke='%235eead4' stroke-width='6' stroke-linecap='round'/%3E%3C/svg%3E">
  <title>The backstage | xbesnard.com</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7f9fc;background:#0d121b}
    *{box-sizing:border-box}
    body{margin:0;min-width:280px;min-height:100svh;background:#0d121b}
    .page{min-height:100svh;display:grid;grid-template-rows:auto 1fr auto;position:relative;overflow:hidden}
    .top{height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(22px,5vw,76px);border-bottom:1px solid #263142;color:#aeb9c8;font-size:14px}
    .top strong{color:#fff;font-size:15px;letter-spacing:0}
    .status{display:inline-flex;align-items:center;gap:8px}
    .status:before{content:"";width:8px;height:8px;border-radius:50%;background:#5eead4;box-shadow:0 0 0 4px #163b3c}
    main{width:min(1180px,100%);margin:auto;padding:clamp(64px,10vh,126px) clamp(22px,5vw,76px) clamp(120px,18vh,190px);position:relative;z-index:1}
    .eyebrow{margin:0 0 18px;color:#5eead4;font-size:13px;font-weight:750;text-transform:uppercase}
    h1{max-width:850px;margin:0;color:#fff;font-size:96px;font-weight:760;line-height:.96;letter-spacing:0}
    .lead{max-width:580px;margin:28px 0 0;color:#aeb9c8;font-size:20px;line-height:1.55}
    .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}
    .button{min-height:46px;display:inline-flex;align-items:center;gap:10px;padding:0 17px;border:1px solid #344156;border-radius:7px;color:#eef3f9;background:#151c28;text-decoration:none;font-size:14px;font-weight:700;transition:transform .18s ease,border-color .18s ease,background .18s ease}
    .button:hover{transform:translateY(-2px);border-color:#5eead4;background:#192333}
    .button.primary{border-color:#f27a2d;background:#f27a2d;color:#11151d}
    .button.primary:hover{border-color:#ff9655;background:#ff9655}
    .button span{color:inherit;opacity:.72;font-weight:500}
    .rabbit{position:absolute;right:clamp(-48px,2vw,28px);bottom:42px;width:clamp(190px,27vw,380px);height:auto;user-select:none;pointer-events:none;filter:drop-shadow(0 22px 28px rgba(0,0,0,.34))}
    .bottom{min-height:66px;display:flex;align-items:center;padding:12px clamp(22px,5vw,76px);border-top:1px solid #263142;color:#758297;font-size:12px}
    @media(max-width:900px){h1{font-size:72px}}
    @media(max-width:700px){.top{height:58px}.status{display:none}main{margin:0;padding-top:72px}.rabbit{right:-54px;bottom:48px;width:210px;opacity:.78}.bottom{padding-right:130px}h1{font-size:52px}.lead{font-size:18px}}
    @media(max-width:420px){h1{font-size:42px}}
    @media(prefers-reduced-motion:reduce){.button{transition:none}}
  </style>
</head>
<body>
  <div class="page">
    <header class="top"><strong>xbesnard.com</strong><span class="status">Building quietly</span></header>
    <main>
      <p class="eyebrow">Behind the screen</p>
      <h1>You are not lost. You found the backstage.</h1>
      <p class="lead">This is where unfinished ideas learn how to behave before anyone calls them a product.</p>
      <nav class="actions" aria-label="Projects">
        <a class="button primary" href="/restogogo/">Open Restogogo <span>Restaurant workspace</span></a>
        <a class="button" href="/game">Game <span>Still in the workshop</span></a>
      </nav>
    </main>
    <img class="rabbit" src="/restogogo/pet/ai-speed-rabbit-idle.gif" alt="" width="384" height="384">
    <footer class="bottom">Please mind the cables. Some of them are emotionally important.</footer>
  </div>
</body>
</html>`;

const gamePage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="data:,">
  <title>Game workshop | xbesnard.com</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7f9fc;background:#0d121b}
    *{box-sizing:border-box}
    body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#0d121b}
    main{width:min(720px,100%);position:relative;padding:54px 0;border-top:1px solid #2a3547;border-bottom:1px solid #2a3547}
    p{margin:0;color:#9ba8ba;font-size:18px;line-height:1.6}
    .eyebrow{margin-bottom:14px;color:#5eead4;font-size:13px;font-weight:750;text-transform:uppercase}
    h1{margin:0 0 20px;color:#fff;font-size:72px;line-height:1;letter-spacing:0}
    a{display:inline-flex;margin-top:30px;padding-bottom:5px;border-bottom:2px solid #5eead4;color:#fff;text-decoration:none;font-size:14px;font-weight:700}
    a:hover{color:#5eead4}
    @media(max-width:700px){h1{font-size:48px}}
    @media(max-width:420px){h1{font-size:40px}}
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Reserved: /game</p>
    <h1>The game is still behind the curtain.</h1>
    <p>The stage is ready. The project will move in here when it has packed its files.</p>
    <a href="/">Back to the backstage</a>
  </main>
</body>
</html>`;

// V577 briefly installed a root-scoped holding worker. This self-removing
// replacement releases existing visitors without deleting app data or accounts.
const retirementWorker = `
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  await self.registration.unregister();
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(windows.map((client) => client.navigate(client.url)));
})()));
`;

const appSegments = new Set([
  'accept-invite', 'admin', 'badge-terminal', 'book', 'coming-soon', 'documents',
  'exports', 'home', 'login', 'my-service', 'my-time', 'onboarding', 'payroll',
  'reports', 'reservations', 'reset-password', 'restaurant', 'schedule', 'settings',
  'station', 'team', 'timesheet'
]);

function htmlResponse(request: Request, body: string, noIndex = false): Response {
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: {
      ...sharedHeaders,
      ...(noIndex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {})
    }
  });
}

export default function middleware(request: Request) {
  const url = new URL(request.url);
  if (!publicHosts.has(url.hostname)) return;

  if (url.pathname === '/service-worker.js') {
    return new Response(request.method === 'HEAD' ? null : retirementWorker, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Service-Worker-Allowed': '/'
      }
    });
  }

  if (url.pathname === '/') return htmlResponse(request, welcomePage);
  if (url.pathname === '/game' || url.pathname.startsWith('/game/')) {
    return htmlResponse(request, gamePage, true);
  }

  // The existing public recipe film remains available independently.
  if (url.pathname === '/pasta' || url.pathname.startsWith('/pasta/')) return;

  // Keep old installed-app manifests and asset URLs working after the move.
  if (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/pet/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/module-backgrounds/') ||
    url.pathname.startsWith('/_app/')
  ) {
    return Response.redirect(new URL(`/restogogo${url.pathname}${url.search}`, url), 307);
  }

  if (url.pathname === '/restogogo') {
    return Response.redirect(new URL(`/restogogo/${url.search}`, url), 308);
  }
  if (url.pathname.startsWith('/restogogo/')) return;

  // Preserve old invitations, password-reset links, bookmarks and push URLs
  // from before the app moved. Everything else belongs to the public homepage.
  const firstSegment = url.pathname.split('/').filter(Boolean)[0] ?? '';
  if (appSegments.has(firstSegment)) {
    return Response.redirect(new URL(`/restogogo${url.pathname}${url.search}`, url), 307);
  }

  return Response.redirect(new URL('/', url), 307);
}
