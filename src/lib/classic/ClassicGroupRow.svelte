<script lang="ts">
  let {
    colspan,
    label,
    meta = '',
    color = '',
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
    collapsed?: boolean;
    dropTarget?: boolean;
    ontoggle: () => void;
    ondragover?: (event: DragEvent) => void;
    ondragleave?: (event: DragEvent) => void;
    ondrop?: (event: DragEvent) => void;
  } = $props();
</script>

<tr
  class="cl-group-row"
  class:is-drop-target={dropTarget}
  {ondragover}
  {ondragleave}
  {ondrop}
>
  <td {colspan}>
    <button
      class="cl-group-row__button"
      type="button"
      aria-expanded={!collapsed}
      onclick={ontoggle}
    >
      <svg
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
      {#if color}
        <i class="cl-group-row__dot" style={`--group:${color}`}></i>
      {/if}
      <strong>{label}</strong>
      {#if meta}<span>{meta}</span>{/if}
    </button>
  </td>
</tr>
