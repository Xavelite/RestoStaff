<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';

  // Absence types come from the restaurant read model as a catalogue, not part
  // of the editable setup draft, so this page reads rather than edits.
  const snapshot = $derived(workspace.restaurant);

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole === 'owner') {
      void workspace.loadRestaurant().catch(() => undefined);
    }
  });

  const types = $derived(
    [...(snapshot?.absence_types ?? [])].sort((left, right) =>
      left.name.localeCompare(right.name)
    )
  );

  const PAID_LABEL: Record<string, string> = {
    paid: 'Paid',
    unpaid: 'Unpaid',
    neutral: 'Neutral'
  };
</script>

<svelte:head><title>{t('Absence types')} &middot; restogogo</title></svelte:head>

<ClassicPage title="Restaurant" subtitle="Absence types">
  <p class="cl-section__note">
    {t('The leave types employees can choose from when they request time off.')}
  </p>

  <div class="cl-tablewrap">
    <table class="cl-table">
      <thead>
        <tr>
          <th>{t('Name')}</th>
          <th>{t('Payment')}</th>
          <th>{t('Needs approval')}</th>
          <th>{t('Status')}</th>
        </tr>
      </thead>
      <tbody>
        {#if !types.length}
          <tr>
            <td colspan="4">
              <div class="cl-empty">
                <strong>{t('No absence types yet')}</strong>
                <span>{t('Without a leave type, employees cannot request time off.')}</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each types as type (type.id)}
            <tr>
              <td>{type.name}</td>
              <td class="is-quiet">{t(PAID_LABEL[type.paid_policy ?? ''] ?? type.paid_policy ?? '—')}</td>
              <td class="is-quiet">{t(type.requires_approval ? 'Yes' : 'No')}</td>
              <td>
                <ClassicStatus
                  label={type.active ? 'Active' : 'Archived'}
                  tone={type.active ? 'ok' : 'attention'}
                />
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</ClassicPage>

