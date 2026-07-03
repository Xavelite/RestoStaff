<script lang="ts">
  let {
    label,
    tone = 'secondary',
    disabled = false,
    type = 'button',
    onclick
  }: {
    label: string;
    tone?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    type?: 'button' | 'submit';
    onclick?: (event: MouseEvent) => void;
  } = $props();
</script>

<button class:is-primary={tone === 'primary'} class:is-danger={tone === 'danger'} {type} {disabled} {onclick}>
  {label}
</button>

<style>
  button {
    min-height: 38px;
    padding: 8px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: var(--rst-ui-line-strong);
    background: var(--rst-ui-hover-bg);
    transform: translateY(-1px);
  }

  button:active:not(:disabled) {
    transform: translateY(0) scale(.97);
  }

  button.is-primary {
    border-color: var(--rst-ui-action);
    background: var(--rst-ui-action);
  }

  button.is-primary:hover:not(:disabled) {
    box-shadow: 0 6px 18px rgba(var(--rst-ui-action-rgb), .38);
  }

  button.is-danger {
    color: var(--rst-state-danger-text);
    border-color: var(--rst-state-danger-border);
    background: var(--rst-state-danger-bg);
  }

  button:disabled {
    opacity: 0.52;
    cursor: default;
  }
</style>
