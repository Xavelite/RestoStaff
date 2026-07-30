<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    colspan,
    label,
    meta = '',
    color = '',
    icon,
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
    collapsed?: boolean;
    dropTarget?: boolean;
    ontoggle: () => void;
    ondragover?: (event: DragEvent) => void;
    ondragleave?: (event: DragEvent) => void;
    ondrop?: (event: DragEvent) => void;
  } = $props();

  // One cell per column instead of a single spanning cell, so the vertical
  // separators run unbroken down the table and it reads as one sheet rather
  // than a stack of bands. The label spills across the empties when it needs
  // the room; the count sits in the last column.
  const fillers = $derived(Array.from({ length: Math.max(0, colspan - 2) }));
</script>

<tr
  class="cl-group-row"
  class:is-drop-target={dropTarget}
  {ondragover}
  {ondragleave}
  {ondrop}
>
  <td class="cl-group-row__label">
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
    <td></td>
  {/each}
  {#if colspan > 1}
    <td class="cl-group-row__meta-cell">
      {#if meta}<span class="cl-group-row__meta">{meta}</span>{/if}
    </td>
  {/if}
</tr>
