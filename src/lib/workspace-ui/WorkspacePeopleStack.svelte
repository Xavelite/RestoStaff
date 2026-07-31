<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';

  export type WorkspacePerson = {
    id: string;
    name: string;
  };

  let {
    people = [],
    max = 4,
    emptyLabel = 'No employees'
  }: {
    people?: WorkspacePerson[];
    max?: number;
    emptyLabel?: string;
  } = $props();

  const shown = $derived(people.slice(0, max));
  const remaining = $derived(Math.max(0, people.length - shown.length));
  const title = $derived(people.length ? people.map((person) => person.name).join(', ') : t(emptyLabel));

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}` : parts[0]?.slice(0, 2) || '?')
      .toUpperCase();
  }

  function hue(id: string): number {
    let value = 0;
    for (const character of id) value = (value * 31 + character.charCodeAt(0)) % 360;
    return value;
  }
</script>

<span class="people-stack" class:is-empty={!people.length} {title} aria-label={title}>
  {#each shown as person (person.id)}
    <span
      class="people-stack__avatar"
      style={`--avatar-hue:${hue(person.id)}`}
      aria-hidden="true"
    >{initials(person.name)}</span>
  {/each}
  {#if remaining}
    <span class="people-stack__more" aria-hidden="true">+{remaining}</span>
  {:else if !people.length}
    <span class="people-stack__empty">{t(emptyLabel)}</span>
  {/if}
</span>

<style>
  .people-stack {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    padding-left: 7px;
  }

  .people-stack__avatar,
  .people-stack__more {
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    margin-left: -7px;
    border: 2px solid var(--cl-surface);
    border-radius: 50%;
    color: hsl(var(--avatar-hue, 218) 42% 31%);
    background: hsl(var(--avatar-hue, 218) 62% 91%);
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    line-height: 1;
  }

  .people-stack__more {
    --avatar-hue: 218;
    color: var(--cl-muted);
    background: var(--cl-surface-muted);
  }

  .people-stack__empty {
    margin-left: -7px;
    color: var(--cl-muted);
    font-size: var(--rst-fs-label);
    white-space: nowrap;
  }
</style>
