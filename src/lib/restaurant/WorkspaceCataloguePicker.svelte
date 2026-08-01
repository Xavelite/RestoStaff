<script lang="ts" module>
  export type WorkspaceCataloguePickerItem = {
    key: string;
    label: string;
    category: string;
    icon?: string;
    color?: string;
    recommended?: boolean;
    disabled?: boolean;
    disabledReason?: string;
  };
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { portal } from '$lib/actions/portal';
  import { t } from '$lib/i18n/i18n.svelte';
  import WorkspaceAreaIcon from './WorkspaceAreaIcon.svelte';

  let {
    inputId,
    value = $bindable(''),
    selectedKey = '',
    items,
    placeholder = '',
    label,
    disabled = false,
    recommendedLabel = t('Recommended'),
    allLabel = t('All catalogue items'),
    customLabel = t('Custom item'),
    browseLabel = t('Browse catalogue'),
    noMatchesLabel = t('No matching catalogue items'),
    customDescription = t('Create something specific to your restaurant'),
    formatCustomLabel,
    onvaluechange,
    onselect,
    oncustom,
    onclose
  }: {
    inputId: string;
    value?: string;
    selectedKey?: string;
    items: WorkspaceCataloguePickerItem[];
    placeholder?: string;
    label: string;
    disabled?: boolean;
    recommendedLabel?: string;
    allLabel?: string;
    customLabel?: string;
    browseLabel?: string;
    noMatchesLabel?: string;
    customDescription?: string;
    formatCustomLabel?: (value: string) => string;
    onvaluechange?: (value: string) => void;
    onselect: (item: WorkspaceCataloguePickerItem) => void;
    oncustom: (value: string) => void;
    onclose?: () => void;
  } = $props();

  type PickerChoice =
    | { id: string; kind: 'item'; item: WorkspaceCataloguePickerItem }
    | { id: string; kind: 'custom' };

  const listboxId = $derived(`${inputId}-options`);
  let root = $state<HTMLElement | null>(null);
  let input = $state<HTMLInputElement | null>(null);
  let menu = $state<HTMLElement | null>(null);
  let open = $state(false);
  let query = $state('');
  let activeIndex = $state(0);
  let menuLeft = $state(0);
  let menuTop = $state(0);
  let menuWidth = $state(340);

  const matchingItems = $derived.by(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      `${item.label} ${item.category}`.toLocaleLowerCase().includes(term)
    );
  });
  const recommendedItems = $derived(matchingItems.filter((item) => item.recommended));
  const otherItems = $derived(matchingItems.filter((item) => !item.recommended));
  const enabledChoices = $derived.by<PickerChoice[]>(() => [
    ...[...recommendedItems, ...otherItems]
      .filter((item) => !item.disabled)
      .map((item) => ({ id: `${listboxId}-${item.key}`, kind: 'item' as const, item })),
    { id: `${listboxId}-custom`, kind: 'custom' as const }
  ]);
  const activeChoice = $derived(enabledChoices[activeIndex] ?? enabledChoices[0] ?? null);

  function positionMenu(): void {
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const width = Math.min(390, Math.max(320, rect.width + 54));
    const height = menu?.offsetHeight ?? 360;
    const roomBelow = window.innerHeight - rect.bottom;
    menuWidth = Math.min(width, window.innerWidth - 24);
    menuLeft = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
    menuTop =
      roomBelow >= Math.min(height, 420) + 10
        ? rect.bottom + 5
        : Math.max(12, rect.top - Math.min(height, 420) - 5);
  }

  async function show(resetQuery = true): Promise<void> {
    if (disabled) return;
    if (resetQuery) query = '';
    open = true;
    const selectedIndex = enabledChoices.findIndex(
      (choice) => choice.kind === 'item' && choice.item.key === selectedKey
    );
    activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
    await tick();
    positionMenu();
    await tick();
    positionMenu();
  }

  function close(returnFocus = false): void {
    if (!open) return;
    open = false;
    query = '';
    onclose?.();
    if (returnFocus) void tick().then(() => input?.focus());
  }

  function choose(item: WorkspaceCataloguePickerItem): void {
    if (item.disabled) return;
    value = item.label;
    onselect(item);
    close();
  }

  function chooseCustom(): void {
    oncustom(value.trim());
    close(true);
  }

  function chooseActive(): void {
    if (!activeChoice) return;
    if (activeChoice.kind === 'item') choose(activeChoice.item);
    else chooseCustom();
  }

  function moveActive(direction: 1 | -1): void {
    const count = enabledChoices.length;
    if (!count) return;
    activeIndex = (activeIndex + direction + count) % count;
    void tick().then(() => {
      document
        .getElementById(activeChoice?.id ?? '')
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  function handleInput(event: Event): void {
    value = (event.currentTarget as HTMLInputElement).value;
    query = value;
    onvaluechange?.(value);
    if (!open) void show(false);
    activeIndex = 0;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        void show();
        return;
      }
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' && open) {
      event.preventDefault();
      activeIndex = 0;
      return;
    }
    if (event.key === 'End' && open) {
      event.preventDefault();
      activeIndex = Math.max(0, enabledChoices.length - 1);
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      chooseActive();
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') close();
  }

  function customTitle(): string {
    const name = value.trim();
    return name ? formatCustomLabel?.(name) ?? t('Use “{name}”', { name }) : customLabel;
  }

  $effect(() => {
    const count = enabledChoices.length;
    if (activeIndex >= count) activeIndex = Math.max(0, count - 1);
  });

  $effect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root?.contains(target) && !menu?.contains(target)) close();
    };
    const onReposition = () => positionMenu();
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  });
</script>

<div class="catalogue-picker" bind:this={root}>
  <input
    bind:this={input}
    id={inputId}
    class="cl-field catalogue-picker__input"
    type="text"
    role="combobox"
    autocomplete="off"
    aria-label={label}
    aria-autocomplete="list"
    aria-expanded={open}
    aria-controls={open ? listboxId : undefined}
    aria-activedescendant={open ? activeChoice?.id : undefined}
    aria-haspopup="listbox"
    {placeholder}
    {disabled}
    {value}
    onclick={() => {
      if (!open) void show();
    }}
    oninput={handleInput}
    onkeydown={handleKeydown}
  />
  <button
    class="catalogue-picker__toggle"
    type="button"
    {disabled}
    aria-label={browseLabel}
    aria-expanded={open}
    aria-controls={listboxId}
    tabindex="-1"
    onclick={() => {
      if (open) close(true);
      else void show().then(() => input?.focus());
    }}
  >
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  </button>
</div>

{#if open}
  <div
    use:portal
    bind:this={menu}
    id={listboxId}
    class="catalogue-menu"
    style={`left:${menuLeft}px;top:${menuTop}px;width:${menuWidth}px`}
    role="listbox"
    aria-label={label}
  >
    {#if recommendedItems.length}
      <div class="catalogue-menu__heading">{recommendedLabel}</div>
      {#each recommendedItems as item (item.key)}
        <button
          id={`${listboxId}-${item.key}`}
          class="catalogue-option"
          class:is-active={activeChoice?.kind === 'item' && activeChoice.item.key === item.key}
          class:is-selected={selectedKey === item.key}
          type="button"
          role="option"
          aria-selected={selectedKey === item.key}
          aria-disabled={item.disabled}
          title={item.disabledReason ?? ''}
          tabindex="-1"
          onmouseenter={() => {
            const index = enabledChoices.findIndex(
              (choice) => choice.kind === 'item' && choice.item.key === item.key
            );
            if (index >= 0) activeIndex = index;
          }}
          onpointerdown={(event) => event.preventDefault()}
          onclick={() => choose(item)}
        >
          <WorkspaceAreaIcon icon={item.icon} color={item.color} size={15} />
          <span>
            <strong>{item.label}</strong>
            <small>{item.disabledReason || item.category}</small>
          </span>
          {#if selectedKey === item.key}
            <svg class="catalogue-option__check" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
          {/if}
        </button>
      {/each}
    {/if}

    {#if otherItems.length}
      <div class="catalogue-menu__heading" class:has-border={recommendedItems.length > 0}>
        {allLabel}
      </div>
      {#each otherItems as item (item.key)}
        <button
          id={`${listboxId}-${item.key}`}
          class="catalogue-option"
          class:is-active={activeChoice?.kind === 'item' && activeChoice.item.key === item.key}
          class:is-selected={selectedKey === item.key}
          type="button"
          role="option"
          aria-selected={selectedKey === item.key}
          aria-disabled={item.disabled}
          title={item.disabledReason ?? ''}
          tabindex="-1"
          onmouseenter={() => {
            const index = enabledChoices.findIndex(
              (choice) => choice.kind === 'item' && choice.item.key === item.key
            );
            if (index >= 0) activeIndex = index;
          }}
          onpointerdown={(event) => event.preventDefault()}
          onclick={() => choose(item)}
        >
          <WorkspaceAreaIcon icon={item.icon} color={item.color} size={15} />
          <span>
            <strong>{item.label}</strong>
            <small>{item.disabledReason || item.category}</small>
          </span>
          {#if selectedKey === item.key}
            <svg class="catalogue-option__check" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
          {/if}
        </button>
      {/each}
    {/if}

    {#if !matchingItems.length}
      <div class="catalogue-menu__empty">{noMatchesLabel}</div>
    {/if}

    <button
      id={`${listboxId}-custom`}
      class="catalogue-option catalogue-option--custom"
      class:is-active={activeChoice?.kind === 'custom'}
      type="button"
      role="option"
      aria-selected={!selectedKey}
      tabindex="-1"
      onmouseenter={() => {
        const index = enabledChoices.findIndex((choice) => choice.kind === 'custom');
        if (index >= 0) activeIndex = index;
      }}
      onpointerdown={(event) => event.preventDefault()}
      onclick={chooseCustom}
    >
      <span class="catalogue-option__plus" aria-hidden="true">+</span>
      <span>
        <strong>{customTitle()}</strong>
        <small>{customDescription}</small>
      </span>
    </button>
  </div>
{/if}

<style>
  .catalogue-picker {
    position: relative;
    width: 100%;
  }

  .catalogue-picker__input {
    width: 100%;
    padding-right: 32px;
  }

  .catalogue-picker__toggle {
    position: absolute;
    top: 50%;
    right: 4px;
    width: 25px;
    height: 25px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    color: var(--cl-muted);
    background: transparent;
    cursor: pointer;
    transform: translateY(-50%);
  }

  .catalogue-picker__toggle:hover:not(:disabled),
  .catalogue-picker__toggle[aria-expanded='true'] {
    color: var(--cl-accent);
    background: var(--cl-accent-wash);
  }

  .catalogue-picker__toggle:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .catalogue-menu {
    position: fixed;
    z-index: var(--rst-z-popover);
    max-height: min(420px, calc(100vh - 24px));
    overflow-y: auto;
    padding: 6px;
    border: 1px solid var(--cl-line-strong);
    border-radius: 7px;
    background: var(--cl-surface);
    box-shadow: 0 14px 36px rgba(15, 23, 42, 0.17), 0 3px 10px rgba(15, 23, 42, 0.08);
  }

  .catalogue-menu__heading {
    padding: 7px 9px 5px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .catalogue-menu__heading.has-border {
    margin-top: 5px;
    padding-top: 10px;
    border-top: 1px solid var(--cl-line);
  }

  .catalogue-option {
    width: 100%;
    min-height: 44px;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 5px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--cl-ink);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .catalogue-option:hover:not([aria-disabled='true']),
  .catalogue-option.is-active:not([aria-disabled='true']) {
    border-color: color-mix(in srgb, var(--cl-accent) 20%, var(--cl-line));
    background: var(--cl-accent-wash);
  }

  .catalogue-option.is-selected {
    color: var(--cl-accent);
  }

  .catalogue-option[aria-disabled='true'] {
    color: var(--cl-muted);
    cursor: not-allowed;
    opacity: 0.57;
  }

  .catalogue-option :global(.area-icon) {
    width: 30px;
    height: 30px;
    border-radius: 6px;
  }

  .catalogue-option > span:not(.catalogue-option__plus) {
    min-width: 0;
  }

  .catalogue-option strong,
  .catalogue-option small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .catalogue-option strong {
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-semibold);
  }

  .catalogue-option small {
    margin-top: 2px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
    text-transform: capitalize;
  }

  .catalogue-option__check {
    color: var(--cl-accent);
  }

  .catalogue-option--custom {
    margin-top: 6px;
    border-top-color: var(--cl-line);
    border-radius: 0 0 6px 6px;
  }

  .catalogue-option__plus {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px dashed color-mix(in srgb, var(--cl-accent) 42%, var(--cl-line));
    border-radius: 6px;
    color: var(--cl-accent);
    background: var(--cl-accent-wash);
    font-size: var(--rst-fs-title);
    font-weight: var(--rst-fw-medium);
  }

  .catalogue-menu__empty {
    padding: 13px 10px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-control);
    text-align: center;
  }
</style>
