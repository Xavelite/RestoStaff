<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    meta = null,
    color = null,
    children
  }: {
    label: string;
    /** The count, phrased by the caller so it can say people / positions / areas. */
    meta?: string | null;
    color?: string | null;
    children: Snippet;
  } = $props();
</script>

<!-- Grouping is a decision the person made in the grid's column menu, so the
     visual layout has to honour it too. Without this the card view silently
     dropped an organising dimension the rows were showing. -->
<section class="card-group" style={color ? `--group-tone:${color}` : ''}>
  <header class="card-group__head">
    <strong>{label}</strong>
    {#if meta}<small>{meta}</small>{/if}
    <i aria-hidden="true"></i>
  </header>
  {@render children()}
</section>

<style>
  .card-group { --group-tone: var(--rst-ui-line-strong); display: grid; }

  .card-group__head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 14px 14px 0;
  }

  .card-group__head strong {
    color: var(--rst-ui-text);
    font-size: var(--rst-fs-label);
    font-weight: var(--rst-fw-bold);
  }

  .card-group__head small {
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-medium);
    white-space: nowrap;
  }

  /* The rule carries the group's colour and takes the leftover width, so a wall
     of cards still reads as sections without a heavy banner on each one. */
  .card-group__head i {
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--group-tone) 42%, transparent),
      transparent
    );
  }
</style>
