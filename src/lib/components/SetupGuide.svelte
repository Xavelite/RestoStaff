<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  export type SetupStep = {
    label: string;
    detail: string;
    complete: boolean;
    href: string;
    onselect?: () => void;
  };
  let { title = 'Setup readiness', steps }: { title?: string; steps: SetupStep[] } = $props();
  const complete = $derived(steps.filter((step) => step.complete).length);
</script>

<section class="guide" aria-label={t(title)}>
  <header>
    <div><span>{t('Setup guide')}</span><h2>{t(title)}</h2></div>
    <strong>{complete}/{steps.length}</strong>
  </header>
  <div class="progress"><i style:width={`${steps.length ? (complete / steps.length) * 100 : 0}%`}></i></div>
  <div class="steps">
    {#each steps as step (step.label)}
      <a class:is-complete={step.complete} href={step.href} onclick={step.onselect}>
        <span aria-hidden="true">{step.complete ? '✓' : '→'}</span>
        <span><strong>{t(step.label)}</strong><small>{t(step.detail)}</small></span>
      </a>
    {/each}
  </div>
</section>

<style>
  .guide {
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
    background: var(--rst-ui-surface-panel);
  }
  header {
    min-height: var(--rst-head-min-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--rst-head-pad);
    background: var(--rst-ui-surface-panel-head);
  }
  header span { color: var(--rst-ui-panel-title); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  h2 { margin: 3px 0 0; font-size: 15px; }
  header > strong { color: var(--rst-state-info-text); }
  .progress { height: 3px; background: var(--rst-ui-divider-soft); }
  .progress i { display: block; height: 100%; background: var(--rst-state-success); }
  .steps { display: grid; }
  a {
    display: grid;
    grid-template-columns: 28px 1fr;
    align-items: center;
    gap: 9px;
    padding: 10px 14px;
    color: var(--rst-ui-text);
    border-bottom: 1px solid var(--rst-ui-divider-soft);
    text-decoration: none;
  }
  a:hover { background: var(--rst-ui-section-row-hover); }
  a > span:first-child {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-state-warning-text);
    background: var(--rst-state-warning-bg);
    font-size: 11px;
  }
  a.is-complete > span:first-child { color: var(--rst-state-success-text); background: var(--rst-state-success-bg); }
  a > span:last-child { display: grid; gap: 2px; }
  a strong { font-size: 12px; }
  small { color: var(--rst-ui-muted); font-size: 10px; }
</style>
