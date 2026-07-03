<script lang="ts">
  let {
    entitlement,
    approved,
    pending,
    remaining
  }: {
    entitlement: number;
    approved: number;
    pending: number;
    remaining: number;
  } = $props();
</script>

<div class="balance" aria-label="Annual holiday balance">
  <article><span>Entitlement</span><strong>{entitlement}d</strong></article>
  <article><span>Approved</span><strong>{approved}d</strong></article>
  <article class:is-active={pending > 0}><span>Pending</span><strong>{pending}d</strong></article>
  <article class="is-remaining" class:is-low={remaining <= 0}><span>Remaining</span><strong>{remaining}d</strong></article>
</div>

<style>
  .balance {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  article {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-panel);
    animation: rst-fade-up .3s var(--rst-ease-out) backwards;
  }

  article.is-active {
    border-color: rgba(var(--rst-state-warning-rgb), .3);
    background: linear-gradient(135deg, rgba(var(--rst-state-warning-rgb), .12), transparent 60%), var(--rst-ui-surface-panel);
  }

  article.is-active strong { color: var(--rst-state-warning-text); }

  article.is-remaining {
    border-color: rgba(var(--rst-state-success-rgb), .3);
    background: linear-gradient(135deg, rgba(var(--rst-state-success-rgb), .12), transparent 60%), var(--rst-ui-surface-panel);
  }

  article.is-remaining strong { color: var(--rst-state-success-text); }

  article.is-remaining.is-low {
    border-color: rgba(var(--rst-state-danger-rgb), .3);
    background: linear-gradient(135deg, rgba(var(--rst-state-danger-rgb), .12), transparent 60%), var(--rst-ui-surface-panel);
  }

  article.is-remaining.is-low strong { color: var(--rst-state-danger-text); }

  span {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  strong {
    font-size: 18px;
  }

  @media (max-width: 760px) {
    .balance {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
