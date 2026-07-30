<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import type { ServiceKey } from '$lib/calendar/date';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';
  import WorkspaceServiceIcon from './WorkspaceServiceIcon.svelte';

  /**
   * The one picker used by every grid cell that chooses a value.
   *
   * A native <select> cannot show the colour and glyph an object carries, so
   * positions, contracts, areas and services each grew their own control. This
   * replaces all of them: the trigger reads as plain text until hovered (like
   * every other grid cell) and the popover is searchable once the list is long.
   */
  type Option = {
    value: string;
    label: string;
    /** Identity colour — drives the dot, or the icon when one is given. */
    color?: string;
    /** Workspace area icon key. Falls back to the generic glyph. */
    icon?: string;
    /** A service, drawn with the same sun/moon glyph the grids use. */
    service?: ServiceKey;
    /** Renders as a plain dot rather than an icon tile. */
    dot?: boolean;
  };

  let {
    value = '',
    options = [],
    onchange,
    disabled = false,
    placeholder = 'Not set',
    ariaLabel = '',
    searchThreshold = 7
  }: {
    value?: string;
    options?: Option[];
    onchange?: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
    ariaLabel?: string;
    searchThreshold?: number;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  let search = $state('');
  let menuLeft = $state(0);
  let menuTop = $state(0);
  let menuWidth = $state(220);

  const selected = $derived(options.find((option) => option.value === value) ?? null);
  const searchable = $derived(options.length > searchThreshold);
  const visible = $derived(
    searchable && search.trim()
      ? options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()))
      : options
  );

  function positionMenu() {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    menuWidth = Math.max(200, rect.width);
    menuLeft = Math.min(Math.max(12, rect.left), window.innerWidth - menuWidth - 12);
    menuTop = Math.min(window.innerHeight - 20, rect.bottom + 4);
  }

  function toggle() {
    if (disabled) return;
    open = !open;
    if (open) {
      search = '';
      positionMenu();
    }
  }

  function choose(next: string) {
    onchange?.(next);
    open = false;
  }

  $effect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (root && !root.contains(event.target as Node)) open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };
    const onReposition = () => positionMenu();
    window.addEventListener('click', onDocClick, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('click', onDocClick, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  });
</script>

{#snippet mark(option: Option)}
  {#if option.service}
    <span class="cl-picker__service is-{option.service}"><WorkspaceServiceIcon service={option.service} size={13} /></span>
  {:else if option.dot}
    <i class="cl-picker__dot" style={`--mark:${option.color || 'var(--cl-line-strong)'}`}></i>
  {:else if option.icon !== undefined}
    <WorkspaceAreaIcon icon={option.icon} color={option.color} size={15} compact />
  {/if}
{/snippet}

<div class="cl-picker" bind:this={root}>
  <button
    bind:this={trigger}
    class="cl-picker__trigger"
    class:is-open={open}
    class:is-empty={!selected}
    type="button"
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={ariaLabel || undefined}
    onclick={toggle}
  >
    {#if selected}{@render mark(selected)}{/if}
    <span class="cl-picker__label">{selected ? selected.label : t(placeholder)}</span>
    {#if !disabled}
      <svg class="cl-picker__caret" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    {/if}
  </button>

  {#if open}
    <div class="cl-picker__menu colmenu is-floating" style={`left:${menuLeft}px;top:${menuTop}px;min-width:${menuWidth}px`} role="listbox">
      {#if searchable}
        <div class="colmenu__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <!-- svelte-ignore a11y_autofocus -->
          <input class="cl-field" type="search" placeholder={t('Search')} bind:value={search} autofocus />
        </div>
      {/if}
      <div class="cl-picker__options">
        {#each visible as option (option.value)}
          <button
            class="cl-picker__option"
            class:is-on={option.value === value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            onclick={() => choose(option.value)}
          >
            {@render mark(option)}
            <span>{option.label}</span>
            {#if option.value === value}
              <svg class="cl-picker__check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
            {/if}
          </button>
        {/each}
        {#if !visible.length}<div class="colmenu__empty">{t('No matches')}</div>{/if}
      </div>
    </div>
  {/if}
</div>
