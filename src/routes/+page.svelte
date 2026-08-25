<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth/session.svelte';

  // Signed-in visitors skip the landing and go straight to their workspace.
  $effect(() => {
    if (auth.ready && auth.session) goto('/home', { replaceState: true });
  });

  const modules = [
    {
      kicker: 'Schedule',
      title: 'Publish weeks that hold up.',
      copy: 'Conflicts, availability and pending requests are checked at a publish gate before employees ever see the week.',
      points: ['Roster grid with live coverage', 'Leave and availability built in', 'Publish once blockers are clear']
    },
    {
      kicker: 'Timesheet',
      title: 'Payroll built on proof.',
      copy: 'Badge clock-ins land next to the plan. Missing badges are corrected or cancelled — with an audit trail — before a week is approved.',
      points: ['Planned vs badged, side by side', 'Corrections keep their history', 'Export payroll when it is trustworthy']
    },
    {
      kicker: 'Team',
      title: 'Everyone sees their part.',
      copy: 'Employees see their shifts, availability, leave and badge proof. Managers run the floor while owners retain contract and payroll controls.',
      points: ['Self-service shifts and time off', 'Shared time clock terminal', 'Contracts and payroll readiness']
    }
  ];

  const steps = [
    { n: '1', title: 'Plan the week', copy: 'Build the roster against real availability and coverage rules.' },
    { n: '2', title: 'Keep the floor moving', copy: 'Live monitor shows who is working, late or upcoming — during service.' },
    { n: '3', title: 'Close payroll with proof', copy: 'Approve the week when badges and plan agree, then export.' }
  ];

  // Decorative self-playing demo board. 0 = empty, 1 = morning, 2 = evening.
  const demoDays = [
    { d: 'Mon', n: '06' },
    { d: 'Tue', n: '07' },
    { d: 'Wed', n: '08' },
    { d: 'Thu', n: '09' },
    { d: 'Fri', n: '10' }
  ];
  const demoRows = [
    { who: 'AL', tone: 'a', cells: [1, 2, 0, 1, 2] },
    { who: 'NM', tone: 'b', cells: [1, 2, 1, 0, 2] },
    { who: 'MD', tone: 'c', cells: [0, 1, 2, 1, 2] },
    { who: 'SR', tone: 'd', cells: [1, 0, 2, 2, 0] }
  ];

  // Reveal-on-scroll: add .is-in once an element enters the viewport.
  function reveal(node: HTMLElement) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -6% 0px' }
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
</script>

<svelte:head>
  <title>restogogo — restaurant operations, in one calm workspace</title>
  <meta
    name="description"
    content="Schedule the week, run the service, close payroll with proof. Restaurant scheduling, timesheets and team self-service in one calm workspace."
  />
</svelte:head>

{#if !auth.session}
  <div class="landing">
    <header class="landing__bar">
      <span class="wordmark"><i>resto</i><b>gogo</b></span>
      <a class="bar-signin" href="/login">Sign in</a>
    </header>

    <section class="hero" aria-labelledby="landing-title">
      <div class="hero__photo" aria-hidden="true"></div>
      <div class="hero__overlay" aria-hidden="true"></div>
      <div class="hero__glow" aria-hidden="true"></div>

      <div class="hero__inner">
        <div class="hero__copy">
          <span class="kicker">Restaurant operations</span>
          <h1 id="landing-title">One calm workspace, from schedule to payroll.</h1>
          <p>
            Plan the week, keep the floor moving during service, and close payroll with proof —
            without spreadsheets, group chats or guesswork.
          </p>
          <div class="hero__cta">
            <a class="cta cta--primary" href="/login?mode=signup">Create your workspace</a>
            <a class="cta cta--ghost" href="/login">Sign in</a>
          </div>
        </div>

        <div class="hero__demo" aria-hidden="true">
          <div class="demo">
            <div class="demo__bar">
              <span class="demo__dots"><i></i><i></i><i></i></span>
              <span class="demo__label">Schedule · 06–12 Jul</span>
              <span class="demo__gate">
                <span class="pill pill--block">3 blockers</span>
                <span class="pill pill--warn">1 blocker</span>
                <span class="pill pill--ready">Ready to publish</span>
              </span>
            </div>

            <div class="demo__grid">
              <span class="demo__cell demo__corner"></span>
              {#each demoDays as day (day.n)}
                <span class="demo__cell demo__head"><b>{day.d}</b><i>{day.n}</i></span>
              {/each}

              {#each demoRows as row, r (row.who)}
                <span class="demo__cell demo__staff">
                  <span class="demo__avatar demo__avatar--{row.tone}">{row.who}</span>
                </span>
                {#each row.cells as cell, c (c)}
                  <span class="demo__cell demo__slot" style={`--i:${r * 5 + c}`}>
                    {#if cell}
                      <span class="demo__chip demo__chip--{row.tone}" class:is-pm={cell === 2}></span>
                    {/if}
                  </span>
                {/each}
              {/each}

              <span class="demo__now"><span class="demo__now-pill">Now</span></span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <main class="body">
      <section class="modules" aria-label="What restogogo does">
        {#each modules as module, i (module.kicker)}
          <article class="module-card reveal" style={`--i:${i}`} use:reveal>
            <span class="kicker">{module.kicker}</span>
            <h2>{module.title}</h2>
            <p>{module.copy}</p>
            <ul>
              {#each module.points as point}
                <li>{point}</li>
              {/each}
            </ul>
          </article>
        {/each}
      </section>

      <section class="week reveal" aria-label="A week in restogogo" use:reveal>
        <span class="kicker">A week in restogogo</span>
        <h2>Start with the one thing that can block service.</h2>
        <div class="week__steps">
          {#each steps as step, i (step.n)}
            <article class="reveal" style={`--i:${i}`} use:reveal>
              <span>{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          {/each}
        </div>
      </section>

      <section class="closing reveal" aria-label="Get started" use:reveal>
        <h2>Ready when your restaurant is.</h2>
        <p>Create the owner account, set up the restaurant, invite the team.</p>
        <a class="cta cta--primary" href="/login?mode=signup">Create your workspace</a>
      </section>
    </main>

    <footer class="landing__footer">
      <span class="wordmark"><i>resto</i><b>gogo</b></span>
      <a href="/login">Sign in</a>
    </footer>
  </div>
{/if}

<style>
  .landing {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--rst-ui-bg);
  }

  .kicker {
    color: var(--rst-ui-action);
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .wordmark {
    font-weight: var(--rst-fw-display);
    font-size: var(--rst-fs-title);
  }
  .wordmark i { color: var(--rst-ui-action); font-style: normal; }
  .wordmark b { color: currentColor; }

  /* ---- top bar ---- */

  .landing__bar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px clamp(20px, 5vw, 48px);
    color: #fffaf2;
    background: #0b121a;
  }

  .landing__bar .wordmark i,
  .hero .kicker {
    color: #8da7ff;
  }

  .bar-signin {
    padding: 8px 16px;
    border: 1px solid rgba(255, 250, 242, 0.28);
    border-radius: var(--rst-ui-radius-md);
    color: #fffaf2;
    text-decoration: none;
    font-weight: var(--rst-fw-bold);
    font-size: var(--rst-fs-body-lg);
    transition: background-color 0.18s ease, border-color 0.18s ease;
  }

  .bar-signin:hover {
    border-color: rgba(255, 250, 242, 0.55);
    background: rgba(255, 255, 255, 0.08);
  }

  /* ---- hero: layered dark band with a living demo ---- */

  .hero {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    padding: clamp(44px, 7vw, 92px) clamp(20px, 5vw, 48px) clamp(52px, 8vw, 104px);
    color: #fffaf2;
    background: #0b121a;
  }

  .hero__photo,
  .hero__overlay,
  .hero__glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .hero__photo {
    inset: -4%;
    background: url('/module-backgrounds/home.webp') center / cover;
    transform: scale(1.04);
    z-index: -3;
  }

  .hero__overlay {
    z-index: -2;
    background: linear-gradient(
      100deg,
      rgba(11, 18, 26, 0.95) 0%,
      rgba(11, 18, 26, 0.88) 46%,
      rgba(11, 18, 26, 0.58) 100%
    );
  }

  .hero__glow {
    z-index: -1;
    background:
      radial-gradient(38% 46% at 82% 24%, rgba(240, 100, 35, 0.32), transparent 70%),
      radial-gradient(36% 42% at 92% 82%, rgba(247, 183, 51, 0.2), transparent 72%),
      radial-gradient(32% 40% at 66% 8%, rgba(64, 200, 120, 0.14), transparent 72%);
    opacity: 0.9;
  }

  .hero::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 5px;
    background: var(--rst-ui-action);
    opacity: 0.92;
  }

  .hero__inner {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    align-items: center;
    gap: clamp(28px, 5vw, 64px);
    max-width: 1180px;
    margin: 0 auto;
  }

  .hero__copy {
    min-width: 0;
    max-width: 600px;
    display: grid;
    gap: 16px;
    animation: rst-fade-up 0.5s var(--rst-ease-out) backwards;
  }

  .hero h1 {
    margin: 0;
    font-size: var(--rst-fs-hero-lg);
    font-weight: var(--rst-fw-display);
    line-height: 0.99;
    letter-spacing: 0;
  }

  .hero__copy > p {
    max-width: 560px;
    margin: 0;
    color: rgba(255, 250, 242, 0.85);
    font-size: var(--rst-fs-title);
    line-height: 1.5;
  }

  .hero__cta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
  }

  .cta {
    display: inline-block;
    padding: 12px 22px;
    border-radius: var(--rst-ui-radius-md);
    text-decoration: none;
    font-weight: var(--rst-fw-bold);
    font-size: var(--rst-fs-title-sm);
    transition: transform 0.18s var(--rst-ease-out), background-color 0.18s ease, border-color 0.18s ease;
  }

  .cta:hover {
    transform: translateY(-1px);
  }

  .cta--primary {
    color: #fffaf2;
    background: var(--rst-ui-action);
  }

  .cta--primary:hover {
    background: var(--rst-ui-action-2);
  }

  .cta--ghost {
    border: 1px solid rgba(255, 250, 242, 0.32);
    color: #fffaf2;
  }

  .cta--ghost:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  /* ---- the living demo board ---- */

  .hero__demo {
    min-width: 0;
    justify-self: end;
    width: 100%;
    max-width: 460px;
    animation: rst-fade-up 0.6s var(--rst-ease-out) 0.1s backwards;
  }

  .demo {
    --tone-a: #f06423;
    --tone-b: #40c878;
    --tone-c: #4a8bff;
    --tone-d: #f7b733;
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    background: #0d1520;
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.42);
  }

  .demo__bar {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .demo__dots {
    display: inline-flex;
    gap: 5px;
  }

  .demo__dots i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.22);
  }

  .demo__label {
    flex: 1;
    min-width: 0;
    color: rgba(255, 250, 242, 0.72);
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .demo__gate {
    position: relative;
    display: grid;
    place-items: center end;
    width: 128px;
    height: 24px;
    flex: 0 0 auto;
  }

  .pill {
    grid-area: 1 / 1;
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-display);
    white-space: nowrap;
  }

  .pill--block {
    color: #ffd7cb;
    background: rgba(226, 75, 74, 0.24);
    opacity: 0;
  }

  .pill--warn {
    color: #ffe6b8;
    background: rgba(247, 183, 51, 0.22);
    opacity: 0;
  }

  .pill--ready {
    color: #c9f6de;
    background: rgba(64, 200, 120, 0.24);
    opacity: 1;
  }

  .pill--ready::before {
    content: '✓ ';
  }

  .demo__grid {
    position: relative;
    display: grid;
    grid-template-columns: 30px repeat(5, minmax(0, 1fr));
    gap: 5px;
    align-items: center;
  }

  .demo__cell {
    min-width: 0;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .demo__head {
    flex-direction: column;
    gap: 1px;
    line-height: 1;
  }

  .demo__head b {
    color: rgba(255, 250, 242, 0.55);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .demo__head i {
    color: rgba(255, 250, 242, 0.85);
    font-size: var(--rst-fs-label);
    font-style: normal;
    font-weight: var(--rst-fw-display);
  }

  .demo__avatar {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #0b121a;
    background: var(--tone, #f06423);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-display);
  }

  .demo__avatar--a { --tone: var(--tone-a); }
  .demo__avatar--b { --tone: var(--tone-b); }
  .demo__avatar--c { --tone: var(--tone-c); }
  .demo__avatar--d { --tone: var(--tone-d); }

  .demo__slot {
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.035);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .demo__chip {
    width: 78%;
    height: 13px;
    border-radius: 4px;
    background: var(--tone, #f06423);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.28);
  }

  .demo__chip.is-pm {
    opacity: 0.62;
  }

  .demo__chip--a { --tone: var(--tone-a); }
  .demo__chip--b { --tone: var(--tone-b); }
  .demo__chip--c { --tone: var(--tone-c); }
  .demo__chip--d { --tone: var(--tone-d); }

  .demo__now {
    position: absolute;
    top: -2px;
    bottom: -2px;
    left: 62%;
    width: 2px;
    border-radius: 2px;
    background: var(--rst-green);
    box-shadow: 0 0 10px rgba(64, 200, 120, 0.7);
    opacity: 0;
  }

  .demo__now-pill {
    position: absolute;
    top: -9px;
    left: 50%;
    transform: translateX(-50%);
    padding: 1px 6px;
    border-radius: 999px;
    color: #0b121a;
    background: var(--rst-green);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-display);
  }

  /* ---- cream body ---- */

  .body {
    display: grid;
    gap: clamp(48px, 7vw, 88px);
    padding: clamp(40px, 6vw, 72px) clamp(20px, 5vw, 48px) clamp(56px, 7vw, 96px);
    max-width: 1180px;
    width: 100%;
    margin: 0 auto;
  }

  .modules {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }

  .module-card {
    display: grid;
    align-content: start;
    gap: 10px;
    padding: 26px 24px 24px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-bg-2);
    transition: box-shadow 0.22s var(--rst-ease-out), border-color 0.22s ease;
  }

  .module-card:hover {
    border-color: rgba(240, 100, 35, 0.35);
    box-shadow: 0 18px 38px rgba(60, 42, 24, 0.12);
  }

  .module-card h2 {
    margin: 0;
    font-size: var(--rst-fs-heading);
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
  }

  .module-card p {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-body-lg);
    line-height: 1.5;
  }

  .module-card ul {
    display: grid;
    gap: 7px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  .module-card li {
    position: relative;
    padding-left: 20px;
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-bold);
  }

  .module-card li::before {
    content: '✓';
    position: absolute;
    left: 0;
    color: var(--rst-green);
    font-weight: var(--rst-fw-display);
  }

  /* ---- week narrative ---- */

  .week {
    display: grid;
    gap: 18px;
  }

  .week h2 {
    margin: 0;
    max-width: 620px;
    font-size: var(--rst-fs-display-lg);
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
  }

  .week__steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }

  .week__steps article {
    display: grid;
    align-content: start;
    gap: 8px;
    padding: 22px;
    border-left: 3px solid var(--rst-ui-action);
    background: var(--rst-ui-bg-2);
    border-radius: 0 var(--rst-ui-radius-md) var(--rst-ui-radius-md) 0;
  }

  .week__steps span {
    color: var(--rst-ui-action);
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-display);
  }

  .week__steps h3 {
    margin: 0;
    font-size: var(--rst-fs-title);
    font-weight: var(--rst-fw-display);
  }

  .week__steps p {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-body);
    line-height: 1.5;
  }

  /* ---- closing + footer ---- */

  .closing {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: clamp(36px, 5vw, 56px) 24px;
    border-radius: var(--rst-ui-radius-md);
    color: #fffaf2;
    text-align: center;
    background:
      radial-gradient(circle at 85% 12%, rgba(240, 100, 35, 0.32), transparent 42%),
      #0b121a;
  }

  .closing h2 {
    margin: 0;
    font-size: var(--rst-fs-display-lg);
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
  }

  .closing p {
    margin: 0 0 8px;
    color: rgba(255, 250, 242, 0.8);
    font-size: var(--rst-fs-title-sm);
  }

  .landing__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px clamp(20px, 5vw, 48px);
    border-top: 1px solid var(--rst-ui-line);
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-body);
  }

  .landing__footer .wordmark {
    font-size: var(--rst-fs-title-sm);
    color: var(--rst-ui-text);
  }

  .landing__footer a {
    color: var(--rst-ui-action);
    font-weight: var(--rst-fw-bold);
    text-decoration: none;
  }

  /* ---- motion: only for viewers who allow it ---- */

  @media (prefers-reduced-motion: no-preference) {
    .hero__photo {
      animation: land-ken 30s ease-in-out infinite alternate;
    }

    .hero__glow {
      animation: land-drift 22s ease-in-out infinite alternate;
    }

    .demo__chip {
      animation: land-chip 4.6s ease-in-out infinite alternate;
      animation-delay: calc(var(--i, 0) * 0.11s);
    }

    .pill--block {
      animation: land-gate-block 9s ease-in-out infinite;
    }

    .pill--warn {
      animation: land-gate-warn 9s ease-in-out infinite;
    }

    .pill--ready {
      animation: land-gate-ready 9s ease-in-out infinite;
    }

    .demo__now {
      animation: land-now 9s ease-in-out infinite;
    }

    .reveal {
      opacity: 0;
      transform: translateY(20px);
      transition:
        opacity 0.6s var(--rst-ease-out),
        transform 0.6s var(--rst-ease-out);
      transition-delay: calc(var(--i, 0) * 90ms);
    }

    .reveal.is-in {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes land-ken {
    from { transform: scale(1.04) translate3d(0, 0, 0); }
    to { transform: scale(1.13) translate3d(-1.5%, -1.2%, 0); }
  }

  @keyframes land-drift {
    from { transform: translate3d(0, 0, 0) scale(1); opacity: 0.7; }
    to { transform: translate3d(-4%, 3%, 0) scale(1.12); opacity: 0.95; }
  }

  @keyframes land-chip {
    from { opacity: 0.72; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes land-gate-block {
    0%, 22% { opacity: 1; }
    30%, 100% { opacity: 0; }
  }

  @keyframes land-gate-warn {
    0%, 32% { opacity: 0; }
    40%, 58% { opacity: 1; }
    66%, 100% { opacity: 0; }
  }

  @keyframes land-gate-ready {
    0%, 64% { opacity: 0; }
    72%, 96% { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes land-now {
    0%, 60% { opacity: 0; left: 30%; }
    66% { opacity: 1; }
    92% { opacity: 1; left: 92%; }
    100% { opacity: 0; left: 92%; }
  }

  /* ---- responsive ---- */

  @media (max-width: 980px) {
    .hero__inner {
      grid-template-columns: 1fr;
      gap: clamp(28px, 6vw, 44px);
    }

    .hero__demo {
      justify-self: start;
      max-width: 420px;
    }

    .modules,
    .week__steps {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .hero h1 {
      font-size: var(--rst-fs-display-lg);
      line-height: 1.04;
    }

    .week h2,
    .closing h2 {
      font-size: var(--rst-fs-display-sm);
    }
  }
</style>
