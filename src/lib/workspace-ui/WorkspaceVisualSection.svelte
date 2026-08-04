<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    meta = null,
    tone = null,
    icon,
    children
  }: {
    label: string;
    meta?: string | null;
    tone?: string | null;
    icon?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="visual-section" style={tone ? `--visual-tone:${tone}` : undefined}>
  <header>
    {#if icon}<span class="visual-section__icon">{@render icon()}</span>{/if}
    <strong>{label}</strong>
    {#if meta}<small>{meta}</small>{/if}
    <i aria-hidden="true"></i>
  </header>
  <div class="visual-section__body">{@render children()}</div>
</section>

<style>
  .visual-section {
    --visual-tone: var(--rst-ui-line-strong);
    min-width: 0;
    display: grid;
    gap: 9px;
  }

  .visual-section > header {
    min-width: 0;
    min-height: 28px;
    display: grid;
    grid-template-columns: auto auto auto minmax(32px, 1fr);
    align-items: center;
    gap: 7px;
  }

  .visual-section > header strong {
    overflow: hidden;
    color: var(--rst-ui-text);
    font-size: var(--rst-fs-control);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .visual-section > header small {
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-caption);
    white-space: nowrap;
  }

  .visual-section > header i {
    height: 1px;
    margin-left: 4px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--visual-tone) 48%, var(--rst-ui-line)), transparent);
  }

  .visual-section__icon {
    display: inline-grid;
    place-items: center;
    color: var(--visual-tone);
  }

  .visual-section__body { min-width: 0; }

  @media (max-width: 520px) {
    .visual-section > header {
      grid-template-columns: auto minmax(0, auto) auto minmax(18px, 1fr);
    }
  }
</style>
