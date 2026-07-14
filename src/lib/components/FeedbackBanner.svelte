<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  let {
    message,
    tone = 'info'
  }: {
    message: string;
    tone?: 'info' | 'success' | 'warning' | 'danger';
  } = $props();
</script>

{#if message}
  <p class="feedback is-{tone}" role={tone === 'danger' ? 'alert' : 'status'}>{t(message)}</p>
{/if}

<style>
  .feedback {
    --tone-rgb: var(--rst-state-info-rgb);
    margin: 0 0 12px;
    padding: 10px 12px;
    border: 1px solid rgba(var(--tone-rgb), 0.28);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: rgba(var(--tone-rgb), 0.1);
    font-size: 13px;
  }

  .feedback.is-success {
    --tone-rgb: var(--rst-state-success-rgb);
  }

  .feedback.is-warning {
    --tone-rgb: var(--rst-state-warning-rgb);
  }

  .feedback.is-danger {
    --tone-rgb: var(--rst-state-danger-rgb);
  }
</style>
