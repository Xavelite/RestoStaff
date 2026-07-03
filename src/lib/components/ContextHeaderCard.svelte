<script lang="ts">
  type Tone = 'service' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

  let {
    eyebrow = '',
    title,
    value = '',
    meta = '',
    tone = 'service',
    rows = [],
    compact = false
  }: {
    eyebrow?: string;
    title: string;
    value?: string;
    meta?: string;
    tone?: Tone;
    rows?: Array<{ label: string; value: string; tone?: Tone }>;
    compact?: boolean;
  } = $props();
</script>

<article class="context-card is-{tone}" class:is-compact={compact}>
  <div class="context-card__main">
    <div>
      {#if eyebrow}<span>{eyebrow}</span>{/if}
      <strong>{title}</strong>
      {#if meta}<small>{meta}</small>{/if}
    </div>
    {#if value}<b>{value}</b>{/if}
  </div>

  {#if rows.length}
    <div class="context-card__rows">
      {#each rows as row (`${row.label}-${row.value}`)}
        <p class="is-{row.tone ?? 'neutral'}">
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </p>
      {/each}
    </div>
  {/if}
</article>

<style>
  .context-card {
    min-height: 100%;
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid rgba(31,22,15,.16);
    border-radius: var(--rst-ui-radius-xl);
    color: var(--rst-ui-text);
    background:
      linear-gradient(135deg, rgba(var(--context-rgb), .16), transparent 54%),
      linear-gradient(180deg, rgba(255,250,242,.86), rgba(255,250,242,.68)),
      var(--rst-ui-surface-panel);
    box-shadow: 0 18px 55px rgba(76,48,26,.10);
  }

  .context-card.is-service { --context-rgb: var(--rst-ui-action-rgb); }
  .context-card.is-success { --context-rgb: var(--rst-state-success-rgb); }
  .context-card.is-warning { --context-rgb: var(--rst-state-warning-rgb); }
  .context-card.is-danger { --context-rgb: var(--rst-state-danger-rgb); }
  .context-card.is-info { --context-rgb: var(--rst-state-info-rgb); }
  .context-card.is-neutral { --context-rgb: var(--rst-state-neutral-rgb); }

  .context-card__main {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .context-card__main > div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .context-card__main span {
    color: var(--rst-ui-action);
    font-size: 10px;
    font-weight: var(--rst-fw-display);
    letter-spacing: .09em;
    text-transform: uppercase;
  }

  .context-card__main strong {
    font-size: clamp(16px, 1.6vw, 22px);
    line-height: 1.05;
    letter-spacing: -.02em;
  }

  .context-card__main small {
    color: var(--rst-ui-muted);
    font-size: 12px;
  }

  .context-card__main b {
    flex: 0 0 auto;
    color: rgb(var(--context-rgb));
    font-size: clamp(30px, 4vw, 54px);
    line-height: .9;
    letter-spacing: -.06em;
  }

  .context-card__rows {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .context-card__rows p {
    min-width: 0;
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 10px;
    border: 1px solid rgba(var(--row-rgb), .20);
    border-radius: var(--rst-ui-radius-md);
    background: rgba(var(--row-rgb), .08);
  }

  .context-card__rows p.is-service { --row-rgb: var(--rst-ui-action-rgb); }
  .context-card__rows p.is-success { --row-rgb: var(--rst-state-success-rgb); }
  .context-card__rows p.is-warning { --row-rgb: var(--rst-state-warning-rgb); }
  .context-card__rows p.is-danger { --row-rgb: var(--rst-state-danger-rgb); }
  .context-card__rows p.is-info { --row-rgb: var(--rst-state-info-rgb); }
  .context-card__rows p.is-neutral { --row-rgb: var(--rst-state-neutral-rgb); }

  .context-card__rows span {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .context-card__rows strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-card.is-compact {
    padding: 13px;
  }

  .context-card.is-compact .context-card__rows {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 760px) {
    .context-card__rows {
      grid-template-columns: 1fr;
    }
  }
</style>
