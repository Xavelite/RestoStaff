<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  type GroupOption = { value: string; label: string };

  let {
    value,
    options,
    onchange,
    label = 'Group rows'
  }: {
    value: string;
    options: GroupOption[];
    onchange: (value: string) => void;
    label?: string;
  } = $props();

  let open = $state(false);
  let search = $state('');
  let root = $state<HTMLElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  let menuLeft = $state(0);
  let menuTop = $state(0);
  let menuRight = $state(false);

  const active = $derived(value !== 'none');
  const visibleOptions = $derived(
    options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()))
  );

  function positionMenu() {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 244;
    menuRight = rect.left + menuWidth > window.innerWidth - 12;
    menuLeft = menuRight ? Math.max(12, rect.right - menuWidth) : Math.max(12, rect.left - 8);
    menuTop = Math.min(window.innerHeight - 20, rect.bottom + 4);
  }

  function toggleMenu() {
    open = !open;
    if (open) {
      search = '';
      positionMenu();
    }
  }

  function choose(next: string) {
    onchange(next);
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

<div class="groupmenu" bind:this={root}>
  <button
    bind:this={trigger}
    class="colhead__trigger groupmenu__trigger"
    class:is-active={active}
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t(label)}
    title={t(label)}
    onclick={toggleMenu}
  >
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h12M4 18h8"/><path d="m18 14 2 2 2-2M20 16v5"/></svg>
  </button>

  {#if open}
    <div class="colmenu groupmenu__popover is-floating" class:is-right={menuRight} style={`left:${menuLeft}px;top:${menuTop}px`} role="menu">
      <div class="colchooser__title">{t('Group by')}</div>
      <div class="colmenu__search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
        <input class="cl-field" type="search" placeholder={t('Search')} bind:value={search} />
      </div>
      <div class="colmenu__sep"></div>
      {#each visibleOptions as option (option.value)}
        <button class="colmenu__item" class:is-on={value === option.value} type="button" role="menuitemradio" aria-checked={value === option.value} onclick={() => choose(option.value)}>
          <span class="groupmenu__radio" class:is-on={value === option.value}></span>
          {option.label}
        </button>
      {/each}
      {#if !visibleOptions.length}<div class="colmenu__empty">{t('No matches')}</div>{/if}
    </div>
  {/if}
</div>
