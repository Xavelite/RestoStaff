<script lang="ts">
  let {
    value = $bindable(),
    label = 'Search',
    placeholder = 'Search…'
  }: {
    value: string;
    label?: string;
    placeholder?: string;
  } = $props();
</script>

<label class="search">
  <span>{label}</span>
  <input type="search" bind:value {placeholder} />
</label>

<style>
  .search {
    min-width: min(260px, 70vw);
  }

  .search span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  input {
    width: 100%;
    min-height: 38px;
    padding: 8px 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
  }
</style>
