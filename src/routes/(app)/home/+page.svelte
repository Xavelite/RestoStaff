<script lang="ts">
  import { addDays, mondayFor, todayInTimezone } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicIcon from '$lib/classic/ClassicIcon.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import { buildClassicTodayRows } from '$lib/classic/classic-home';
  import { modulesForRole } from '$lib/classic/classic-nav';

  const snapshot = $derived(workspace.operations);
  const role = $derived(workspace.effectiveRole);
  const timezone = $derived(
    snapshot?.restaurant_settings.timezone ||
      workspace.bootstrap?.restaurant_settings.timezone ||
      'Europe/Brussels'
  );

  let currentInstant = $state(new Date());
  $effect(() => {
    const timer = setInterval(() => (currentInstant = new Date()), 60_000);
    return () => clearInterval(timer);
  });

  const activeWeek = $derived(mondayFor(todayInTimezone(timezone, currentInstant)));
  $effect(() => {
    if (workspace.activeId && role && role !== 'employee') {
      void workspace.loadOperations(activeWeek, addDays(activeWeek, 6)).catch(() => undefined);
    }
  });

  // Home is the entry point, not the workbench: the tiles are the product and
  // the table below is the short list of things that need a decision today.
  const tiles = $derived(modulesForRole(role).filter((module) => module.key !== 'home'));

  // Each module has a soft identity colour, used only here on the tile icon —
  // wayfinding on the portal, nowhere else.
  const MODULE_COLOR: Record<string, string> = {
    schedule: 'var(--cl-mod-schedule)',
    time: 'var(--cl-mod-time)',
    team: 'var(--cl-mod-team)',
    restaurant: 'var(--cl-mod-restaurant)',
    inventory: 'var(--cl-mod-inventory)',
    payroll: 'var(--cl-mod-payroll)',
    'badge-terminal': 'var(--cl-mod-badge)',
    reports: 'var(--cl-mod-reports)'
  };
  const todayRows = $derived(
    snapshot && role ? buildClassicTodayRows(snapshot, role, currentInstant) : []
  );
  const openCount = $derived(todayRows.filter((row) => row.tone !== 'ok').length);
</script>

<svelte:head><title>{t('Home')} &middot; restogogo</title></svelte:head>

<ClassicPage title="Home" subtitle="Your modules and what needs attention today">
  <section class="cl-section" aria-label={t('Modules')}>
    <div class="tiles">
      {#each tiles as module (module.key)}
        <a class="tile" class:is-soon={module.placeholder} href={module.href} style="--tile-color:{MODULE_COLOR[module.key] ?? 'var(--cl-muted)'}">
          <span class="tile__icon"><ClassicIcon name={module.icon} size={26} /></span>
          <strong>{t(module.label)}</strong>
          <span class="tile__copy">{t(module.summary)}</span>
          {#if module.placeholder}
            <small class="tile__soon">{t('Coming soon')}</small>
          {/if}
        </a>
      {/each}
    </div>
  </section>

  <section class="cl-section" aria-label={t('Today')}>
    <div class="sectionhead">
      <h2 class="cl-section__title">{t('Today')}</h2>
      <p class="cl-section__note">
        {openCount === 1
          ? t('1 item needs attention')
          : t('{count} items need attention', { count: openCount })}
      </p>
    </div>

    <div class="cl-tablewrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th>{t('Item')}</th>
            <th class="is-num">{t('Count')}</th>
            <th>{t('Status')}</th>
            <th><span class="sr-only">{t('Open')}</span></th>
          </tr>
        </thead>
        <tbody>
          {#if !todayRows.length}
            <tr>
              <td colspan="4">
                <div class="cl-empty">
                  <strong>{t('Nothing to review')}</strong>
                  <span>{t('This list fills in as the week runs.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each todayRows as row (row.key)}
              <tr class:is-attention={row.tone === 'attention'} class:is-problem={row.tone === 'problem'}>
                <td>
                  <a class="cl-table__link" href={row.href}>{t(row.label)}</a>
                  <span class="rowmeta">{t(row.meta)}</span>
                </td>
                <td class="is-num">{row.countable ? row.count : '—'}</td>
                <td><ClassicStatus label={row.status} tone={row.tone} /></td>
                <td class="is-num">
                  <a class="rowgo" href={row.href} aria-label={t(row.label)}>
                    <svg class="cl-table__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </a>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </section>
</ClassicPage>

<style>
  /* Four across, then halving. A fixed column count keeps the portal reading
     as tidy rows instead of one long reflowing strip. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
  @media (max-width: 980px) {
    .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 760px) {
    .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tile { min-height: 152px; padding: 22px 14px; }
  }
  @media (max-width: 520px) {
    .tiles { grid-template-columns: minmax(0, 1fr); }
    .tile {
      justify-items: start;
      grid-template-columns: 42px minmax(0, 1fr);
      grid-template-areas: 'icon name' 'icon copy' '. note';
      align-items: center;
      gap: 3px 14px;
      min-height: 0;
      padding: 14px 16px;
      text-align: left;
    }
    .tile__icon { grid-area: icon; margin: 0; }
    .tile strong { grid-area: name; align-self: end; }
    .tile__copy { grid-area: copy; align-self: start; }
    .tile__soon { grid-area: note; }
  }
  .tile {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 10px;
    min-height: 172px;
    padding: 26px 20px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
    color: var(--cl-ink);
    text-align: center;
    text-decoration: none;
    transition: border-color var(--cl-dur) var(--cl-ease), transform var(--cl-dur) var(--cl-ease);
  }
  /* The module identity colour lives on the icon chip and nowhere else. */
  .tile__icon {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 12px;
    color: var(--tile-color);
    background: color-mix(in srgb, var(--tile-color) 12%, var(--cl-surface));
    border: 1px solid color-mix(in srgb, var(--tile-color) 24%, var(--cl-line));
    transition: background-color var(--cl-dur) var(--cl-ease);
  }
  .tile:hover {
    border-color: color-mix(in srgb, var(--tile-color) 40%, var(--cl-line));
    transform: translateY(-2px);
  }
  .tile:hover .tile__icon {
    background: color-mix(in srgb, var(--tile-color) 18%, var(--cl-surface));
  }
  .tile.is-soon { opacity: 0.85; }
  .tile strong {
    font-size: 16px;
    font-weight: var(--rst-fw-bold);
  }
  .tile__copy {
    color: var(--cl-muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .tile__soon {
    padding: 1px 8px;
    border-radius: 999px;
    color: var(--cl-muted);
    background: var(--cl-surface-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
  }
  .sectionhead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
  }
  .rowmeta {
    display: block;
    color: var(--cl-muted);
    font-size: 13px;
  }
  .rowgo {
    display: inline-flex;
    color: var(--cl-muted);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
