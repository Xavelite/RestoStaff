<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { sound } from '$lib/sound/sound.svelte';
  import { popcornPet } from './popcorn-pet.svelte';

  let animationKey = $state(0);
  let speaking = $state(false);
  let observedSequence = 0;
  let speechTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const sequence = popcornPet.sequence;
    if (!sequence || sequence === observedSequence) return;
    observedSequence = sequence;
    if (!popcornPet.visible) return;
    triggerPop();
  });

  onDestroy(() => {
    if (speechTimer) clearTimeout(speechTimer);
  });

  function requestPop(): void {
    sound.unlock();
    popcornPet.pop();
  }

  function triggerPop(): void {
    animationKey += 1;
    speaking = true;
    sound.play('popcorn');
    if (speechTimer) clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      speaking = false;
    }, 2400);
  }

  function hide(): void {
    if (speechTimer) clearTimeout(speechTimer);
    speaking = false;
    popcornPet.hide();
  }
</script>

{#if popcornPet.visible}
  <aside class="popcorn-pet" aria-label="Popcorn">
    {#if speaking}
      {#key animationKey}
        <div class="popcorn-pet__bubble" role="status" aria-live="polite">
          <strong>dugh dugh dugh!</strong>
        </div>
      {/key}
    {/if}

    <button
      class="popcorn-pet__close"
      type="button"
      aria-label={t('Hide Popcorn')}
      title={t('Hide Popcorn')}
      onclick={hide}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    </button>

    <button
      class="popcorn-pet__button"
      type="button"
      aria-label={t('Make Popcorn pop')}
      title={t('Make Popcorn pop')}
      onclick={requestPop}
    >
      {#key animationKey}
        <span class="popcorn-pet__motion">
          <picture>
            <source media="(prefers-reduced-motion: reduce)" srcset="/pet/popcorn-still.png" />
            <img src="/pet/popcorn.gif" alt="" width="384" height="384" draggable="false" />
          </picture>
        </span>
      {/key}
    </button>
  </aside>
{/if}

<style>
  .popcorn-pet {
    width: 174px;
    height: 188px;
    position: fixed;
    z-index: calc(var(--rst-z-panel) - 10);
    bottom: max(8px, env(safe-area-inset-bottom, 0px));
    left: calc(var(--cl-sidebar) + 16px);
    pointer-events: none;
    animation: popcorn-arrive .46s var(--cl-ease-spring) both;
  }

  .popcorn-pet__button {
    width: 152px;
    height: 152px;
    display: block;
    position: absolute;
    bottom: 0;
    left: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    pointer-events: auto;
    -webkit-tap-highlight-color: transparent;
  }

  .popcorn-pet__button:focus-visible {
    outline: none;
  }

  .popcorn-pet__button:focus-visible .popcorn-pet__motion {
    filter:
      drop-shadow(0 0 2px var(--cl-accent))
      drop-shadow(0 10px 12px rgb(15 23 42 / 18%));
  }

  .popcorn-pet__motion,
  .popcorn-pet picture,
  .popcorn-pet img {
    width: 100%;
    height: 100%;
    display: block;
  }

  .popcorn-pet__motion {
    filter: drop-shadow(0 10px 12px rgb(15 23 42 / 18%));
    transform-origin: 50% 100%;
    animation: popcorn-pop .48s var(--cl-ease-spring) both;
  }

  .popcorn-pet img {
    object-fit: contain;
    user-select: none;
  }

  .popcorn-pet__bubble {
    width: max-content;
    max-width: 150px;
    position: absolute;
    z-index: 2;
    bottom: 146px;
    left: 64px;
    padding: 8px 11px;
    border: 1px solid var(--cl-line-strong);
    border-radius: 7px;
    color: var(--cl-ink);
    background: var(--cl-surface);
    box-shadow: 0 8px 22px rgb(15 23 42 / 14%);
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
    animation: popcorn-say .25s var(--cl-ease-spring) both;
  }

  .popcorn-pet__bubble::after {
    content: '';
    width: 9px;
    height: 9px;
    position: absolute;
    bottom: -5px;
    left: 20px;
    border-right: 1px solid var(--cl-line-strong);
    border-bottom: 1px solid var(--cl-line-strong);
    background: var(--cl-surface);
    transform: rotate(45deg);
  }

  .popcorn-pet__close {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    position: absolute;
    z-index: 3;
    top: 44px;
    right: 0;
    padding: 0;
    border: 1px solid var(--cl-line);
    border-radius: 50%;
    color: var(--cl-muted);
    background: color-mix(in srgb, var(--cl-surface) 92%, transparent);
    box-shadow: 0 3px 10px rgb(15 23 42 / 10%);
    opacity: 0;
    cursor: pointer;
    pointer-events: auto;
    transition: opacity var(--cl-dur) var(--cl-ease), color var(--cl-dur) var(--cl-ease), transform var(--cl-dur) var(--cl-ease);
  }

  .popcorn-pet:is(:hover, :focus-within) .popcorn-pet__close {
    opacity: 1;
  }

  .popcorn-pet__close:hover {
    color: var(--cl-ink);
    transform: scale(1.06);
  }

  @keyframes popcorn-arrive {
    from { opacity: 0; transform: translate(-26px, 34px) rotate(-4deg); }
    to { opacity: 1; transform: translate(0, 0) rotate(0); }
  }

  @keyframes popcorn-pop {
    0% { transform: scale(.94) translateY(6px); }
    45% { transform: scale(1.04, .97) translateY(-7px) rotate(1deg); }
    100% { transform: scale(1) translateY(0) rotate(0); }
  }

  @keyframes popcorn-say {
    from { opacity: 0; transform: translateY(5px) scale(.88); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @media (max-width: 980px) {
    .popcorn-pet {
      left: 14px;
    }
  }

  @media (max-width: 760px) {
    .popcorn-pet {
      width: 124px;
      height: 138px;
      bottom: max(6px, env(safe-area-inset-bottom, 0px));
      left: 8px;
    }

    .popcorn-pet__button {
      width: 106px;
      height: 106px;
    }

    .popcorn-pet__bubble {
      bottom: 102px;
      left: 42px;
      padding: 7px 9px;
      font-size: 11px;
    }

    .popcorn-pet__close {
      top: 24px;
      right: 0;
      opacity: .72;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .popcorn-pet,
    .popcorn-pet__motion,
    .popcorn-pet__bubble {
      animation: none;
    }
  }
</style>
