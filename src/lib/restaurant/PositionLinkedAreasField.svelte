<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import WorkspaceAreaIcon from './WorkspaceAreaIcon.svelte';

  export type PositionLinkedAreaOption = {
    id: string;
    name: string;
    color: string;
    iconKey: string;
  };

  let {
    areas,
    selectedIds,
    recommendedIds = [],
    disabled = false,
    label = t('Linked areas'),
    onchange
  }: {
    areas: PositionLinkedAreaOption[];
    selectedIds: string[];
    recommendedIds?: string[];
    disabled?: boolean;
    label?: string;
    onchange: (areaIds: string[]) => void;
  } = $props();

  let open = $state(false);
  let search = $state('');
  let root = $state<HTMLElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLElement | null>(null);
  let menuLeft = $state(0);
  let menuTop = $state(0);

  const selected = $derived.by(() => {
    const ids = new Set(selectedIds);
    return areas.filter((area) => ids.has(area.id));
  });
  const interactionDisabled = $derived(disabled || !areas.length);
  const selectionSummary = $derived(
    selected.length
      ? selected.map((area) => area.name).join(', ')
      : t('All areas')
  );
  const recommended = $derived(new Set(recommendedIds));
  const filtered = $derived.by(() => {
    const term = search.trim().toLocaleLowerCase();
    return term
      ? areas.filter((area) => area.name.toLocaleLowerCase().includes(term))
      : areas;
  });

  function positionMenu(): void {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = menu?.offsetWidth || 320;
    const height = menu?.offsetHeight || 320;
    const roomBelow = window.innerHeight - rect.bottom;
    menuLeft = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    menuTop =
      roomBelow >= Math.min(height, 360) + 10
        ? rect.bottom + 4
        : Math.max(12, rect.top - Math.min(height, 360) - 4);
  }

  async function toggleMenu(): Promise<void> {
    if (interactionDisabled) return;
    open = !open;
    if (!open) {
      search = '';
      return;
    }
    await tick();
    positionMenu();
    menu?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }

  function close(returnFocus = false): void {
    if (!open) return;
    open = false;
    search = '';
    if (returnFocus) void tick().then(() => trigger?.focus());
  }

  function toggleArea(areaId: string): void {
    if (interactionDisabled) return;
    const selected = new Set(selectedIds);
    selected.has(areaId) ? selected.delete(areaId) : selected.add(areaId);
    onchange(areas.filter((area) => selected.has(area.id)).map((area) => area.id));
  }

  function handleMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (!menu || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const controls = Array.from(
      menu.querySelectorAll<HTMLElement>('input[type="search"], button:not(:disabled)')
    );
    if (!controls.length) return;
    const current = Math.max(0, controls.indexOf(document.activeElement as HTMLElement));
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    event.preventDefault();
    controls[(current + offset + controls.length) % controls.length]?.focus();
  }

  function handleFocusout(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && root?.contains(next)) return;
    void tick().then(() => {
      const active = document.activeElement;
      if (open && (!active || !root?.contains(active))) close();
    });
  }

  $effect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (root && !root.contains(event.target as Node)) close();
    };
    const onReposition = () => positionMenu();
    window.addEventListener('click', onDocumentClick, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('click', onDocumentClick, true);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  });
</script>

<div class="linked-areas" bind:this={root} onfocusout={handleFocusout}>
  <button
    bind:this={trigger}
    class="linked-areas__trigger"
    class:is-empty={!selected.length}
    type="button"
    disabled={interactionDisabled}
    aria-label={`${label}: ${selectionSummary}`}
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={toggleMenu}
  >
    {#if selected.length}
      <span class="linked-areas__icons" aria-hidden="true">
        {#each selected.slice(0, 3) as area (area.id)}
          <WorkspaceAreaIcon
            icon={area.iconKey}
            color={area.color}
            size={14}
            compact
          />
        {/each}
      </span>
      <span class="linked-areas__summary">
        {#if selected.length <= 2}
          {selected.map((area) => area.name).join(', ')}
        {:else}
          {selected.slice(0, 2).map((area) => area.name).join(', ')}
          <small>+{selected.length - 2}</small>
        {/if}
      </span>
    {:else}
      <span class="linked-areas__empty">{t('All areas')}</span>
    {/if}
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path d="m6.5 8 3.5 3.5L13.5 8" />
    </svg>
  </button>

  {#if open}
    <div
      bind:this={menu}
      class="linked-areas__menu"
      style={`left:${menuLeft}px;top:${menuTop}px`}
      role="dialog"
      aria-label={label}
      tabindex="-1"
      onkeydown={handleMenuKeydown}
    >
      <div class="linked-areas__head">
        <strong>{label}</strong>
        <span>{selected.length ? `${selected.length}/${areas.length}` : t('All areas')}</span>
      </div>
      <label class="linked-areas__search">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          type="search"
          bind:value={search}
          aria-label={t('Search areas')}
          placeholder={t('Search areas')}
        />
      </label>
      <div
        class="linked-areas__options"
        role="listbox"
        aria-label={label}
        aria-multiselectable="true"
      >
        {#each filtered as area (area.id)}
          {@const checked = selectedIds.includes(area.id)}
          <button
            class:is-selected={checked}
            type="button"
            role="option"
            aria-selected={checked}
            onclick={() => toggleArea(area.id)}
          >
            <span class="linked-areas__check" aria-hidden="true">
              {#if checked}
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="m4 10 4 4 8-9" />
                </svg>
              {/if}
            </span>
            <WorkspaceAreaIcon
              icon={area.iconKey}
              color={area.color}
              size={15}
              compact
            />
            <span>{area.name}</span>
            {#if recommended.has(area.id)}
              <small>{t('Recommended')}</small>
            {/if}
          </button>
        {:else}
          <p>{t('No matching system areas')}</p>
        {/each}
      </div>
      <div class="linked-areas__footer">
        <button
          type="button"
          disabled={!selected.length}
          onclick={() => onchange([])}
        >
          {t('All areas')}
        </button>
        <button type="button" onclick={() => close(true)}>{t('Done')}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .linked-areas {
    position: relative;
    min-width: 210px;
  }

  .linked-areas__trigger {
    width: 100%;
    min-height: 34px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 14px;
    align-items: center;
    gap: 7px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: var(--cl-radius);
    color: var(--cl-ink);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-control);
    text-align: left;
    cursor: pointer;
  }

  .linked-areas__trigger:hover,
  .linked-areas__trigger:focus-visible,
  .linked-areas__trigger[aria-expanded='true'] {
    border-color: var(--cl-line);
    background: var(--cl-surface-muted);
    outline: 0;
  }

  .linked-areas__trigger:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .linked-areas__trigger.is-empty {
    grid-template-columns: minmax(0, 1fr) 14px;
  }

  .linked-areas__icons {
    display: flex;
    align-items: center;
  }

  .linked-areas__icons :global(.area-icon + .area-icon) {
    margin-left: -3px;
  }

  .linked-areas__summary {
    min-width: 0;
    overflow: hidden;
    color: var(--cl-ink);
    font-weight: var(--rst-fw-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .linked-areas__summary small {
    margin-left: 3px;
    color: var(--cl-muted);
    font: inherit;
  }

  .linked-areas__empty {
    color: var(--cl-muted);
  }

  .linked-areas__trigger > svg {
    color: var(--cl-muted);
    transition: transform var(--cl-dur) var(--cl-ease);
  }

  .linked-areas__trigger[aria-expanded='true'] > svg {
    transform: rotate(180deg);
  }

  .linked-areas__menu {
    position: fixed;
    z-index: var(--rst-z-popover);
    width: min(320px, calc(100vw - 24px));
    max-height: min(420px, calc(100vh - 24px));
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    overflow: hidden;
    border: 1px solid var(--cl-line-strong);
    border-radius: 8px;
    background: var(--cl-surface);
    box-shadow:
      0 14px 36px rgba(15, 23, 42, 0.17),
      0 3px 10px rgba(15, 23, 42, 0.08);
  }

  .linked-areas__head,
  .linked-areas__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 10px;
  }

  .linked-areas__head {
    border-bottom: 1px solid var(--cl-line);
  }

  .linked-areas__head strong {
    font-size: var(--rst-fs-control);
  }

  .linked-areas__head span {
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    font-variant-numeric: tabular-nums;
  }

  .linked-areas__search {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    margin: 8px;
    padding: 0 8px;
    border: 1px solid var(--cl-line);
    border-radius: 5px;
    color: var(--cl-muted);
    background: var(--cl-surface-muted);
  }

  .linked-areas__search:focus-within {
    border-color: var(--cl-accent);
    box-shadow: 0 0 0 2px var(--cl-accent-wash);
  }

  .linked-areas__search input {
    min-width: 0;
    height: 32px;
    padding: 0;
    border: 0;
    outline: 0;
    color: var(--cl-ink);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-control);
  }

  .linked-areas__options {
    overflow: auto;
    padding: 0 6px 6px;
  }

  .linked-areas__options > button {
    width: 100%;
    min-height: 38px;
    display: grid;
    grid-template-columns: 16px 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 5px 7px;
    border: 0;
    border-radius: 5px;
    color: var(--cl-ink);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-control);
    text-align: left;
    cursor: pointer;
  }

  .linked-areas__options > button:hover,
  .linked-areas__options > button:focus-visible {
    background: var(--cl-surface-muted);
    outline: 0;
  }

  .linked-areas__options > button.is-selected {
    background: var(--cl-accent-wash);
  }

  .linked-areas__check {
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border: 1px solid var(--cl-line-strong);
    border-radius: 4px;
    color: white;
    background: var(--cl-surface);
  }

  .is-selected .linked-areas__check {
    border-color: var(--cl-accent);
    background: var(--cl-accent);
  }

  .linked-areas__options small {
    color: var(--cl-accent);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .linked-areas__options p {
    margin: 0;
    padding: 16px 10px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
    text-align: center;
  }

  .linked-areas__footer {
    justify-content: flex-end;
    border-top: 1px solid var(--cl-line);
  }

  .linked-areas__footer button {
    min-height: 30px;
    padding: 4px 9px;
    border: 1px solid var(--cl-line);
    border-radius: 5px;
    color: var(--cl-ink);
    background: var(--cl-surface);
    font: inherit;
    font-size: var(--rst-fs-label);
    cursor: pointer;
  }

  .linked-areas__footer button:last-child {
    border-color: var(--cl-accent);
    color: white;
    background: var(--cl-accent);
  }

  .linked-areas__footer button:disabled {
    cursor: default;
    opacity: 0.45;
  }
</style>
