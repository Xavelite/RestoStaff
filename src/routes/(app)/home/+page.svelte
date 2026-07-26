<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicIcon from '$lib/classic/ClassicIcon.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import { modulesForRole } from '$lib/classic/classic-nav';

  const role = $derived(workspace.effectiveRole);
  const modules = $derived(modulesForRole(role).filter((module) => module.key !== 'home'));
  const coreTiles = $derived(modules.filter((module) => !module.placeholder && !module.homeOnly));
  const laterModules = $derived(modules.filter((module) => module.placeholder || module.homeOnly));

  const MODULE_COLOR: Record<string, string> = {
    schedule: 'var(--cl-mod-schedule)',
    time: 'var(--cl-mod-time)',
    team: 'var(--cl-mod-team)',
    restaurant: 'var(--cl-mod-restaurant)',
    inventory: 'var(--cl-mod-inventory)',
    payroll: 'var(--cl-mod-payroll)',
    'badge-terminal': 'var(--cl-mod-badge)',
    reports: 'var(--cl-mod-reports)',
    reservations: 'var(--cl-mod-schedule)',
    recipes: 'var(--cl-mod-restaurant)',
    purchasing: 'var(--cl-mod-inventory)',
    'menu-costing': 'var(--cl-mod-payroll)',
    tasks: 'var(--cl-mod-reports)',
    'food-safety': 'var(--cl-mod-badge)'
  };
</script>

<svelte:head><title>{t('Home')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <section class="cl-section" aria-label={t('Core workspace')}>
    <div class="section-copy">
      <h2>{t('Core workspace')}</h2>
      <p>{t('The modules being finalized first: restaurant setup, people, planning, time attendance, payroll preparation and badging.')}</p>
    </div>
    <div class="tiles">
      {#each coreTiles as module (module.key)}
        <a class="tile" href={module.href} style="--tile-color:{MODULE_COLOR[module.key] ?? 'var(--cl-muted)'}">
          <span class="tile__icon"><ClassicIcon name={module.icon} size={26} /></span>
          <strong>{t(module.label)}</strong>
          <span class="tile__copy">{t(module.summary)}</span>
        </a>
      {/each}
    </div>
  </section>

  {#if laterModules.length}
    <section class="cl-section roadmap-section" aria-label={t('Upcoming modules')}>
      <div class="section-copy">
        <h2>{t('Upcoming modules')}</h2>
        <p>{t('The same workspace will grow with focused modules after the operational core is complete.')}</p>
      </div>
      <div class="tiles">
        {#each laterModules as module (module.key)}
          <a class="tile is-upcoming" href={module.href} style="--tile-color:{MODULE_COLOR[module.key] ?? 'var(--cl-muted)'}">
            <span class="tile__badge">{t('Upcoming')}</span>
            <span class="tile__icon"><ClassicIcon name={module.icon} size={26} /></span>
            <strong>{t(module.label)}</strong>
            <span class="tile__copy">{t(module.summary)}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
</ClassicPage>

<style>
  .cl-section { display: grid; gap: 16px; }
  .section-copy { display: grid; gap: 4px; }
  .section-copy h2 { margin: 0; font-size: 16px; }
  .section-copy p { max-width: 760px; margin: 0; color: var(--cl-muted); font-size: 13px; line-height: 1.5; }
  .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .tile { display: grid; justify-items: center; align-content: start; gap: 10px; min-height: 172px; padding: 26px 20px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); background: var(--cl-surface); color: var(--cl-ink); text-align: center; text-decoration: none; transition: border-color var(--cl-dur) var(--cl-ease), transform var(--cl-dur) var(--cl-ease); }
  .tile__icon { display: grid; place-items: center; width: 46px; height: 46px; border: 1px solid color-mix(in srgb, var(--tile-color) 24%, var(--cl-line)); border-radius: 12px; background: color-mix(in srgb, var(--tile-color) 12%, var(--cl-surface)); color: var(--tile-color); transition: background-color var(--cl-dur) var(--cl-ease); }
  .tile:hover { border-color: color-mix(in srgb, var(--tile-color) 40%, var(--cl-line)); transform: translateY(-2px); }
  .tile:hover .tile__icon { background: color-mix(in srgb, var(--tile-color) 18%, var(--cl-surface)); }
  .tile strong { font-size: 16px; font-weight: var(--rst-fw-bold); }
  .tile__copy { color: var(--cl-muted); font-size: 13px; line-height: 1.45; }
  .roadmap-section { margin-top: 26px; padding-top: 22px; border-top: 1px solid var(--cl-line); }
  .tile.is-upcoming { position: relative; background: color-mix(in srgb, var(--cl-surface) 88%, var(--cl-surface-muted)); }
  .tile__badge { position: absolute; top: 10px; right: 10px; padding: 3px 7px; border: 1px solid var(--cl-line); border-radius: 999px; background: var(--cl-surface-muted); color: var(--cl-muted); font-size: 9px; font-weight: var(--rst-fw-bold); letter-spacing: .03em; text-transform: uppercase; }
  @media (max-width: 980px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 760px) {
    .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tile { min-height: 152px; padding: 22px 14px; }
  }
  @media (max-width: 520px) {
    .tiles { grid-template-columns: minmax(0, 1fr); }
    .tile { justify-items: start; grid-template-columns: 42px minmax(0, 1fr); grid-template-areas: 'icon name' 'icon copy'; align-items: center; gap: 3px 14px; min-height: 0; padding: 14px 16px; text-align: left; }
    .tile__icon { grid-area: icon; }
    .tile strong { grid-area: name; align-self: end; }
    .tile__copy { grid-area: copy; align-self: start; }
    .tile__badge { top: 7px; right: 7px; }
  }
</style>
