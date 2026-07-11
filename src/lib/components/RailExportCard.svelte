<script lang="ts">
  let {
    eyebrow,
    title,
    description,
    primaryLabel,
    ariaLabel = eyebrow,
    showPrimary = true,
    onprimary,
    onsecondary = () => window.print()
  }: {
    eyebrow: string;
    title: string;
    description: string;
    primaryLabel: string;
    ariaLabel?: string;
    showPrimary?: boolean;
    onprimary: () => void;
    onsecondary?: () => void;
  } = $props();
</script>

<section class="rail-export-card" aria-label={ariaLabel}>
  <p>{eyebrow}</p>
  <h2>{title}</h2>
  <span>{description}</span>
  <div class="rail-export-card__actions">
    <button type="button" onclick={onsecondary}>Export PDF</button>
    {#if showPrimary}
      <button type="button" class="primary-action" onclick={onprimary}>{primaryLabel}</button>
    {/if}
  </div>
</section>

<style>
  .rail-export-card {
    min-width: 0;
    display: grid;
    gap: 14px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 26px;
    color: #fffaf2;
    background:
      radial-gradient(circle at 100% 0%, rgba(247, 183, 51, 0.16), transparent 36%),
      linear-gradient(145deg, #1b1c1d, #101820);
    box-shadow: 0 22px 60px rgba(29, 20, 10, 0.14);
    animation: rst-fade-up 0.5s var(--rst-ease-out) backwards;
  }

  p {
    margin: 0;
    color: var(--rst-ui-action);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: #fffaf2;
    font-size: clamp(24px, 2.4vw, 36px);
    line-height: 0.98;
    letter-spacing: -0.055em;
  }

  span {
    color: #90a4bf;
    font-size: 12px;
    line-height: 1.42;
  }

  .rail-export-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  button {
    flex: 1 1 120px;
    min-height: 38px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: #fffaf2;
    background: rgba(255, 255, 255, 0.07);
    font: inherit;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
    transition:
      transform 0.14s var(--rst-ease-out),
      background-color 0.14s ease,
      border-color 0.14s ease,
      box-shadow 0.14s ease;
  }

  button:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.14);
    transform: translateY(-1px);
  }

  button:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
  }

  .primary-action {
    color: #160c06;
    border-color: rgba(240, 100, 35, 0.7);
    background: var(--rst-ui-action);
  }

  .primary-action:hover:not(:disabled) {
    box-shadow: 0 10px 24px rgba(var(--rst-ui-action-rgb), 0.24);
  }

  button:disabled {
    cursor: default;
    opacity: 0.48;
    filter: grayscale(0.45);
  }
</style>
