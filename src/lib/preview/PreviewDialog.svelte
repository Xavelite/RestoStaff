<script lang="ts">
  import { goto } from '$app/navigation';
  import Dialog from '$lib/components/Dialog.svelte';
  import { getPreviewPersonas, type PreviewPersona } from './preview-api';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { personInitials } from '$lib/ui/person';

  let {
    open,
    restaurantId,
    restaurantName,
    source,
    returnPath,
    onclose
  }: {
    open: boolean;
    restaurantId: string | null;
    restaurantName: string;
    source: 'manager' | 'admin';
    returnPath: string;
    onclose: () => void;
  } = $props();

  let personas = $state<PreviewPersona[]>([]);
  let loading = $state(false);
  let openingKey = $state('');
  let query = $state('');
  let loadedRestaurant = '';

  const visiblePersonas = $derived(
    source === 'admin' ? personas : personas.filter((persona) => persona.role === 'employee')
  );
  const filtered = $derived(visiblePersonas.filter((persona) =>
    `${persona.displayName} ${persona.detail} ${persona.role}`.toLowerCase().includes(query.trim().toLowerCase())
  ));

  $effect(() => {
    if (!open || !restaurantId || loadedRestaurant === restaurantId) return;
    loading = true;
    void getPreviewPersonas(restaurantId)
      .then((result) => {
        personas = result;
        loadedRestaurant = restaurantId;
      })
      .catch((error) => toasts.show(error instanceof Error ? error.message : String(error), 'danger'))
      .finally(() => (loading = false));
  });

  async function openPersona(persona: PreviewPersona) {
    if (!restaurantId) return;
    openingKey = persona.key;
    try {
      await unsavedChanges.runOrRequest(async () => {
        await workspace.startPreview({
          restaurantId,
          restaurantName,
          role: persona.role,
          employeeId: persona.employeeId,
          displayName: persona.displayName,
          source,
          returnPath
        });
        onclose();
        await goto(persona.role === 'employee' ? '/my-service' : '/home');
      });
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      openingKey = '';
    }
  }
</script>

<Dialog
  {open}
  title={source === 'admin' ? 'Preview this restaurant' : 'Preview as employee'}
  description="A read-only view. You remain signed in as yourself."
  size="medium"
  {onclose}
>
  <div class="preview-picker">
    <label class="search">
      <span>{t('Find a person')}</span>
      <input bind:value={query} placeholder={t('Search by name or role')} />
    </label>
    {#if loading}
      <p class="state">{t('Loading preview choices...')}</p>
    {:else}
      <div class="persona-list">
        {#each filtered as persona (persona.key)}
          <button type="button" disabled={Boolean(openingKey)} onclick={() => openPersona(persona)}>
            <span class="avatar">{personInitials(persona.displayName)}</span>
            <span class="identity"><strong>{persona.displayName}</strong><small>{persona.detail}</small></span>
            <span class="role">{t(persona.role)}</span>
            <span class="arrow" aria-hidden="true">&gt;</span>
          </button>
        {:else}
          <p class="state">{t('No matching preview account.')}</p>
        {/each}
      </div>
    {/if}
  </div>
</Dialog>

<style>
  .preview-picker { display: grid; gap: 12px; }
  .search { display: grid; gap: 6px; }
  .search span { font-size: 11px; font-weight: var(--rst-fw-bold); color: var(--rst-ui-muted); }
  .search input { min-height: 40px; padding: 8px 11px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field); font: inherit; }
  .persona-list { display: grid; max-height: 52vh; overflow: auto; border-block: 1px solid var(--rst-ui-divider-soft); }
  .persona-list button { min-height: 58px; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto 16px; align-items: center; gap: 10px; padding: 9px 4px; border: 0; border-bottom: 1px solid var(--rst-ui-divider-soft); color: var(--rst-ui-text); background: transparent; text-align: left; font: inherit; cursor: pointer; }
  .persona-list button:hover:not(:disabled) { background: var(--rst-ui-hover-bg); }
  .avatar { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; color: var(--rst-ui-action); background: rgba(var(--rst-ui-action-rgb), .12); font-size: 12px; font-weight: 800; }
  .identity { min-width: 0; display: grid; gap: 2px; }
  .identity strong, .identity small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .identity strong { font-size: 13px; }
  .identity small, .state { color: var(--rst-ui-muted); font-size: 11px; }
  .role { padding: 4px 7px; border-radius: 5px; background: var(--rst-ui-surface-field); color: var(--rst-ui-muted); font-size: 10px; font-weight: 800; text-transform: uppercase; }
  .arrow { color: var(--rst-ui-muted); font-size: 20px; }
  .state { margin: 24px 0; text-align: center; }
</style>
