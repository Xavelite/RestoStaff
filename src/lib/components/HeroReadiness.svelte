<script lang="ts">
  // Shared hero "readiness signal" aside: the circular %-ready dial plus the
  // stat list. Previously hand-rolled identically in Team and Restaurant.
  let {
    percent,
    cards,
    hasIssues = percent < 100,
    label = 'Readiness signal'
  }: {
    percent: number;
    cards: { label: string; value: string | number; complete: boolean }[];
    hasIssues?: boolean;
    label?: string;
  } = $props();
</script>

<div class="page-hero__command" aria-label={label}>
  <div class:has-issues={hasIssues} class="readiness-dial" style={`--ready:${percent}%`}>
    <strong>{percent}%</strong>
    <span>ready</span>
  </div>
  <dl class="hero-stats">
    {#each cards as card}
      <div class:is-complete={card.complete}>
        <dt>{card.label}</dt>
        <dd>{card.value}</dd>
      </div>
    {/each}
  </dl>
</div>
