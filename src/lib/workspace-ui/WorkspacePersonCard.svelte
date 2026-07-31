<script lang="ts">
  import type { Snippet } from 'svelte';
  import { personInitials } from '$lib/ui/person';

  export type PersonRole = { label: string; color?: string | null };
  export type PersonDetail = {
    kind: 'mail' | 'phone' | 'id' | 'text';
    value: string;
    muted?: boolean;
  };

  let {
    name,
    accent = null,
    roles = [],
    details = [],
    dimmed = false,
    statusLabel = null,
    statusTone = 'ok',
    onactivate = null,
    lead,
    tags
  }: {
    name: string;
    /** Primary position colour: rings the avatar and tints the card's edge. */
    accent?: string | null;
    /** Every position they hold, not just the first one the grid had room for. */
    roles?: PersonRole[];
    details?: PersonDetail[];
    dimmed?: boolean;
    statusLabel?: string | null;
    statusTone?: 'ok' | 'neutral' | 'warn' | 'danger';
    onactivate?: (() => void) | null;
    /** Page-specific block between the identity and the contact details. */
    lead?: Snippet;
    /** Page-specific footer: contract, access, readiness — whatever this tab is about. */
    tags?: Snippet;
  } = $props();

  const style = $derived(accent ? `--person-accent:${accent};` : '');
</script>

{#snippet body()}
  <span class="person__edge" aria-hidden="true"></span>

  <span class="person__head">
    <span class="person__avatar" aria-hidden="true">{personInitials(name || '?')}</span>
    <span class="person__identity">
      <span class="person__name">{name}</span>
      {#if roles.length}
        <span class="person__roles">
          <!-- Unkeyed on purpose: two positions can legitimately share a label
               (or both fall back to the same placeholder), and a duplicate key
               would take the whole page down over a cosmetic list. -->
          {#each roles as role}
            <span class="person__role" style={role.color ? `--role:${role.color}` : ''}>
              <i aria-hidden="true"></i>{role.label}
            </span>
          {/each}
        </span>
      {/if}
    </span>
    {#if statusLabel}
      <span class="person__status is-{statusTone}" title={statusLabel}>
        <i aria-hidden="true"></i>{statusLabel}
      </span>
    {/if}
  </span>

  {#if lead}<span class="person__lead">{@render lead()}</span>{/if}

  {#if details.length}
    <span class="person__details">
      {#each details as detail}
        <span class="person__detail" class:is-muted={detail.muted}>
          {#if detail.kind === 'mail'}
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" />
            </svg>
          {:else if detail.kind === 'phone'}
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" />
            </svg>
          {:else if detail.kind === 'id'}
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M14 10h4M14 14h4M6 16c.8-1.4 4.4-1.4 5.2 0" />
            </svg>
          {/if}
          <span>{detail.value}</span>
        </span>
      {/each}
    </span>
  {/if}

  {#if tags}<span class="person__tags">{@render tags()}</span>{/if}
{/snippet}

{#if onactivate}
  <button class="person is-clickable" class:is-dimmed={dimmed} {style} type="button" onclick={onactivate}>
    {@render body()}
  </button>
{:else}
  <div class="person" class:is-dimmed={dimmed} {style}>{@render body()}</div>
{/if}

<style>
  /* A person is an identity plus the facts this tab is about. The grid can only
     give each fact a column; here the position colour, the status and the
     contact reach all read at once, and every role they hold fits instead of
     collapsing into "+1". */
  .person {
    --person-accent: var(--rst-ui-line-strong);
    position: relative;
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 9px;
    overflow: hidden;
    padding: 13px 14px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: 14px;
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-panel);
    font: inherit;
    text-align: left;
    transition: border-color .16s ease, box-shadow .18s ease, transform .18s ease;
  }

  .person.is-dimmed { opacity: .6; }

  .person__edge {
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--person-accent);
  }

  .person.is-clickable { cursor: pointer; }
  .person.is-clickable:hover {
    border-color: color-mix(in srgb, var(--person-accent) 46%, var(--rst-ui-line));
    box-shadow: 0 10px 24px rgba(15, 23, 42, .09);
    transform: translateY(-2px);
  }
  .person.is-clickable:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--person-accent) 55%, transparent);
    outline-offset: 2px;
  }

  .person__head { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }

  .person__avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    color: color-mix(in srgb, var(--person-accent) 88%, var(--rst-ui-text));
    background: color-mix(in srgb, var(--person-accent) 17%, var(--rst-ui-surface-field));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--person-accent) 40%, transparent);
    font-size: var(--rst-fs-control);
    font-weight: var(--rst-fw-bold);
  }

  .person__identity { min-width: 0; display: grid; gap: 4px; }
  .person__name {
    overflow: hidden;
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .person__roles { display: flex; flex-wrap: wrap; gap: 4px; }
  .person__role {
    --role: var(--rst-ui-line-strong);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    overflow: hidden;
    padding: 1.5px 7px 1.5px 5px;
    border: 1px solid color-mix(in srgb, var(--role) 30%, transparent);
    border-radius: var(--rst-ui-radius-pill);
    background: color-mix(in srgb, var(--role) 10%, transparent);
    color: var(--rst-ui-text);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .person__role i { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--role); }

  .person__status {
    flex: none;
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--rst-ui-muted);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    white-space: nowrap;
  }
  .person__status i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .person__status.is-ok { color: var(--cl-ok, #157f4b); }
  .person__status.is-warn { color: var(--rst-state-warning-text, #8a5a00); }
  .person__status.is-danger { color: var(--rst-state-danger-text, #b3261e); }

  .person__lead { display: block; }

  .person__details {
    display: grid;
    gap: 4px;
    padding-top: 9px;
    border-top: 1px solid var(--rst-ui-divider-soft);
  }
  .person__detail {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: var(--rst-ui-text);
    font-size: var(--rst-fs-caption);
  }
  .person__detail > svg { flex: none; color: var(--rst-ui-muted); }
  .person__detail > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .person__detail.is-muted { color: var(--rst-ui-muted); }

  .person__tags { display: flex; flex-wrap: wrap; gap: 4px; }
</style>
