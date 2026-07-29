<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    checked,
    label,
    disabled = false,
    onchange
  }: {
    checked: boolean;
    label: string;
    disabled?: boolean;
    onchange: (checked: boolean) => void;
  } = $props();
</script>

<label class="toggle" class:is-disabled={disabled}>
  <input
    type="checkbox"
    role="switch"
    {checked}
    {disabled}
    onchange={(event) => onchange(event.currentTarget.checked)}
  />
  <span class="toggle__track" aria-hidden="true"><i></i></span>
  <em>{t(label)}</em>
</label>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--cl-data-text);
    font-size: 12px;
    font-weight: var(--rst-fw-medium);
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
  }
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }
  .toggle__track {
    width: 34px;
    height: 20px;
    flex: 0 0 auto;
    padding: 2px;
    border: 1px solid var(--cl-line-strong);
    border-radius: 10px;
    background: var(--cl-surface-muted);
    transition:
      border-color var(--cl-dur) var(--cl-ease),
      background var(--cl-dur) var(--cl-ease),
      box-shadow var(--cl-dur) var(--cl-ease);
  }
  .toggle__track i {
    display: block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--cl-muted);
    box-shadow: 0 1px 2px rgba(16, 24, 40, .18);
    transition:
      transform var(--cl-dur) var(--cl-ease),
      background var(--cl-dur) var(--cl-ease);
  }
  input:checked + .toggle__track {
    border-color: var(--cl-accent);
    background: var(--cl-accent);
  }
  input:checked + .toggle__track i {
    transform: translateX(14px);
    background: #fff;
  }
  input:focus-visible + .toggle__track {
    box-shadow: var(--rst-ui-focus);
  }
  em {
    font-style: normal;
  }
  .is-disabled {
    cursor: default;
    opacity: .55;
  }
</style>
