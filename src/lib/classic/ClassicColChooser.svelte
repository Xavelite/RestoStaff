<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    columns,
    hidden,
    ontoggle
  }: {
    columns: { key: string; label: string }[];
    hidden: Set<string>;
    ontoggle: (key: string) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  let menuLeft = $state(0);
  let menuTop = $state(0);

  function positionMenu() {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    menuLeft = Math.max(12, rect.right - 230);
    menuTop = Math.min(window.innerHeight - 20, rect.bottom + 4);
  }

  function toggleMenu() {
    open = !open;
    if (open) positionMenu();
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

<div class="colchooser" bind:this={root}>
  <button bind:this={trigger} class="colchooser__trigger" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t('Choose columns')} title={t('Choose columns')} onclick={toggleMenu}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>
  </button>
  {#if open}
    <div class="colmenu is-floating" style={`left:${menuLeft}px;top:${menuTop}px`} role="menu">
      <div class="colchooser__title">{t('Columns')}</div>
      {#each columns as column (column.key)}
        <label class="colmenu__check">
          <input type="checkbox" checked={!hidden.has(column.key)} onchange={() => ontoggle(column.key)} />
          <span>{column.label}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>
