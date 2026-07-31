<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    label,
    onprevious,
    onnext,
    ontoday,
    todayLabel = 'Today'
  }: {
    label: string;
    onprevious: () => void;
    onnext: () => void;
    ontoday?: () => void;
    todayLabel?: string;
  } = $props();
</script>

<!-- Plain previous / label / next. The period is the page's subject, so it
     reads as one control group rather than three scattered buttons. -->
<div class="nav">
  <button class="cl-btn is-icon" type="button" aria-label={t('Previous')} onclick={onprevious}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
  </button>
  <span class="nav__label">{label}</span>
  <button class="cl-btn is-icon" type="button" aria-label={t('Next')} onclick={onnext}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
  </button>
  {#if ontoday}
    <button class="cl-btn" type="button" onclick={ontoday}>{t(todayLabel)}</button>
  {/if}
</div>

<style>
  .nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav__label {
    min-width: 190px;
    padding: 0 4px;
    font-size: var(--rst-fs-body-lg);
    font-weight: var(--rst-fw-bold);
    text-align: center;
    white-space: nowrap;
  }
  @media (max-width: 520px) {
    .nav__label { min-width: 0; }
  }
</style>
