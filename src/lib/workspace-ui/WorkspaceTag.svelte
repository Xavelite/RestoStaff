<script lang="ts">
  export type TagTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'quiet';

  let {
    label,
    tone = 'neutral',
    title = null
  }: { label: string; tone?: TagTone; title?: string | null } = $props();
</script>

<!-- The smallest unit of state in a visual layout: readable at a glance, never
     wide enough to push a tile out of shape. -->
<span class="tag is-{tone}" title={title ?? undefined}>{label}</span>

<style>
  .tag {
    padding: 1.5px 7px;
    border-radius: var(--rst-ui-radius-pill);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    letter-spacing: .01em;
    white-space: nowrap;
  }
  .tag.is-neutral { color: var(--rst-ui-muted); background: var(--rst-ui-surface-field-strong); }
  .tag.is-quiet { padding-inline: 0; color: var(--rst-ui-muted); background: transparent; font-weight: var(--rst-fw-medium); }
  .tag.is-accent { color: var(--rst-ui-action); background: var(--rst-ui-action-soft); }
  .tag.is-ok { color: var(--cl-ok, #157f4b); background: color-mix(in srgb, var(--cl-ok, #157f4b) 13%, transparent); }
  .tag.is-warn { color: var(--rst-state-warning-text, #8a5a00); background: color-mix(in srgb, var(--rst-state-warning, #d99a1c) 17%, transparent); }
  .tag.is-danger { color: var(--rst-state-danger-text, #b3261e); background: color-mix(in srgb, var(--rst-state-danger, #d33) 13%, transparent); }
</style>
