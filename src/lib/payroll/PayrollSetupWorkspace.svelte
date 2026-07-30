<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { useWorkspaceRestaurantContext } from '$lib/workspace-ui/workspace-context';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import { restaurantConfig } from '$lib/workspace-ui/workspace-restaurant.svelte';
  import {
    enterpriseNumberIssue,
    establishmentUnitIssue,
    jointCommitteeIssue
  } from '$lib/restaurant/belgian-identifiers';

  const readRestaurantContext = useWorkspaceRestaurantContext();
  const context = $derived(readRestaurantContext());
  const canManageOperations = $derived(workspace.canManageOperations);
  const companyIssue = $derived(enterpriseNumberIssue(context?.draft.companyNumber));
  const establishmentIssue = $derived(
    establishmentUnitIssue(context?.draft.establishmentUnitNumber)
  );
  const committeeIssue = $derived(jointCommitteeIssue(context?.draft.jointCommitteeCode));
</script>

{#if context}
  {@const draft = context.draft}
  {#if canManageOperations}
    <WorkspaceTablePanel
      dirty={context.dirty}
      saving={context.saving}
      canSave={context.canSave}
      onsave={() => void context.save().catch(() => undefined)}
      ondiscard={context.discard}
    >
      {#snippet meta()}
        <span>{draft.legalName || draft.displayName}</span>
        <span><i class="connection-dot" class:is-ready={draft.dimonaSubmissionMode !== 'not_configured'}></i>{t(draft.dimonaSubmissionMode === 'not_configured' ? 'Preparation only' : 'Employer setup')}</span>
      {/snippet}
      {#snippet children()}
        <div class="connections-layout">
          <section class="cl-card">
            <div class="cl-card__head">
              <div>
                <h2>{t('Employer setup')}</h2>
                <p>{t('Legal and establishment identifiers used for payroll preparation and statutory exports.')}</p>
              </div>
            </div>
            <div class="cl-card__body">
              <div class="form">
                <label class="cl-label">
                  <span>{t('Legal name')}</span>
                  <input
                    class="cl-field"
                    placeholder={draft.displayName || t('Optional')}
                    bind:value={draft.legalName}
                    oninput={() => restaurantConfig.touch()}
                  />
                </label>
                <label class="cl-label">
                  <span>{t('Company number')}</span>
                  <input
                    class="cl-field"
                    inputmode="numeric"
                    placeholder="0123.456.789"
                    aria-invalid={Boolean(companyIssue)}
                    bind:value={draft.companyNumber}
                    oninput={() => restaurantConfig.touch()}
                  />
                  {#if companyIssue}
                    <small class="field-warning">{t(companyIssue)} {t('You can still save and complete this later.')}</small>
                  {/if}
                </label>
                <label class="cl-label">
                  <span>{t('ONSS employer number')}</span>
                  <input
                    class="cl-field"
                    bind:value={draft.onssEmployerNumber}
                    oninput={() => restaurantConfig.touch()}
                  />
                </label>
                <label class="cl-label">
                  <span>{t('Establishment unit number')}</span>
                  <input
                    class="cl-field"
                    inputmode="numeric"
                    placeholder="10 digits"
                    aria-invalid={Boolean(establishmentIssue)}
                    bind:value={draft.establishmentUnitNumber}
                    oninput={() => restaurantConfig.touch()}
                  />
                  {#if establishmentIssue}
                    <small class="field-warning">{t(establishmentIssue)} {t('You can still save and complete this later.')}</small>
                  {/if}
                </label>
                <label class="cl-label">
                  <span>{t('Joint committee')}</span>
                  <input
                    class="cl-field"
                    placeholder="302"
                    aria-invalid={Boolean(committeeIssue)}
                    bind:value={draft.jointCommitteeCode}
                    oninput={() => restaurantConfig.touch()}
                  />
                  {#if committeeIssue}
                    <small class="field-warning">{t(committeeIssue)} {t('You can still save and complete this later.')}</small>
                  {/if}
                </label>
              </div>
            </div>
          </section>

          <section class="cl-card">
            <div class="cl-card__head">
              <div>
                <h2>{t('Dimona workflow')}</h2>
                <p>{t('Choose how Restogogo should prepare future declarations and provider mappings.')}</p>
              </div>
              <span class="scope-tag">{t('Preparation only')}</span>
            </div>
            <div class="cl-card__body connection-body">
              <div class="scope-note">
                <strong>{t('Restogogo prepares operational data.')}</strong>
                <span>{t('It does not replace a social secretariat and no declaration is sent from this screen.')}</span>
              </div>
              <div class="form">
                <label class="cl-label">
                  <span>{t('Dimona workflow')}</span>
                  <select
                    class="cl-field"
                    bind:value={draft.dimonaSubmissionMode}
                    onchange={() => restaurantConfig.touch()}
                  >
                    <option value="not_configured">{t('Not configured')}</option>
                    <option value="social_secretariat">{t('Through social secretariat')}</option>
                    <option value="direct">{t('Direct integration later')}</option>
                  </select>
                </label>
                <label class="cl-label">
                  <span>{t('Social secretariat')}</span>
                  <input
                    class="cl-field"
                    placeholder={t('Optional')}
                    bind:value={draft.socialSecretariatName}
                    oninput={() => restaurantConfig.touch()}
                  />
                </label>
                <label class="cl-label">
                  <span>{t('External employer ID')}</span>
                  <input
                    class="cl-field"
                    placeholder={t('Optional mapping')}
                    bind:value={draft.externalEmployerId}
                    oninput={() => restaurantConfig.touch()}
                  />
                </label>
              </div>
            </div>
          </section>
        </div>
      {/snippet}
    </WorkspaceTablePanel>
  {:else}
    <section class="cl-card access-card">
      <div class="cl-empty">
        <strong>{t('Manager access required')}</strong>
        <span>{t('Employer identifiers and external connections are available to restaurant operators.')}</span>
      </div>
    </section>
  {/if}
{/if}

<style>
  .connections-layout { display: grid; gap: 18px; }
  .cl-card__head > div { display: grid; gap: 4px; }
  .cl-card__head p { margin: 0; color: var(--cl-muted); font-size: 12px; line-height: 1.45; }
  .cl-card__body, .connection-body { display: grid; gap: 20px; }
  .form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; max-width: 820px; }
  .cl-label small { color: var(--cl-muted); font-size: 11px; line-height: 1.35; }
  .cl-label .field-warning { color: var(--cl-attention); }
  .connection-dot { width: 7px; height: 7px; display: inline-block; border-radius: 50%; background: var(--cl-line-strong); }
  .connection-dot.is-ready { background: var(--cl-ok); }
  .scope-tag { padding: 4px 9px; border: 1px solid var(--cl-line); border-radius: 999px; background: var(--cl-surface-muted); color: var(--cl-muted); font-size: 11px; font-weight: var(--rst-fw-bold); white-space: nowrap; }
  .scope-note { display: grid; gap: 3px; max-width: 820px; padding: 12px 14px; border-left: 3px solid var(--cl-accent); background: var(--cl-accent-wash); }
  .scope-note strong { font-size: 13px; }
  .scope-note span { color: var(--cl-muted); font-size: 12px; line-height: 1.45; }
  .access-card { min-height: 240px; display: grid; place-items: center; }
  @media (max-width: 760px) {
    .form { grid-template-columns: minmax(0, 1fr); }
  }
</style>
