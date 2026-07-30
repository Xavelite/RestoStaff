<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    colspan,
    label,
    meta = '',
    color = '',
    icon,
    liveColumn = -1,
    collapsed = false,
    dropTarget = false,
    ontoggle,
    ondragover,
    ondragleave,
    ondrop
  }: {
    colspan: number;
    label: string;
    meta?: string;
    color?: string;
    icon?: Snippet;
    /** Zero-based table column crossed by the live-today marker. */
    liveColumn?: number;
    collapsed?: boolean;
    dropTarget?: boolean;
    ontoggle: () => void;
    ondragover?: (event: DragEvent) => void;
    ondragleave?: (event: DragEvent) => void;
    ondrop?: (event: DragEvent) => void;
  } = $props();

  // One cell per column keeps the group aligned with the table's tracks. The
  // label can spill across empty cells; the count stays anchored at the end.
  const fillers = $derived(Array.from({ length: Math.max(0, colspan - 2) }));
</script>

<tr
  class="cl-group-row"
  class:is-drop-target={dropTarget}
  {ondragover}
  {ondragleave}
  {ondrop}
>
  <td class="cl-group-row__label" class:is-live-column={liveColumn === 0}>
    <button
      class="cl-group-row__button"
      type="button"
      aria-expanded={!collapsed}
      onclick={ontoggle}
    >
      <svg
        class="cl-group-row__chevron"
        class:is-collapsed={collapsed}
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      {#if color && !icon}
        <i class="cl-group-row__dot" style={`--group:${color}`}></i>
      {/if}
      {#if icon}
        <span class="cl-group-row__icon">{@render icon()}</span>
      {/if}
      <strong>{label}</strong>
    </button>
  </td>
  {#each fillers as _filler, index (index)}
    <td class:is-live-column={liveColumn === index + 1}></td>
  {/each}
  {#if colspan > 1}
    <td class="cl-group-row__meta-cell" class:is-live-column={liveColumn === colspan - 1}>
      {#if meta}<span class="cl-group-row__meta">{meta}</span>{/if}
    </td>
  {/if}
</tr>

<style>
  td.is-live-column {
    box-shadow: inset var(--cl-live-marker-width) 0 0 var(--cl-live-marker);
  }
</style>
