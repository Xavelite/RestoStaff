<script lang="ts">
  export type TimelineTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

  export type TimelineEntry = {
    id: string;
    /** Day heading. A new value starts a new dated section. */
    day: string;
    title: string;
    description?: string | null;
    /** Short facts shown beside the title, e.g. the week or the actor. */
    facts?: string[];
    time: string;
    isoTime?: string | null;
    tone?: TimelineTone;
  };

  let { entries }: { entries: TimelineEntry[] } = $props();
</script>

<!-- History is a sequence, so it reads down a spine rather than across columns:
     what happened, to which week, by whom, in the order it actually happened. -->
<ol class="timeline">
  {#each entries as entry, index (entry.id)}
    {#if index === 0 || entries[index - 1].day !== entry.day}
      <li class="timeline__day"><span>{entry.day}</span></li>
    {/if}
    <li class="timeline__item is-{entry.tone ?? 'neutral'}">
      <span class="timeline__rail" aria-hidden="true"><i></i></span>
      <div class="timeline__body">
        <p class="timeline__head">
          <strong>{entry.title}</strong>
          <time datetime={entry.isoTime ?? undefined}>{entry.time}</time>
        </p>
        {#if entry.facts?.length}
          <p class="timeline__facts">
            {#each entry.facts as fact (fact)}<span>{fact}</span>{/each}
          </p>
        {/if}
        {#if entry.description}
          <p class="timeline__note">{entry.description}</p>
        {/if}
      </div>
    </li>
  {/each}
</ol>

<style>
  .timeline { display: grid; align-content: start; gap: 0; margin: 0; padding: 16px 18px 20px; list-style: none; }

  .timeline__day {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 10px 0 8px;
    padding: 3px 0;
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-panel);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    letter-spacing: .05em;
    text-transform: uppercase;
  }
  .timeline__day:first-child { margin-top: 0; }

  .timeline__item { --tone: var(--rst-ui-line-strong); display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; }
  .timeline__item.is-accent { --tone: var(--cl-accent); }
  .timeline__item.is-ok { --tone: var(--cl-ok, #157f4b); }
  .timeline__item.is-warn { --tone: var(--rst-state-warning, #d99a1c); }
  .timeline__item.is-danger { --tone: var(--rst-state-danger); }

  /* The rail is one continuous line with the dot punched onto it, so the eye
     follows a single thread instead of a stack of disconnected rows. */
  .timeline__rail { position: relative; display: block; }
  .timeline__rail::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: -2px;
    left: 50%;
    width: 1px;
    background: var(--rst-ui-divider-soft);
    transform: translateX(-50%);
  }
  .timeline__item:last-child .timeline__rail::before { bottom: auto; height: 16px; }
  .timeline__rail i {
    position: absolute;
    top: 14px;
    left: 50%;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--tone);
    box-shadow: 0 0 0 3px var(--rst-ui-surface-panel), 0 0 0 4.5px color-mix(in srgb, var(--tone) 30%, transparent);
    transform: translate(-50%, -50%);
  }

  .timeline__body { min-width: 0; display: grid; gap: 3px; padding: 8px 0 14px; }
  .timeline__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; margin: 0; }
  .timeline__head strong { font-size: var(--rst-fs-body); font-weight: var(--rst-fw-bold); }
  .timeline__head time { color: var(--rst-ui-muted); font-size: var(--rst-fs-caption); font-variant-numeric: tabular-nums; }

  .timeline__facts { display: flex; flex-wrap: wrap; gap: 5px; margin: 1px 0 0; }
  .timeline__facts span {
    padding: 1px 7px;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field-strong);
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-medium);
  }

  .timeline__note { margin: 3px 0 0; color: var(--rst-ui-muted); font-size: var(--rst-fs-control); line-height: 1.45; }

  @media (max-width: 520px) {
    .timeline { padding: 12px 12px 16px; }
  }
</style>
