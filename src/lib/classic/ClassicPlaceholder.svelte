<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicIcon from './ClassicIcon.svelte';
  import type { ClassicIcon as IconName } from './classic-nav';

  let {
    icon,
    note = 'This module is not available yet.'
  }: { icon: IconName; note?: string } = $props();
</script>

<!-- The shell must accept modules that do not exist yet: a listed module always
     leads somewhere and says plainly that it is coming, rather than 404ing. -->
<section class="cl-card">
  <div class="placeholder">
    <ClassicIcon name={icon} size={30} />
    <strong>{t('Coming soon')}</strong>
    <p>{t(note)}</p>
  </div>
</section>

<style>
  .placeholder {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 56px 24px;
    color: var(--cl-muted);
    text-align: center;
  }
  .placeholder strong {
    color: var(--cl-ink);
    font-size: 15px;
  }
  .placeholder p {
    margin: 0;
    max-width: 44ch;
    font-size: 14px;
    line-height: 1.55;
  }
</style>
