<script lang="ts">
  import { page } from '$app/state';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { submitPilotFeedback, type FeedbackCategory } from './feedback-api';
  import type { WorkspaceRole } from '$lib/api/workspace';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';

  let {
    open,
    restaurantId,
    role,
    onclose
  }: {
    open: boolean;
    restaurantId: string | null;
    role: WorkspaceRole | 'platform_admin' | null;
    onclose: () => void;
  } = $props();

  let category = $state<FeedbackCategory>('problem');
  let message = $state('');
  let saving = $state(false);

  async function submit() {
    if (message.trim().length < 5) {
      toasts.show(t('Tell us a little more before sending.'), 'warning');
      return;
    }
    saving = true;
    try {
      await submitPilotFeedback({
        restaurantId,
        category,
        message: message.trim(),
        pagePath: `${page.url.pathname}${page.url.search}`,
        actorRole: role,
        locale: i18n.locale
      });
      message = '';
      category = 'problem';
      onclose();
      toasts.show(t('Thank you. Your feedback was sent with this page and version.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      saving = false;
    }
  }
</script>

<Dialog
  {open}
  title="Send pilot feedback"
  description="Report a problem or tell us what would make this page clearer."
  size="small"
  {onclose}
>
  <div class="feedback-form">
    <div class="category-grid" aria-label={t('Feedback type')}>
      {#each [
        ['problem', 'Problem'],
        ['confusing', 'Confusing'],
        ['visual', 'Visual'],
        ['suggestion', 'Suggestion']
      ] as option}
        <button
          type="button"
          class:is-active={category === option[0]}
          onclick={() => (category = option[0] as FeedbackCategory)}
        >{t(option[1])}</button>
      {/each}
    </div>
    <label>
      <span>{t('What happened?')}</span>
      <textarea
        rows="6"
        maxlength="2000"
        bind:value={message}
        placeholder={t('Describe what you expected and what you saw.')}
      ></textarea>
      <small>{message.length}/2000 · {t('Page and version are attached automatically.')}</small>
    </label>
  </div>
  {#snippet footer()}
    <ActionButton label="Cancel" disabled={saving} onclick={onclose} />
    <ActionButton label={saving ? 'Sending…' : 'Send feedback'} tone="primary" disabled={saving} onclick={submit} />
  {/snippet}
</Dialog>

<style>
  .feedback-form { display: grid; gap: 16px; }
  .category-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .category-grid button {
    min-height: 36px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .category-grid button.is-active {
    color: var(--rst-ui-action);
    border-color: rgba(var(--rst-ui-action-rgb), .55);
    background: rgba(var(--rst-ui-action-rgb), .1);
  }
  label { display: grid; gap: 7px; }
  label > span { font-size: 12px; font-weight: var(--rst-fw-bold); }
  textarea {
    width: 100%;
    resize: vertical;
    padding: 11px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field);
    font: inherit;
  }
  small { color: var(--rst-ui-muted); font-size: 11px; }
  @media (max-width: 520px) { .category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
