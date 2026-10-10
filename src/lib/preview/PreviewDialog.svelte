<script lang="ts">
  import { goto } from '$app/navigation';
  import Dialog from '$lib/components/Dialog.svelte';
  import { getPreviewPersonas, type PreviewPersona } from './preview-api';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { appPath } from '$lib/navigation/app-path';
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
        await goto(appPath(persona.role === 'employee' ? '/my-service' : '/home'));
      });
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      openingKey = '';
    }
  }

  async function workAsPersona(persona: PreviewPersona) {
    if (!restaurantId || !persona.profileId || !persona.canActAs) return;
    openingKey = `support:${persona.key}`;
    try {
      await unsavedChanges.runOrRequest(async () => {
        await workspace.startSupport(restaurantId, persona.profileId!);
        onclose();
        await goto(appPath(persona.role === 'employee' ? '/my-service' : '/home'));
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
  title={source === 'admin' ? 'Open this restaurant' : 'Preview as employee'}
  description={source === 'admin'
    ? 'Preview safely, or work through a real account. Support actions are live and audited.'
    : 'A read-only view. You remain signed in as yourself.'}
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
          <article class="persona-row">
            <span class="avatar">{personInitials(persona.displayName)}</span>
            <span class="identity"><strong>{persona.displayName}</strong><small>{persona.detail}</small></span>
            <span class="role">{t(persona.role)}</span>
            {#if source === 'admin'}
              <span class="actions">
                <button type="button" class="preview-action" disabled={Boolean(openingKey)} onclick={() => openPersona(persona)}>
                  {t('Preview')}
                </button>
                <button
                  type="button"
                  class="support-action"
                  disabled={Boolean(openingKey) || !persona.canActAs}
                  title={persona.canActAs ? t('Work as this user') : t('This employee does not have an account yet.')}
                  onclick={() => workAsPersona(persona)}
                >
                  {openingKey === `support:${persona.key}` ? t('Opening…') : t('Work as')}
                </button>
              </span>
            {:else}
              <button class="open-action" type="button" disabled={Boolean(openingKey)} aria-label={t('Preview {name}', { name: persona.displayName })} onclick={() => openPersona(persona)}>
                <span aria-hidden="true">&gt;</span>
              </button>
            {/if}
          </article>
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
  .search span { font-size: var(--rst-fs-label); font-weight: var(--rst-fw-bold); color: var(--rst-ui-muted); }
  .search input { min-height: 40px; padding: 8px 11px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field); font: inherit; }
  .persona-list { display: grid; max-height: 52vh; overflow: auto; border-block: 1px solid var(--rst-ui-divider-soft); }
  .persona-row { min-height: 64px; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px solid var(--rst-ui-divider-soft); }
  .persona-row:hover { background: var(--rst-ui-hover-bg); }
  .avatar { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; color: var(--rst-ui-action); background: rgba(var(--rst-ui-action-rgb), .12); font-size: var(--rst-fs-control); font-weight: 800; }
  .identity { min-width: 0; display: grid; gap: 2px; }
  .identity strong, .identity small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .identity strong { font-size: var(--rst-fs-body); }
  .identity small, .state { color: var(--rst-ui-muted); font-size: var(--rst-fs-label); }
  .role { padding: 4px 7px; border-radius: 5px; background: var(--rst-ui-surface-field); color: var(--rst-ui-muted); font-size: var(--rst-fs-caption); font-weight: 800; text-transform: uppercase; }
  .actions { display: flex; align-items: center; gap: 6px; }
  .actions button, .open-action { min-height: 34px; padding: 6px 10px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field); font: inherit; font-size: var(--rst-fs-label); font-weight: var(--rst-fw-bold); cursor: pointer; }
  .actions button:hover:not(:disabled), .open-action:hover:not(:disabled) { border-color: var(--rst-ui-action); color: var(--rst-ui-action); }
  .actions .support-action { color: var(--rst-on-accent-text); border-color: var(--rst-ui-action); background: var(--rst-ui-action); }
  .actions .support-action:hover:not(:disabled) { color: var(--rst-on-accent-text); background: color-mix(in srgb, var(--rst-ui-action) 88%, #000); }
  .actions button:disabled, .open-action:disabled { opacity: .45; cursor: default; }
  .open-action { width: 34px; padding: 0; font-size: var(--rst-fs-title-lg); }
  .state { margin: 24px 0; text-align: center; }

  @media (max-width: 520px) {
    .persona-row { grid-template-columns: 34px minmax(0, 1fr) auto; }
    .role { display: none; }
    .actions { grid-column: 2 / -1; justify-content: flex-end; }
  }
</style>
