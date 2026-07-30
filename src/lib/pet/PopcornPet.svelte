<script lang="ts">
  import { page } from '$app/state';
  import { Volume2, X } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { sound } from '$lib/sound/sound.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import {
    buildPopcornInsights,
    type PopcornInsight,
    type PopcornInsightTone
  } from './popcorn-insights';
  import { popcornPet } from './popcorn-pet.svelte';

  let animationKey = $state(0);
  let currentInstant = $state(new Date());
  let currentInsight = $state<PopcornInsight | null>(null);
  let reaction = $state<PopcornInsightTone>('info');
  let speechSupported = $state(false);
  let voiceActive = $state(false);
  let observedSequence = 0;
  let observedContext = '';
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  let speechRun = 0;
  const cursors = new Map<string, number>();

  const insights = $derived(
    buildPopcornInsights({
      pathname: page.url.pathname,
      role: workspace.effectiveRole,
      employeeId: workspace.effectiveEmployeeId,
      bootstrap: workspace.bootstrap,
      operations: workspace.operations,
      employeeOperations: workspace.employeeOperations,
      team: workspace.team,
      restaurant: workspace.restaurant,
      preview: workspace.isPreview,
      now: currentInstant
    })
  );
  const hasAttention = $derived(insights.some((insight) => insight.tone === 'attention'));

  $effect(() => {
    const sequence = popcornPet.sequence;
    if (!sequence || sequence === observedSequence) return;
    observedSequence = sequence;
    if (!popcornPet.visible) return;
    triggerPop();
  });

  $effect(() => {
    const context = `${workspace.activeId ?? ''}|${page.url.pathname}`;
    if (observedContext && context !== observedContext) {
      if (bubbleTimer) clearTimeout(bubbleTimer);
      currentInsight = null;
      cancelSpeech();
    }
    observedContext = context;
  });

  onMount(() => {
    speechSupported =
      typeof window.speechSynthesis !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';
    const timer = setInterval(() => {
      currentInstant = new Date();
    }, 60_000);
    return () => clearInterval(timer);
  });

  onDestroy(() => {
    if (bubbleTimer) clearTimeout(bubbleTimer);
    cancelSpeech();
  });

  function requestPop(): void {
    sound.unlock();
    popcornPet.pop();
  }

  function nextInsight(): PopcornInsight {
    const available = insights.length
      ? insights
      : [
          {
            id: 'fallback',
            tone: 'info' as const,
            title: 'Popcorn is listening',
            message: 'Open a workspace module and I will surface its useful signals here.'
          }
        ];
    const path = page.url.pathname;
    const cursor = cursors.get(path) ?? 0;
    cursors.set(path, cursor + 1);
    return available[cursor % available.length];
  }

  function triggerPop(): void {
    animationKey += 1;
    currentInsight = nextInsight();
    reaction = currentInsight.tone;
    sound.play(
      reaction === 'attention'
        ? 'popcorn-attention'
        : reaction === 'success'
          ? 'popcorn-success'
          : 'popcorn'
    );
    speak(currentInsight);
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      currentInsight = null;
      cancelSpeech();
    }, 8_000);
  }

  function localized(insight: PopcornInsight): { title: string; message: string } {
    return {
      title: t(insight.title, insight.params),
      message: t(insight.message, insight.params)
    };
  }

  function cancelSpeech(): void {
    speechRun += 1;
    voiceActive = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function speak(insight: PopcornInsight): void {
    if (!sound.enabled || !speechSupported) return;
    const synthesis = window.speechSynthesis;
    const copy = localized(insight);
    const utterance = new SpeechSynthesisUtterance(
      `Dugh, dugh, dugh. ${copy.title}. ${copy.message}`
    );
    const run = ++speechRun;
    const language = i18n.intlLocale;
    const languageRoot = language.slice(0, 2).toLowerCase();
    const voices = synthesis.getVoices();
    utterance.lang = language;
    utterance.voice =
      voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase()) ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith(languageRoot)) ??
      null;
    utterance.rate = 1.02;
    utterance.pitch = 0.92;
    utterance.volume = 0.82;
    utterance.onstart = () => {
      if (run === speechRun) voiceActive = true;
    };
    utterance.onend = utterance.onerror = () => {
      if (run === speechRun) voiceActive = false;
    };
    synthesis.cancel();
    synthesis.speak(utterance);
  }

  function repeatSpeech(event: MouseEvent): void {
    event.stopPropagation();
    if (!currentInsight) return;
    sound.unlock();
    speak(currentInsight);
  }

  function hide(): void {
    if (bubbleTimer) clearTimeout(bubbleTimer);
    currentInsight = null;
    cancelSpeech();
    popcornPet.hide();
  }
</script>

{#if popcornPet.visible}
  <aside class="popcorn-pet" aria-label="Popcorn">
    {#if currentInsight}
      {#key animationKey}
        <div
          class="popcorn-pet__bubble"
          data-tone={currentInsight.tone}
          role="status"
          aria-live="polite"
        >
          <div class="popcorn-pet__bubble-head">
            <span><i aria-hidden="true"></i>dugh dugh dugh</span>
            {#if speechSupported && sound.enabled}
              <button
                class:is-speaking={voiceActive}
                type="button"
                aria-label={t('Read Popcorn note aloud')}
                title={t('Read Popcorn note aloud')}
                onclick={repeatSpeech}
              >
                <Volume2 size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            {/if}
          </div>
          <strong>{t(currentInsight.title, currentInsight.params)}</strong>
          <p>{t(currentInsight.message, currentInsight.params)}</p>
        </div>

        <span class="popcorn-pet__kernels" data-tone={reaction} aria-hidden="true">
          {#each Array(6) as _}
            <i></i>
          {/each}
        </span>
      {/key}
    {/if}

    <button
      class="popcorn-pet__close"
      type="button"
      aria-label={t('Hide Popcorn')}
      title={t('Hide Popcorn')}
      onclick={hide}
    >
      <X size={14} strokeWidth={2.2} aria-hidden="true" />
    </button>

    <button
      class="popcorn-pet__button"
      type="button"
      aria-label={t(hasAttention ? 'Hear what Popcorn spotted' : 'Hear a Popcorn note')}
      title={t(hasAttention ? 'Hear what Popcorn spotted' : 'Hear a Popcorn note')}
      onclick={requestPop}
    >
      {#if hasAttention && !currentInsight}
        <span class="popcorn-pet__signal" aria-hidden="true"></span>
      {/if}
      {#key animationKey}
        <span
          class="popcorn-pet__motion"
          class:is-success={reaction === 'success'}
          class:is-attention={reaction === 'attention'}
        >
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
    right: 86px;
    bottom: max(8px, env(safe-area-inset-bottom, 0px));
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
    animation: popcorn-pop .58s var(--cl-ease-spring) both;
  }

  .popcorn-pet__motion.is-success {
    animation-name: popcorn-celebrate;
  }

  .popcorn-pet__motion.is-attention {
    animation-name: popcorn-attention;
  }

  .popcorn-pet img {
    object-fit: contain;
    user-select: none;
  }

  .popcorn-pet__signal {
    width: 14px;
    height: 14px;
    position: absolute;
    z-index: 4;
    top: 52px;
    right: 21px;
    border: 3px solid var(--cl-surface);
    border-radius: 50%;
    background: var(--cl-attention);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--cl-attention) 42%, transparent);
    animation: popcorn-signal 1.8s ease-out infinite;
  }

  .popcorn-pet__bubble {
    width: min(278px, calc(100vw - 24px));
    position: absolute;
    z-index: 5;
    right: 24px;
    bottom: 145px;
    padding: 11px 12px 12px;
    border: 1px solid var(--cl-line-strong);
    border-radius: 7px;
    color: var(--cl-ink);
    background: var(--cl-surface);
    box-shadow: 0 12px 32px rgb(15 23 42 / 16%);
    pointer-events: auto;
    animation: popcorn-say .28s var(--cl-ease-spring) both;
  }

  .popcorn-pet__bubble[data-tone='success'] {
    border-top-color: color-mix(in srgb, var(--cl-ok) 72%, var(--cl-line));
  }

  .popcorn-pet__bubble[data-tone='attention'] {
    border-top-color: color-mix(in srgb, var(--cl-attention) 76%, var(--cl-line));
  }

  .popcorn-pet__bubble::after {
    content: '';
    width: 10px;
    height: 10px;
    position: absolute;
    right: 34px;
    bottom: -6px;
    border-right: 1px solid var(--cl-line-strong);
    border-bottom: 1px solid var(--cl-line-strong);
    background: var(--cl-surface);
    transform: rotate(45deg);
  }

  .popcorn-pet__bubble-head {
    min-height: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 4px;
  }

  .popcorn-pet__bubble-head > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--cl-muted);
    font-size: 9.5px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .05em;
    text-transform: uppercase;
  }

  .popcorn-pet__bubble-head > span i {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--cl-accent);
  }

  .popcorn-pet__bubble[data-tone='success'] .popcorn-pet__bubble-head > span i {
    background: var(--cl-ok);
  }

  .popcorn-pet__bubble[data-tone='attention'] .popcorn-pet__bubble-head > span i {
    background: var(--cl-attention);
  }

  .popcorn-pet__bubble-head button {
    width: 24px;
    height: 24px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--cl-muted);
    background: transparent;
    cursor: pointer;
    transition:
      color var(--cl-dur) var(--cl-ease),
      background var(--cl-dur) var(--cl-ease),
      transform var(--cl-dur) var(--cl-ease);
  }

  .popcorn-pet__bubble-head button:hover,
  .popcorn-pet__bubble-head button:focus-visible {
    color: var(--cl-accent);
    background: var(--cl-surface-muted);
    outline: none;
  }

  .popcorn-pet__bubble-head button.is-speaking {
    color: var(--cl-accent);
    animation: popcorn-voice .8s ease-in-out infinite alternate;
  }

  .popcorn-pet__bubble > strong {
    display: block;
    margin: 0;
    font-size: 13px;
    line-height: 1.25;
  }

  .popcorn-pet__bubble p {
    margin: 3px 0 0;
    color: var(--cl-muted);
    font-size: 11.5px;
    line-height: 1.42;
  }

  .popcorn-pet__kernels {
    width: 92px;
    height: 72px;
    position: absolute;
    z-index: 4;
    right: 33px;
    bottom: 111px;
  }

  .popcorn-pet__kernels i {
    --kernel-color: #fff2c7;
    width: 8px;
    height: 8px;
    position: absolute;
    left: 42px;
    bottom: 2px;
    border: 1px solid rgb(185 133 50 / 30%);
    border-radius: 50% 46% 54% 44%;
    background: var(--kernel-color);
    box-shadow: inset -2px -1px 0 rgb(221 174 88 / 28%);
    opacity: 0;
    animation: popcorn-kernel .82s var(--cl-ease-spring) both;
  }

  .popcorn-pet__kernels[data-tone='success'] i {
    --kernel-color: color-mix(in srgb, #fff2c7 70%, var(--cl-ok));
  }

  .popcorn-pet__kernels[data-tone='attention'] i {
    --kernel-color: color-mix(in srgb, #fff2c7 74%, var(--cl-attention));
  }

  .popcorn-pet__kernels i:nth-child(1) { --x: -35px; --y: -50px; animation-delay: 20ms; }
  .popcorn-pet__kernels i:nth-child(2) { --x: -14px; --y: -66px; animation-delay: 80ms; }
  .popcorn-pet__kernels i:nth-child(3) { --x: 9px; --y: -58px; animation-delay: 35ms; }
  .popcorn-pet__kernels i:nth-child(4) { --x: 31px; --y: -44px; animation-delay: 110ms; }
  .popcorn-pet__kernels i:nth-child(5) { --x: -28px; --y: -29px; animation-delay: 145ms; }
  .popcorn-pet__kernels i:nth-child(6) { --x: 25px; --y: -24px; animation-delay: 175ms; }

  .popcorn-pet__close {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    position: absolute;
    z-index: 6;
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
    transition:
      opacity var(--cl-dur) var(--cl-ease),
      color var(--cl-dur) var(--cl-ease),
      transform var(--cl-dur) var(--cl-ease);
  }

  .popcorn-pet:is(:hover, :focus-within) .popcorn-pet__close {
    opacity: 1;
  }

  .popcorn-pet__close:hover {
    color: var(--cl-ink);
    transform: scale(1.06);
  }

  @keyframes popcorn-arrive {
    from { opacity: 0; transform: translate(26px, 34px) rotate(4deg); }
    to { opacity: 1; transform: translate(0, 0) rotate(0); }
  }

  @keyframes popcorn-pop {
    0% { transform: scale(.94) translateY(6px); }
    45% { transform: scale(1.04, .97) translateY(-7px) rotate(1deg); }
    100% { transform: scale(1) translateY(0) rotate(0); }
  }

  @keyframes popcorn-celebrate {
    0% { transform: scale(.94) translateY(6px) rotate(0); }
    36% { transform: scale(1.04, .96) translateY(-11px) rotate(-2deg); }
    64% { transform: scale(1.01) translateY(-4px) rotate(2deg); }
    100% { transform: scale(1) translateY(0) rotate(0); }
  }

  @keyframes popcorn-attention {
    0% { transform: scale(.96) translateY(5px) rotate(0); }
    34% { transform: scale(1.02) translateY(-6px) rotate(-3deg); }
    56% { transform: scale(1.02) translateY(-5px) rotate(3deg); }
    76% { transform: scale(1.01) translateY(-3px) rotate(-1deg); }
    100% { transform: scale(1) translateY(0) rotate(0); }
  }

  @keyframes popcorn-say {
    from { opacity: 0; transform: translateY(6px) scale(.92); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes popcorn-kernel {
    0% { opacity: 0; transform: translate(0, 10px) scale(.3) rotate(0); }
    24% { opacity: 1; }
    72% { opacity: .9; }
    100% { opacity: 0; transform: translate(var(--x), var(--y)) scale(1.05) rotate(170deg); }
  }

  @keyframes popcorn-signal {
    65%, 100% { box-shadow: 0 0 0 7px transparent; }
  }

  @keyframes popcorn-voice {
    from { transform: scale(.94); opacity: .72; }
    to { transform: scale(1.08); opacity: 1; }
  }

  @media (max-width: 760px) {
    .popcorn-pet {
      width: 124px;
      height: 138px;
      right: 78px;
      bottom: max(6px, env(safe-area-inset-bottom, 0px));
    }

    .popcorn-pet__button {
      width: 106px;
      height: 106px;
    }

    .popcorn-pet__bubble {
      width: min(220px, calc(100vw - 100px));
      right: 0;
      bottom: 102px;
      padding: 9px 10px 10px;
    }

    .popcorn-pet__bubble::after {
      right: 27px;
    }

    .popcorn-pet__bubble p {
      font-size: 11px;
    }

    .popcorn-pet__kernels {
      right: 15px;
      bottom: 75px;
      transform: scale(.8);
    }

    .popcorn-pet__signal {
      top: 35px;
      right: 14px;
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
    .popcorn-pet__bubble,
    .popcorn-pet__signal,
    .popcorn-pet__bubble-head button.is-speaking {
      animation: none;
    }

    .popcorn-pet__kernels {
      display: none;
    }
  }
</style>
