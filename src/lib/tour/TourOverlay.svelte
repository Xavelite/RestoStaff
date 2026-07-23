<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { tour } from './tour.svelte';

  // Overlay for the interactive help tour: a morphing spotlight over the real
  // element plus a coach-card that explains it. Mounted once in the app shell;
  // renders nothing unless a tour is running. Geometry is recomputed on step
  // change, scroll and resize so the spotlight tracks its target live.

  let cardEl = $state<HTMLDivElement | null>(null);
  let spot = $state<{ top: number; left: number; width: number; height: number } | null>(null);
  let placement = $state<'top' | 'bottom' | 'left' | 'right' | 'center'>('center');
  let cardPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });
  let arrow = $state<{ axis: 'x' | 'y'; at: number } | null>(null);
  let mobile = $state(false);

  const GAP = 14;
  const MARGIN = 12;
  const PAD = 8;

  const reduceMotion = () =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function targetEl(): HTMLElement | null {
    const sel = tour.current?.target;
    return sel ? document.querySelector<HTMLElement>(sel) : null;
  }

  function clickTargets(selectors: string | string[] | undefined) {
    if (!selectors) return;
    for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
      document.querySelector<HTMLElement>(selector)?.click();
    }
  }

  async function waitForTarget(selector: string | undefined, cancelled: () => boolean) {
    if (!selector) return;
    for (let attempt = 0; attempt < 12 && !cancelled(); attempt += 1) {
      if (document.querySelector(selector)) return;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }

  function centerCard() {
    const cw = cardEl?.offsetWidth ?? 380;
    const ch = cardEl?.offsetHeight ?? 210;
    spot = null;
    placement = 'center';
    arrow = null;
    cardPos = {
      top: Math.max(MARGIN, (window.innerHeight - ch) / 2),
      left: Math.max(MARGIN, (window.innerWidth - cw) / 2)
    };
  }

  function computeGeometry() {
    const step = tour.current;
    if (!step) return;
    mobile = window.innerWidth < 640;
    const el = step.target ? targetEl() : null;
    if (!el) {
      centerCard();
      return;
    }

    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      centerCard();
      return;
    }
    const pad = step.padding ?? PAD;
    spot = { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 };

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = cardEl?.offsetWidth ?? 340;
    const ch = cardEl?.offsetHeight ?? 210;

    if (mobile) {
      placement = 'bottom';
      arrow = null;
      cardPos = { top: vh - ch - MARGIN, left: (vw - Math.min(cw, vw - 2 * MARGIN)) / 2 };
      return;
    }

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    let place: typeof placement =
      step.placement && step.placement !== 'auto' ? step.placement : 'bottom';
    if (!step.placement || step.placement === 'auto') {
      if (vh - r.bottom >= ch + GAP + MARGIN) place = 'bottom';
      else if (r.top >= ch + GAP + MARGIN) place = 'top';
      else if (vw - r.right >= cw + GAP + MARGIN) place = 'right';
      else if (r.left >= cw + GAP + MARGIN) place = 'left';
      else place = 'bottom';
    }

    let top = 0;
    let left = 0;
    if (place === 'bottom') {
      top = r.bottom + pad + GAP;
      left = cx - cw / 2;
    } else if (place === 'top') {
      top = r.top - pad - GAP - ch;
      left = cx - cw / 2;
    } else if (place === 'right') {
      left = r.right + pad + GAP;
      top = cy - ch / 2;
    } else {
      left = r.left - pad - GAP - cw;
      top = cy - ch / 2;
    }
    left = Math.min(Math.max(left, MARGIN), vw - cw - MARGIN);
    top = Math.min(Math.max(top, MARGIN), vh - ch - MARGIN);

    placement = place;
    cardPos = { top, left };
    arrow =
      place === 'bottom' || place === 'top'
        ? { axis: 'x', at: Math.min(Math.max(cx - left, 20), cw - 20) }
        : { axis: 'y', at: Math.min(Math.max(cy - top, 20), ch - 20) };
  }

  let raf = 0;
  function scheduleMeasure() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      computeGeometry();
    });
  }

  // Step change: bring the target into view with the *minimum* scroll (never
  // centering, so top-anchored elements don't push a blank band above the
  // sticky header), then measure. The scroll is instant so the card lands in
  // its final position immediately — the spotlight still glides between steps
  // via its CSS transition, which carries the sense of motion.
  $effect(() => {
    if (!tour.active) return;
    void tour.index;
    const step = tour.current;
    let cancelled = false;
    let settle = 0;
    void (async () => {
      clickTargets(step?.enter?.click);
      await tick();
      await waitForTarget(step?.enter?.waitFor, () => cancelled);
      if (cancelled) return;
      const el = step?.target ? targetEl() : null;
      if (el) {
        el.style.scrollMarginTop = '84px';
        el.style.scrollMarginBottom = '104px';
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      }
      computeGeometry();
      settle = requestAnimationFrame(computeGeometry);
    })();
    return () => {
      cancelled = true;
      if (settle) cancelAnimationFrame(settle);
      clickTargets(step?.leave?.click);
    };
  });

  onMount(() => {
    const onScroll = () => scheduleMeasure();
    const onResize = () => scheduleMeasure();
    const onKey = (e: KeyboardEvent) => {
      if (!tour.active) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        tour.close();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        tour.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        tour.back();
      }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

{#if tour.active && tour.current}
  {@const step = tour.current}
  <div class="tour" role="dialog" aria-modal="true" aria-label={tour.label}>
    <div class="tour__guard" class:is-dim={!spot}></div>

    {#if spot}
      <div
        class="tour__spot"
        class:no-motion={reduceMotion()}
        style="top:{spot.top}px; left:{spot.left}px; width:{spot.width}px; height:{spot.height}px;"
      ></div>
    {/if}

    <div
      bind:this={cardEl}
      class="tour__card place-{placement}"
      class:is-mobile={mobile}
      style="top:{cardPos.top}px; left:{cardPos.left}px;"
    >
      {#if arrow && !mobile}
        <span
          class="tour__arrow"
          style={arrow.axis === 'x' ? `left:${arrow.at}px` : `top:${arrow.at}px`}
        ></span>
      {/if}

      <button class="tour__close" type="button" aria-label={t('Close')} onclick={() => tour.close()}
        >×</button
      >

      <span class="tour__eyebrow">{tour.label} · {t('Step')} {tour.index + 1}/{tour.total}</span>
      <h2 class="tour__title">{step.title}</h2>
      <p class="tour__body">{step.body}</p>
      {#if step.how}<p class="tour__how">{step.how}</p>{/if}

      <div class="tour__dots" role="tablist" aria-label={t('Tour progress')}>
        {#each tour.steps as _s, i (i)}
          <button
            class="tour__dot"
            class:on={i === tour.index}
            class:done={i < tour.index}
            aria-label="{t('Step')} {i + 1}"
            aria-current={i === tour.index ? 'step' : undefined}
            onclick={() => tour.goto(i)}
          ></button>
        {/each}
      </div>

      <div class="tour__foot">
        <button class="tour__skip" type="button" onclick={() => tour.close()}>{t('Skip tour')}</button>
        <div class="tour__actions">
          {#if !tour.isFirst}
            <button class="tour__btn ghost" type="button" onclick={() => tour.back()}
              >{t('Back')}</button
            >
          {/if}
          <button class="tour__btn primary" type="button" onclick={() => tour.next()}>
            {tour.isLast ? t('Finish') : t('Next')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .tour {
    position: fixed;
    inset: 0;
    z-index: 4000;
    --tour-scrim: rgba(24, 16, 10, 0.66);
    --tour-ring: #f6853f;
    --tour-glow: rgba(246, 133, 63, 0.5);
  }

  /* Full-screen interaction guard. Transparent when a spotlight supplies the
     dim; visibly dark for centered (targetless) steps. */
  .tour__guard {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: transparent;
  }
  .tour__guard.is-dim {
    background: var(--tour-scrim);
    animation: tour-fade 0.2s ease;
  }

  .tour__spot {
    position: fixed;
    z-index: 2;
    border-radius: 14px;
    box-shadow: 0 0 0 100vmax var(--tour-scrim);
    pointer-events: none;
    transition:
      top 0.38s cubic-bezier(0.4, 0, 0.2, 1),
      left 0.38s cubic-bezier(0.4, 0, 0.2, 1),
      width 0.38s cubic-bezier(0.4, 0, 0.2, 1),
      height 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .tour__spot::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow:
      0 0 0 2px var(--tour-ring),
      0 0 22px 3px var(--tour-glow);
    animation: tour-pulse 2.4s ease-in-out infinite;
  }
  .tour__spot.no-motion {
    transition: none;
  }
  .tour__spot.no-motion::after {
    animation: none;
  }

  .tour__card {
    position: fixed;
    z-index: 3;
    width: min(360px, calc(100vw - 24px));
    padding: 18px 18px 16px;
    border-radius: 18px;
    background: #fffdfb;
    color: #2a1e14;
    border: 1px solid rgba(31, 22, 15, 0.1);
    box-shadow:
      0 24px 60px rgba(24, 16, 10, 0.34),
      0 2px 6px rgba(24, 16, 10, 0.16);
    animation: tour-pop 0.24s cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  .tour__card.is-mobile {
    width: calc(100vw - 24px);
  }

  .tour__arrow {
    position: absolute;
    width: 14px;
    height: 14px;
    background: #fffdfb;
    border: 1px solid rgba(31, 22, 15, 0.1);
    transform: rotate(45deg);
  }
  .place-bottom .tour__arrow {
    top: -8px;
    margin-left: -7px;
    border-right: 0;
    border-bottom: 0;
  }
  .place-top .tour__arrow {
    bottom: -8px;
    margin-left: -7px;
    border-left: 0;
    border-top: 0;
  }
  .place-right .tour__arrow {
    left: -8px;
    margin-top: -7px;
    border-right: 0;
    border-top: 0;
  }
  .place-left .tour__arrow {
    right: -8px;
    margin-top: -7px;
    border-left: 0;
    border-bottom: 0;
  }

  .tour__close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #9a856f;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }
  .tour__close:hover {
    background: rgba(31, 22, 15, 0.06);
    color: #2a1e14;
  }

  .tour__eyebrow {
    display: block;
    padding-right: 28px;
    color: var(--rst-ui-action, #c2410c);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .tour__title {
    margin: 6px 0 0;
    font-size: 18px;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }
  .tour__body {
    margin: 6px 0 0;
    color: #5f4d3c;
    font-size: 13.5px;
    line-height: 1.5;
  }
  .tour__how {
    margin: 8px 0 0;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(194, 65, 12, 0.08);
    color: #9a3412;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .tour__dots {
    display: flex;
    gap: 6px;
    margin: 14px 0 0;
  }
  .tour__dot {
    width: 7px;
    height: 7px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(31, 22, 15, 0.16);
    cursor: pointer;
    transition:
      width 0.2s ease,
      background 0.2s ease;
  }
  .tour__dot.done {
    background: rgba(194, 65, 12, 0.4);
  }
  .tour__dot.on {
    width: 20px;
    border-radius: 4px;
    background: var(--rst-ui-action, #c2410c);
  }

  .tour__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 14px;
  }
  .tour__skip {
    border: 0;
    background: transparent;
    color: #9a856f;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 2px;
  }
  .tour__skip:hover {
    color: #2a1e14;
    text-decoration: underline;
  }
  .tour__actions {
    display: flex;
    gap: 8px;
  }
  .tour__btn {
    min-height: 36px;
    padding: 8px 16px;
    border-radius: 10px;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .tour__btn.ghost {
    border: 1px solid rgba(31, 22, 15, 0.16);
    background: #fff;
    color: #2a1e14;
  }
  .tour__btn.ghost:hover {
    background: rgba(31, 22, 15, 0.05);
  }
  .tour__btn.primary {
    border: 0;
    background: var(--rst-ui-action, #c2410c);
    color: #fff;
    box-shadow: 0 6px 16px rgba(194, 65, 12, 0.35);
  }
  .tour__btn.primary:hover {
    background: var(--rst-ui-action-2, #9a3412);
  }

  @keyframes tour-pop {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes tour-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes tour-pulse {
    0%,
    100% {
      box-shadow:
        0 0 0 2px var(--tour-ring),
        0 0 18px 2px var(--tour-glow);
    }
    50% {
      box-shadow:
        0 0 0 2px var(--tour-ring),
        0 0 28px 6px var(--tour-glow);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tour__card,
    .tour__guard.is-dim {
      animation: none;
    }
  }
</style>
