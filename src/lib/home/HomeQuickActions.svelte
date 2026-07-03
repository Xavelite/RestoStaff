<nav class="quick-actions" aria-label="Quick actions">
  <a href="/planning"><span aria-hidden="true">+</span><strong>Plan week</strong></a>
  <a href="/team"><span aria-hidden="true">+</span><strong>Add employee</strong></a>
  <a href="/team"><span aria-hidden="true">+</span><strong>Add absence</strong></a>
  <a href="/actuals"><span aria-hidden="true">↗</span><strong>Review badges</strong></a>
</nav>

<style>
  .quick-actions {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 10px;
    background: var(--rst-ui-surface-panel);
    border: 1px solid var(--rst-ui-surface-panel-border);
    border-radius: var(--rst-ui-radius-xl);
  }

  a {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    text-decoration: none;
  }

  a:hover {
    border-color: rgba(var(--rst-ui-action-rgb), 0.55);
    background: rgba(var(--rst-ui-action-rgb), 0.08);
  }

  span {
    color: var(--rst-state-info-text);
    font-size: 17px;
    line-height: 1;
  }

  strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 980px) {
    .quick-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .quick-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
