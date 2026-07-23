<script lang="ts">
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  let {
    open,
    title,
    description,
    onkeep,
    onreload
  }: {
    open: boolean;
    title: string;
    description: string;
    onkeep: () => void;
    onreload: () => void | Promise<void>;
  } = $props();
</script>

{#snippet footer()}
  <ActionButton label={t('Keep my local work')} onclick={onkeep} />
  <ActionButton label={t('Reload latest data')} tone="primary" onclick={onreload} />
{/snippet}

<Dialog
  {open}
  {title}
  {description}
  size="small"
  onclose={onkeep}
  {footer}
>
  <p>
    {t('Reloading replaces this local view with the authoritative server version. Keep it open if you need to copy any details first.')}
  </p>
</Dialog>

<style>
  p {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: 13px;
    line-height: 1.55;
  }
</style>
