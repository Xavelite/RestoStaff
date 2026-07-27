<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicIcon from '$lib/classic/ClassicIcon.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import { modulesForRole } from '$lib/classic/classic-nav';

  const role = $derived(workspace.effectiveRole);
  const modules = $derived.by(() => {
    const available = modulesForRole(role).filter((module) => module.key !== 'home');
    return [
      ...available.filter((module) => !module.placeholder),
      ...available.filter((module) => module.placeholder)
    ];
  });

  const MODULE_COLOR: Record<string, string> = {
    schedule: 'var(--cl-mod-schedule)',
    time: 'var(--cl-mod-time)',
    team: 'var(--cl-mod-team)',
    restaurant: 'var(--cl-mod-restaurant)',
    payroll: 'var(--cl-mod-payroll)',
    'badge-terminal': 'var(--cl-mod-badge)',
    reports: 'var(--cl-mod-reports)',
    exports: 'var(--cl-mod-reports)',
    reservations: 'var(--cl-mod-schedule)'
  };
</script>

<svelte:head><title>{t('Home')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  <div class="tiles" aria-label={t('Modules')}>
    {#each modules as module (module.key)}
      {@const color = MODULE_COLOR[module.key] ?? 'var(--cl-muted)'}
      {#if module.placeholder}
        <article class="tile tile--upcoming" style="--tile-color:{color}">
          <span class="tile__icon"><ClassicIcon name={module.icon} size={27} /></span>
          <span class="tile__content">
            <strong>{t(module.label)}</strong>
            <span>{t(module.summary)}</span>
          </span>
          <span class="tile__badge">{t('Upcoming')}</span>
        </article>
      {:else}
        <a class="tile" href={module.href} style="--tile-color:{color}">
          <span class="tile__icon"><ClassicIcon name={module.icon} size={27} /></span>
          <span class="tile__content">
            <strong>{t(module.label)}</strong>
            <span>{t(module.summary)}</span>
          </span>
          <span class="tile__arrow" aria-hidden="true">→</span>
        </a>
      {/if}
    {/each}
  </div>
</ClassicPage>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
  .tile {
    position: relative;
    min-height: 166px;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 22px;
    overflow: hidden;
    padding: 22px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
    color: var(--cl-ink);
    text-decoration: none;
    box-shadow: 0 1px 2px rgb(15 23 42 / 3%);
    transition:
      border-color var(--cl-dur) var(--cl-ease),
      box-shadow var(--cl-dur) var(--cl-ease),
      transform var(--cl-dur) var(--cl-ease);
  }
  .tile::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: var(--tile-color);
    opacity: .82;
  }
  .tile:hover {
    border-color: color-mix(in srgb, var(--tile-color) 38%, var(--cl-line));
    box-shadow: 0 10px 24px rgb(15 23 42 / 8%);
    transform: translateY(-2px);
  }
  .tile--upcoming {
    --tile-color: var(--cl-muted) !important;
    cursor: default;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--cl-canvas) 58%, transparent), transparent 60%),
      var(--cl-surface);
  }
  .tile--upcoming:hover {
    border-color: var(--cl-line);
    box-shadow: 0 1px 2px rgb(15 23 42 / 3%);
    transform: none;
  }
  .tile:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--tile-color) 28%, transparent);
    outline-offset: 2px;
  }
  .tile__icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tile-color) 24%, var(--cl-line));
    border-radius: 13px;
    background: color-mix(in srgb, var(--tile-color) 10%, var(--cl-surface));
    color: var(--tile-color);
  }
  .tile__content { display: grid; align-content: end; gap: 6px; }
  .tile__content strong { font-size: 16px; font-weight: var(--rst-fw-bold); }
  .tile__content > span { color: var(--cl-muted); font-size: 12.5px; line-height: 1.45; }
  .tile__arrow {
    position: absolute;
    top: 26px;
    right: 22px;
    color: color-mix(in srgb, var(--tile-color) 74%, var(--cl-muted));
    font-size: 18px;
    opacity: .55;
    transition: transform var(--cl-dur) var(--cl-ease), opacity var(--cl-dur) var(--cl-ease);
  }
  .tile:hover .tile__arrow { transform: translateX(3px); opacity: 1; }
  .tile__badge {
    position: absolute;
    top: 20px;
    right: 18px;
    padding: 4px 8px;
    border: 1px solid var(--cl-line);
    border-radius: 999px;
    color: var(--cl-muted);
    background: var(--cl-surface);
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .055em;
    text-transform: uppercase;
  }

  @media (max-width: 1180px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 760px) {
    .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .tile { min-height: 148px; padding: 18px; }
    .tile__arrow { top: 21px; right: 18px; }
  }
  @media (max-width: 520px) {
    .tiles { grid-template-columns: minmax(0, 1fr); }
    .tile {
      min-height: 0;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      grid-template-rows: auto;
      align-items: center;
      gap: 14px;
      padding: 15px 16px;
    }
    .tile__icon { width: 42px; height: 42px; border-radius: 11px; }
    .tile__content { align-content: center; gap: 3px; }
    .tile__arrow { position: static; font-size: 17px; }
  }
</style>
