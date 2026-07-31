<script lang="ts">
  import type { Snippet } from 'svelte';
  import { personInitials } from '$lib/ui/person';

  export type PersonPresence = 'none' | 'ok' | 'warn' | 'danger';

  let {
    name,
    role = null,
    accent = null,
    presence = 'none',
    presenceLabel = null,
    dimmed = false,
    onactivate = null,
    children
  }: {
    name: string;
    /** What they do — the line under the name. */
    role?: string | null;
    /** Their position colour. Rings the avatar and tints its fill. */
    accent?: string | null;
    /** A single dot on the avatar: the one fact worth seeing before reading. */
    presence?: PersonPresence;
    presenceLabel?: string | null;
    dimmed?: boolean;
    onactivate?: (() => void) | null;
    children?: Snippet;
  } = $props();

  const style = $derived(accent ? `--tile-accent:${accent};` : '');
</script>

{#snippet body()}
  <span class="tile__figure">
    <span class="tile__avatar" aria-hidden="true">{personInitials(name || '?')}</span>
    {#if presence !== 'none'}
      <span class="tile__presence is-{presence}" title={presenceLabel ?? undefined}>
        <span class="sr-only">{presenceLabel ?? ''}</span>
      </span>
    {/if}
  </span>
  <span class="tile__name">{name}</span>
  {#if role}<span class="tile__role">{role}</span>{/if}
  {#if children}<span class="tile__facts">{@render children()}</span>{/if}
{/snippet}

{#if onactivate}
  <button class="tile" class:is-dimmed={dimmed} class:is-clickable={true} {style} type="button" onclick={onactivate}>
    {@render body()}
  </button>
{:else}
  <div class="tile" class:is-dimmed={dimmed} {style}>
    {@render body()}
  </div>
{/if}

<style>
  /* A directory reads as faces, not as rows: the avatar leads, the name sits
     under it, and everything else is a quiet caption. At this size a whole
     team is one glance instead of a scroll. */
  .tile {
    --tile-accent: var(--rst-ui-line-strong);
    position: relative;
    min-width: 0;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 2px;
    padding: 14px 9px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 14px;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-panel);
    font: inherit;
    text-align: center;
    transition: border-color .16s ease, box-shadow .18s ease, transform .18s ease;
  }

  .tile.is-dimmed { opacity: .55; }

  .tile.is-clickable { cursor: pointer; }
  .tile.is-clickable:hover {
    border-color: color-mix(in srgb, var(--tile-accent) 48%, var(--rst-ui-line));
    box-shadow: 0 8px 22px rgba(15, 23, 42, .09);
    transform: translateY(-2px);
  }
  .tile.is-clickable:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--tile-accent) 55%, transparent);
    outline-offset: 2px;
  }

  .tile__figure { position: relative; display: block; margin-bottom: 7px; }

  .tile__avatar {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    color: color-mix(in srgb, var(--tile-accent) 88%, var(--rst-ui-text));
    background: color-mix(in srgb, var(--tile-accent) 18%, var(--rst-ui-surface-field));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tile-accent) 42%, transparent);
    font-size: var(--rst-fs-body-lg);
    font-weight: var(--rst-fw-bold);
    letter-spacing: .01em;
  }

  /* One dot carries the single fact that decides whether this person needs
     attention, so the eye can sweep the wall without reading a word. */
  .tile__presence {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    box-shadow: 0 0 0 2.5px var(--rst-ui-surface-panel);
  }
  .tile__presence.is-ok { background: var(--cl-ok, #157f4b); }
  .tile__presence.is-warn { background: var(--rst-state-warning, #d99a1c); }
  .tile__presence.is-danger { background: var(--rst-state-danger); }

  .tile__name {
    max-width: 100%;
    overflow: hidden;
    font-size: var(--rst-fs-control);
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile__role {
    max-width: 100%;
    overflow: hidden;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile__facts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
    margin-top: 6px;
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
