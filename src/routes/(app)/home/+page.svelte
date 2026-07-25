<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicIcon from '$lib/classic/ClassicIcon.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import { modulesForRole } from '$lib/classic/classic-nav';

  const role = $derived(workspace.effectiveRole);

  // Home is the entry point, not the workbench: the module tiles are the whole
  // page. Anything that needs a decision is surfaced by its own module.
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
</style>
