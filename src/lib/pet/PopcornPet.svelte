<script lang="ts">
  import { page } from '$app/state';
  import { Volume2, VolumeX, X } from '@lucide/svelte';
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
  let animating = $state(false);
  let currentInstant = $state(new Date());
  let currentInsight = $state<PopcornInsight | null>(null);
  let invitationVisible = $state(false);
  let reaction = $state<PopcornInsightTone>('info');
  let speechSupported = $state(false);
  let voiceActive = $state(false);
  let observedSequence = 0;
  let observedVisibility = popcornPet.visible;
  let observedContext = '';
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  let motionTimer: ReturnType<typeof setTimeout> | undefined;
  let speechRun = 0;
  let availableVoices: SpeechSynthesisVoice[] = [];
  let petRoot = $state<HTMLElement>();
  let dragging = $state(false);
  let bubbleOpensRight = $state(false);
  let bubbleOpensBelow = $state(false);
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let dragStartPositionX = 0;
  let dragStartPositionY = 0;
  let dragBaseLeft = 0;
  let dragBaseTop = 0;
  let dragWidth = 0;
  let dragHeight = 0;
  let dragMoved = false;
  let suppressClick = false;
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
    const visible = popcornPet.visible;
    if (visible && !observedVisibility) {
      showInvitation();
      requestAnimationFrame(() => clampCurrentPosition(true));
    }
    observedVisibility = visible;
  });

  $effect(() => {
    const context = `${workspace.activeId ?? ''}|${page.url.pathname}`;
    if (observedContext && context !== observedContext) {
      if (bubbleTimer) clearTimeout(bubbleTimer);
      if (motionTimer) clearTimeout(motionTimer);
      currentInsight = null;
      invitationVisible = false;
      animating = false;
      cancelSpeech();
    }
    observedContext = context;
  });

  onMount(() => {
    const synthesis = window.speechSynthesis;
    speechSupported =
      typeof synthesis !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance !== 'undefined';
    const refreshVoices = () => {
      availableVoices = synthesis?.getVoices() ?? [];
    };
    refreshVoices();
    synthesis?.addEventListener('voiceschanged', refreshVoices);
    const keepInsideViewport = () => clampCurrentPosition(true);
    window.addEventListener('resize', keepInsideViewport);
    requestAnimationFrame(() => clampCurrentPosition(true));
    const timer = setInterval(() => {
      currentInstant = new Date();
    }, 60_000);
    return () => {
      clearInterval(timer);
      synthesis?.removeEventListener('voiceschanged', refreshVoices);
      window.removeEventListener('resize', keepInsideViewport);
    };
  });

  onDestroy(() => {
    if (bubbleTimer) clearTimeout(bubbleTimer);
    if (motionTimer) clearTimeout(motionTimer);
    cancelSpeech();
  });

  function requestPop(): void {
    if (suppressClick) return;
    sound.unlock();
    invitationVisible = false;
    popcornPet.pop();
  }

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  }

  function updateBubblePlacement(
    left: number,
    top: number,
    width: number,
    height: number
  ): void {
    bubbleOpensRight = left + width / 2 < window.innerWidth / 2;
    bubbleOpensBelow = top + height / 2 < 190;
  }

  function clampCurrentPosition(persist = false): void {
    if (!petRoot || typeof window === 'undefined') return;
    const rect = petRoot.getBoundingClientRect();
    const baseLeft = rect.left - popcornPet.positionX;
    const baseTop = rect.top - popcornPet.positionY;
    const margin = 6;
    const x = clamp(
      popcornPet.positionX,
      margin - baseLeft,
      window.innerWidth - margin - baseLeft - rect.width
    );
    const y = clamp(
      popcornPet.positionY,
      margin - baseTop,
      window.innerHeight - margin - baseTop - rect.height
    );
    popcornPet.setPosition(x, y, persist);
    updateBubblePlacement(baseLeft + x, baseTop + y, rect.width, rect.height);
  }

  function startDrag(event: PointerEvent): void {
    if (event.button !== 0 || !petRoot) return;
    const rect = petRoot.getBoundingClientRect();
    dragging = true;
    dragMoved = false;
    dragStartClientX = event.clientX;
    dragStartClientY = event.clientY;
    dragStartPositionX = popcornPet.positionX;
    dragStartPositionY = popcornPet.positionY;
    dragBaseLeft = rect.left - popcornPet.positionX;
    dragBaseTop = rect.top - popcornPet.positionY;
    dragWidth = rect.width;
    dragHeight = rect.height;
    (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent): void {
    if (!dragging) return;
    const deltaX = event.clientX - dragStartClientX;
    const deltaY = event.clientY - dragStartClientY;
    if (!dragMoved && Math.hypot(deltaX, deltaY) < 5) return;
    dragMoved = true;
    event.preventDefault();
    const margin = 6;
    const x = clamp(
      dragStartPositionX + deltaX,
      margin - dragBaseLeft,
      window.innerWidth - margin - dragBaseLeft - dragWidth
    );
    const y = clamp(
      dragStartPositionY + deltaY,
      margin - dragBaseTop,
      window.innerHeight - margin - dragBaseTop - dragHeight
    );
    popcornPet.setPosition(x, y);
    updateBubblePlacement(dragBaseLeft + x, dragBaseTop + y, dragWidth, dragHeight);
  }

  function endDrag(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const target = event.currentTarget as HTMLButtonElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    popcornPet.persistPosition();
    suppressClick = dragMoved;
    if (suppressClick) setTimeout(() => (suppressClick = false), 0);
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
    animating = true;
    invitationVisible = false;
    currentInsight = nextInsight();
    reaction = currentInsight.tone;
    if (popcornPet.audioEnabled) {
      sound.play(
        reaction === 'attention'
          ? 'popcorn-attention'
          : reaction === 'success'
            ? 'popcorn-success'
            : 'popcorn'
      );
    }
    speak(currentInsight);
    if (motionTimer) clearTimeout(motionTimer);
    motionTimer = setTimeout(() => {
      animating = false;
    }, 2_200);
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      currentInsight = null;
      cancelSpeech();
    }, 8_000);
  }

  function showInvitation(): void {
    animationKey += 1;
    reaction = 'info';
    currentInsight = null;
    invitationVisible = true;
    animating = true;
    cancelSpeech();
    if (popcornPet.audioEnabled) sound.play('popcorn');
    if (motionTimer) clearTimeout(motionTimer);
    motionTimer = setTimeout(() => {
      animating = false;
    }, 2_200);
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      invitationVisible = false;
    }, 6_500);
  }

  function localized(insight: PopcornInsight): { title: string; message: string } {
    return {
      title: t(insight.title, insight.params),
      message: t(insight.message, insight.params)
    };
  }

  function voiceScore(voice: SpeechSynthesisVoice, language: string): number {
    const target = language.toLowerCase();
    const root = target.slice(0, 2);
    const voiceLanguage = voice.lang.toLowerCase();
    if (!voiceLanguage.startsWith(root)) return -1_000;

    const name = voice.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const naturalHints = ['natural', 'neural', 'premium', 'enhanced', 'online'];
    const trustedProviders = ['microsoft', 'google', 'apple'];
    const poorVoiceHints = ['compact', 'espeak', 'festival', 'robot', 'whisper', 'zarvox'];
    const familiarNaturalVoices: Record<string, string[]> = {
      en: ['aria', 'jenny', 'sonia', 'samantha', 'daniel', 'serena', 'karen', 'moira', 'tessa'],
      fr: ['denise', 'henri', 'thomas', 'audrey', 'amelie', 'marie'],
      nl: ['fenna', 'maarten', 'ellen', 'xander']
    };

    let score = voiceLanguage === target ? 120 : 80;
    if (naturalHints.some((hint) => name.includes(hint))) score += 70;
    if (trustedProviders.some((provider) => name.includes(provider))) score += 24;
    if ((familiarNaturalVoices[root] ?? []).some((hint) => name.includes(hint))) score += 36;
    if (voice.default) score += 8;
    if (poorVoiceHints.some((hint) => name.includes(hint))) score -= 100;
    return score;
  }

  function preferredVoice(language: string): SpeechSynthesisVoice | null {
    const voices = availableVoices.length
      ? availableVoices
      : window.speechSynthesis.getVoices();
    return [...voices].sort(
      (left, right) => voiceScore(right, language) - voiceScore(left, language)
    )[0] ?? null;
  }

  function cancelSpeech(): void {
    speechRun += 1;
    voiceActive = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function speak(insight: PopcornInsight): void {
    if (!sound.enabled || !popcornPet.audioEnabled || !speechSupported) return;
    const synthesis = window.speechSynthesis;
    const copy = localized(insight);
    const utterance = new SpeechSynthesisUtterance(`${copy.title}. ${copy.message}`);
    const run = ++speechRun;
    const language = i18n.intlLocale;
    utterance.lang = language;
    utterance.voice = preferredVoice(language);
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.volume = 0.78;
    utterance.onstart = () => {
      if (run === speechRun) voiceActive = true;
    };
    utterance.onend = utterance.onerror = () => {
      if (run === speechRun) voiceActive = false;
    };
    synthesis.cancel();
    synthesis.speak(utterance);
  }

  function toggleAudio(event: MouseEvent): void {
    event.stopPropagation();
    if (popcornPet.audioEnabled) cancelSpeech();
    popcornPet.toggleAudio();
  }

  function hide(): void {
    if (bubbleTimer) clearTimeout(bubbleTimer);
    if (motionTimer) clearTimeout(motionTimer);
    currentInsight = null;
    invitationVisible = false;
    animating = false;
    cancelSpeech();
    popcornPet.hide();
  }
</script>

{#if popcornPet.visible}
  <aside
    class="popcorn-pet"
    class:is-dragging={dragging}
    class:bubble-opens-right={bubbleOpensRight}
    class:bubble-opens-below={bubbleOpensBelow}
    style={`--pet-x:${popcornPet.positionX}px;--pet-y:${popcornPet.positionY}px`}
    aria-label="Popcorn"
    bind:this={petRoot}
  >
    {#if currentInsight || invitationVisible}
      {#key animationKey}
        <div
          class="popcorn-pet__bubble"
          class:is-invitation={invitationVisible}
          data-tone={currentInsight?.tone ?? 'info'}
          role="status"
          aria-live="polite"
        >
          <div class="popcorn-pet__bubble-head">
            <span><i aria-hidden="true"></i>Popcorn</span>
            {#if currentInsight && speechSupported}
              <button
                class:is-speaking={voiceActive}
                type="button"
                aria-label={t(popcornPet.audioEnabled ? 'Mute Popcorn sounds' : 'Unmute Popcorn sounds')}
                title={t(popcornPet.audioEnabled ? 'Mute Popcorn sounds' : 'Unmute Popcorn sounds')}
                onclick={toggleAudio}
              >
                {#if popcornPet.audioEnabled}
                  <Volume2 size={14} strokeWidth={2} aria-hidden="true" />
                {:else}
                  <VolumeX size={14} strokeWidth={2} aria-hidden="true" />
                {/if}
              </button>
            {/if}
          </div>
          {#if currentInsight}
            <strong>{t(currentInsight.title, currentInsight.params)}</strong>
            <p>{t(currentInsight.message, currentInsight.params)}</p>
          {:else}
            <button class="popcorn-pet__invitation" type="button" onclick={requestPop}>
              <strong>{t('Click me for useful info')}</strong>
              <span>{t('I can point out what matters on this page.')}</span>
            </button>
          {/if}
        </div>

        <span class="popcorn-pet__kernels" data-tone={reaction} aria-hidden="true">
          {#each Array(3) as _}
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
      aria-label={t(hasAttention ? 'Show what Popcorn spotted' : 'Show a Popcorn note')}
      title={t('Drag Popcorn or click for info')}
      onpointerdown={startDrag}
      onpointermove={moveDrag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
      onclick={requestPop}
    >
      {#if hasAttention && !currentInsight && !invitationVisible}
        <span class="popcorn-pet__signal" aria-hidden="true"></span>
      {/if}
      {#key animationKey}
        <span
          class="popcorn-pet__motion"
          class:is-success={reaction === 'success'}
          class:is-attention={reaction === 'attention'}
        >
          {#if animating}
            <picture>
              <source media="(prefers-reduced-motion: reduce)" srcset="/pet/popcorn-still.png" />
              <img src="/pet/popcorn.gif" alt="" width="384" height="384" draggable="false" />
            </picture>
          {:else}
            <img src="/pet/popcorn-still.png" alt="" width="384" height="384" draggable="false" />
          {/if}
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
    transform: translate3d(var(--pet-x, 0), var(--pet-y, 0), 0);
    will-change: transform;
    animation: popcorn-arrive .46s var(--cl-ease-spring) both;
  }

  .popcorn-pet.is-dragging {
    z-index: calc(var(--rst-z-panel) + 1);
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
    cursor: grab;
    pointer-events: auto;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .popcorn-pet.is-dragging .popcorn-pet__button {
    cursor: grabbing;
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
    animation: popcorn-pop .34s var(--cl-ease) both;
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
    animation: popcorn-signal 2.4s ease-out infinite;
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
    animation: popcorn-say .2s var(--cl-ease) both;
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

  .popcorn-pet.bubble-opens-right .popcorn-pet__bubble {
    right: auto;
    left: 24px;
  }

  .popcorn-pet.bubble-opens-right .popcorn-pet__bubble::after {
    right: auto;
    left: 34px;
  }

  .popcorn-pet.bubble-opens-below .popcorn-pet__bubble {
    top: 145px;
    bottom: auto;
  }

  .popcorn-pet.bubble-opens-below .popcorn-pet__bubble::after {
    top: -6px;
    bottom: auto;
    border: 0;
    border-top: 1px solid var(--cl-line-strong);
    border-left: 1px solid var(--cl-line-strong);
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

  .popcorn-pet__invitation {
    width: 100%;
    display: grid;
    gap: 3px;
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .popcorn-pet__invitation strong {
    color: var(--cl-ink);
    font-size: 13px;
    line-height: 1.25;
    transition: color var(--cl-dur) var(--cl-ease);
  }

  .popcorn-pet__invitation span {
    color: var(--cl-muted);
    font-size: 11.5px;
    line-height: 1.42;
  }

  .popcorn-pet__invitation:hover strong,
  .popcorn-pet__invitation:focus-visible strong {
    color: var(--cl-accent);
  }

  .popcorn-pet__invitation:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--cl-accent) 55%, transparent);
    outline-offset: 4px;
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
    animation: popcorn-kernel .54s var(--cl-ease) both;
  }

  .popcorn-pet__kernels[data-tone='success'] i {
    --kernel-color: color-mix(in srgb, #fff2c7 70%, var(--cl-ok));
  }

  .popcorn-pet__kernels[data-tone='attention'] i {
    --kernel-color: color-mix(in srgb, #fff2c7 74%, var(--cl-attention));
  }

  .popcorn-pet__kernels i:nth-child(1) { --x: -17px; --y: -26px; animation-delay: 20ms; }
  .popcorn-pet__kernels i:nth-child(2) { --x: 0; --y: -34px; animation-delay: 65ms; }
  .popcorn-pet__kernels i:nth-child(3) { --x: 17px; --y: -24px; animation-delay: 35ms; }

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
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes popcorn-pop {
    0% { transform: scale(.99) translateY(1px); }
    55% { transform: scale(1.01, .995) translateY(-2px); }
    100% { transform: scale(1) translateY(0); }
  }

  @keyframes popcorn-celebrate {
    0% { transform: scale(.99) translateY(1px); }
    50% { transform: scale(1.012) translateY(-3px); }
    100% { transform: scale(1) translateY(0); }
  }

  @keyframes popcorn-attention {
    0% { transform: translateY(1px) rotate(0); }
    48% { transform: translateY(-2px) rotate(-.7deg); }
    72% { transform: translateY(-1px) rotate(.7deg); }
    100% { transform: translateY(0) rotate(0); }
  }

  @keyframes popcorn-say {
    from { opacity: 0; transform: translateY(2px) scale(.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes popcorn-kernel {
    0% { opacity: 0; transform: translate(0, 5px) scale(.55); }
    28% { opacity: .8; }
    72% { opacity: .65; }
    100% { opacity: 0; transform: translate(var(--x), var(--y)) scale(.9) rotate(70deg); }
  }

  @keyframes popcorn-signal {
    70%, 100% { box-shadow: 0 0 0 4px transparent; }
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

    .popcorn-pet.bubble-opens-right .popcorn-pet__bubble {
      left: 0;
    }

    .popcorn-pet.bubble-opens-right .popcorn-pet__bubble::after {
      left: 27px;
    }

    .popcorn-pet.bubble-opens-below .popcorn-pet__bubble {
      top: 102px;
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
