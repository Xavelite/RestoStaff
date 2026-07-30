<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  export type WorkspaceRowMenuItem = {
    label: string;
    disabled?: boolean;
    tone?: 'default' | 'danger';
    onselect: () => void;
  };

  let {
    items,
    disabled = false,
    label = t('More actions')
  }: {
    items: WorkspaceRowMenuItem[];
    disabled?: boolean;
    label?: string;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLElement | null>(null);
  let menuLeft = $state(0);
  let menuTop = $state(0);

  function positionMenu() {
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const width = menu?.offsetWidth || 184;
    const height = menu?.offsetHeight || 48;
    const roomBelow = window.innerHeight - triggerRect.bottom;
    menuLeft = Math.max(12, Math.min(triggerRect.right - width, window.innerWidth - width - 12));
    menuTop =
      roomBelow >= height + 12
        ? triggerRect.bottom + 4
        : Math.max(12, triggerRect.top - height - 4);
  }

  async function toggleMenu() {
    if (disabled || !items.length) return;
    open = !open;
    if (!open) return;
    await tick();
    positionMenu();
    menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  function close(returnFocus = false) {
    if (!open) return;
    open = false;
    if (returnFocus) void tick().then(() => trigger?.focus());
  }

  function select(item: WorkspaceRowMenuItem) {
    if (item.disabled) return;
    close();
    item.onselect();
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    if (!menu) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    const buttons = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    );
    if (!buttons.length) return;
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    let next = -1;
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next < 0) return;
    event.preventDefault();
    buttons[next]?.focus();
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

<div class="rowmenu" bind:this={root}>
  <button
    bind:this={trigger}
    class="rowmenu__trigger"
    type="button"
    {disabled}
    aria-label={label}
    title={label}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={toggleMenu}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  </button>

  {#if open}
    <div
      bind:this={menu}
      class="colmenu is-floating rowmenu__menu"
      style={`left:${menuLeft}px;top:${menuTop}px`}
      role="menu"
      tabindex="-1"
      aria-label={label}
      onkeydown={handleMenuKeydown}
    >
      {#each items as item (item.label)}
        <button
          class="colmenu__item"
          class:is-danger={item.tone === 'danger'}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onclick={() => select(item)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rowmenu {
    position: relative;
    display: flex;
    justify-content: flex-end;
  }

  .rowmenu__trigger {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--cl-muted);
    background: transparent;
    cursor: pointer;
    opacity: 0.58;
    transition:
      opacity var(--cl-dur) var(--cl-ease),
      color var(--cl-dur) var(--cl-ease),
      border-color var(--cl-dur) var(--cl-ease),
      background var(--cl-dur) var(--cl-ease);
  }

  .rowmenu__trigger:hover,
  .rowmenu__trigger:focus-visible,
  .rowmenu__trigger[aria-expanded='true'] {
    border-color: color-mix(in srgb, var(--cl-accent) 22%, var(--cl-line));
    color: var(--cl-accent);
    background: var(--cl-accent-wash);
    opacity: 1;
  }

  .rowmenu__trigger:disabled {
    cursor: default;
    opacity: 0.28;
  }

  .rowmenu__menu {
    width: 184px;
    min-width: 184px;
  }

  .colmenu__item.is-danger {
    color: var(--cl-problem);
  }

  @media (hover: hover) {
    :global(.cl-table tbody tr:not(:hover):not(:focus-within)) .rowmenu__trigger:not([aria-expanded='true']) {
      opacity: 0.32;
    }
  }
</style>
