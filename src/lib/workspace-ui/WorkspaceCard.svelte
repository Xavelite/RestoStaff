<script lang="ts">
  import type { Snippet } from 'svelte';

  export type CardBadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';
  export type CardBadge = { label: string; tone?: CardBadgeTone };
  export type CardMeta = { label: string; value: string; muted?: boolean };

  let {
    accent = null,
    initials = null,
    title,
    subtitle = null,
    badges = [],
    meta = [],
    onactivate = null,
    media,
    children
  }: {
    /** Entity colour — drives the card's hairline, tint and medallion ring. */
    accent?: string | null;
    initials?: string | null;
    title: string;
    subtitle?: string | null;
    badges?: CardBadge[];
    meta?: CardMeta[];
    onactivate?: (() => void) | null;
    media?: Snippet;
    children?: Snippet;
  } = $props();

  // The accent is an author-supplied colour token, so every tint derives from it
  // rather than each surface inventing its own washes.
  const style = $derived(accent ? `--card-accent:${accent};` : '');
</script>

{#snippet body()}
  <span class="card__rule" aria-hidden="true"></span>

  <header class="card__head">
    {#if media}
      <span class="card__media">{@render media()}</span>
    {:else if initials}
      <span class="card__medallion" aria-hidden="true">{initials}</span>
    {/if}
    <span class="card__identity">
      <strong class="card__title">{title}</strong>
      {#if subtitle}<small class="card__subtitle">{subtitle}</small>{/if}
    </span>
  </header>

  {#if badges.length}
    <div class="card__badges">
      {#each badges as badge (badge.label)}
        <span class="card__badge is-{badge.tone ?? 'neutral'}">{badge.label}</span>
      {/each}
    </div>
  {/if}

  {#if meta.length}
    <dl class="card__meta">
      {#each meta as row (row.label)}
        <div>
          <dt>{row.label}</dt>
          <dd class:is-muted={row.muted}>{row.value}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  {#if children}
    <div class="card__extra">{@render children()}</div>
  {/if}
{/snippet}

{#if onactivate}
  <button class="card is-clickable" class:has-accent={Boolean(accent)} {style} type="button" onclick={onactivate}>
    {@render body()}
  </button>
{:else}
  <article class="card" class:has-accent={Boolean(accent)} {style}>
    {@render body()}
  </article>
{/if}

<style>
  .card {
    --card-accent: var(--rst-ui-line-strong);
    position: relative;
    isolation: isolate;
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 10px;
    overflow: hidden;
    padding: 15px 15px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 14px;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-panel);
    box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
    text-align: left;
    font: inherit;
    transition: border-color .16s ease, box-shadow .18s ease, transform .18s ease;
  }

  /* A whisper of the entity's colour, so a wall of cards still reads as sorted
     by area or role without shouting a full colour block at the eye. */
  .card.has-accent::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 0 auto auto 0;
    width: 180px;
    height: 120px;
    background: radial-gradient(120px 80px at 0 0, color-mix(in srgb, var(--card-accent) 13%, transparent), transparent 70%);
    pointer-events: none;
  }

  .card__rule {
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: var(--card-accent);
    opacity: .85;
  }

  .card.is-clickable { cursor: pointer; }
  .card.is-clickable:hover {
    border-color: color-mix(in srgb, var(--card-accent) 42%, var(--rst-ui-line));
    box-shadow: 0 10px 26px rgba(15, 23, 42, .09), 0 2px 6px rgba(15, 23, 42, .05);
    transform: translateY(-2px);
  }
  .card.is-clickable:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--card-accent) 55%, transparent);
    outline-offset: 2px;
  }

  .card__head { display: flex; align-items: center; gap: 11px; min-width: 0; }

  .card__medallion,
  .card__media {
    flex: none;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    color: color-mix(in srgb, var(--card-accent) 78%, var(--rst-ui-text));
    background: color-mix(in srgb, var(--card-accent) 12%, var(--rst-ui-surface-field));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--card-accent) 26%, transparent);
    font-size: var(--rst-fs-control);
    font-weight: var(--rst-fw-bold);
    letter-spacing: .01em;
  }

  .card__identity { min-width: 0; display: grid; gap: 2px; }
  .card__title {
    overflow: hidden;
    font-size: var(--rst-fs-body-lg);
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card__subtitle {
    overflow: hidden;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card__badges { display: flex; flex-wrap: wrap; gap: 5px; }
  .card__badge {
    padding: 2px 8px;
    border: 1px solid transparent;
    border-radius: var(--rst-ui-radius-pill);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
    white-space: nowrap;
  }
  .card__badge.is-neutral { color: var(--rst-ui-muted); background: var(--rst-ui-surface-field-strong); }
  .card__badge.is-accent { color: var(--rst-ui-action); background: var(--rst-ui-action-soft); }
  .card__badge.is-ok { color: var(--cl-ok, #157f4b); background: color-mix(in srgb, var(--cl-ok, #157f4b) 12%, transparent); }
  .card__badge.is-warn { color: var(--rst-state-warning-text, #8a5a00); background: color-mix(in srgb, var(--rst-state-warning, #d99a1c) 16%, transparent); }
  .card__badge.is-danger { color: var(--rst-state-danger-text, #b3261e); background: color-mix(in srgb, var(--rst-state-danger, #d33) 12%, transparent); }

  .card__meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 9px 12px;
    margin: 1px 0 0;
    padding-top: 11px;
    border-top: 1px solid var(--rst-ui-divider-soft);
  }
  .card__meta > div { min-width: 0; display: grid; gap: 2px; }
  .card__meta dt {
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .card__meta dd {
    overflow: hidden;
    margin: 0;
    font-size: var(--rst-fs-control);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card__meta dd.is-muted { color: var(--rst-ui-muted); }

  .card__extra { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
</style>
