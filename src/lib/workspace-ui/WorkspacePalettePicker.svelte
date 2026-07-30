<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    value,
    palette,
    label,
    disabled = false,
    onselect
  }: {
    value: string;
    palette: readonly string[];
    label: string;
    disabled?: boolean;
    onselect: (color: string) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  let left = $state(0);
  let top = $state(0);

  function positionMenu() {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 210;
    left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left - 8));
    top = Math.min(window.innerHeight - 120, rect.bottom + 6);
  }

  function toggle() {
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
    const reposition = () => positionMenu();
    window.addEventListener('click', onDocClick, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('click', onDocClick, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  });

  function choose(color: string) {
    onselect(color);
    open = false;
  }
</script>

<div class="palette-picker" bind:this={root}>
  <button
    bind:this={trigger}
    class="palette-picker__trigger"
    type="button"
    disabled={disabled}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label}
    title={label}
    onclick={toggle}
  >
    <span style={`--picker-color:${value}`}></span>
  </button>
  {#if open}
    <div class="palette-picker__menu" style={`left:${left}px;top:${top}px`} role="menu" aria-label={label}>
      <strong>{t('Choose colour')}</strong>
      <div class="palette-picker__grid">
        {#each palette as color (color)}
          <button
            class:is-selected={color.toLowerCase() === value.toLowerCase()}
            type="button"
            role="menuitem"
            aria-label={color}
            title={color}
            style={`--picker-color:${color}`}
            onclick={() => choose(color)}
          ><span></span></button>
        {/each}
      </div>
    </div>
  {/if}
</div>
