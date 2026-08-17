/* Creamy Dijon Chicken Spaghetti — vertical recipe promo.
   Renders window.PromoVideo. Loads after animations-v3.jsx + tweaks-panel.jsx. */
const { CompositionStage, useComposition, Shot, Easing, animate, clamp } = window;
const { useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakColor } = window;

const W = 1080, H = 1920;
const INK = '#0b0906', CREAM = '#f6efe3';

const U = 'uploads/';
const IMG = {
  sauce: U + '20260817_202203.webp',
  pasta: U + '20260817_202210.webp',
  dijon: U + '20260817_202225.webp',
  combine: U + '20260817_202634.webp',
  toss1: U + '20260817_202734.webp',
  toss2: U + '20260817_202737.webp',
  plate: U + '20260817_203311.webp',
  cheese: [
    U + '20260817_203327.webp',
    U + '20260817_203327(0).webp',
    U + '20260817_203328.webp',
    U + '20260817_203329.webp',
    U + '20260817_203330.webp',
    U + '20260817_203331.webp'
  ]
};

/* --- the only three motion helpers --- */
const MOTION = {
  enter: (start, dur = 0.55) => animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeOutCubic }),
  drift: (start, end, from, to, ease) => animate({ from, to, start, end, ease: ease || Easing.linear }),
  pop: (start, dur = 0.5) => animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeOutBack })
};

/* ---------- primitives ---------- */

function Photo({ src, from, to, z0 = 1.06, z1 = 1.22, ox = 0, oy = 0, rot = 0, cover = true, style }) {
  const { T } = useComposition();
  const z = MOTION.drift(from, to, z0, z1)(T);
  const fade = MOTION.enter(from, 0.45)(T);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: fade, ...style }}>
      <img src={src} alt="" style={{
        position: 'absolute', left: '50%', top: '50%',
        width: cover ? H * 1.02 : '100%', height: cover ? H * 1.02 : '100%',
        objectFit: 'cover',
        transform: `translate(-50%,-50%) translate(${ox}px,${oy}px) rotate(${rot}deg) scale(${z})`,
        filter: 'saturate(1.06) contrast(1.05)'
      }} />
    </div>
  );
}

function Card({ src, from, to, top, size = 900, rot = 0, z0 = 1.04, z1 = 1.16 }) {
  const { T } = useComposition();
  const e = MOTION.enter(from, 0.6)(T);
  const out = 0;
  const z = MOTION.drift(from, to, z0, z1)(T);
  return (
    <div style={{
      position: 'absolute', left: (W - size) / 2, top: top, width: size, height: size,
      overflow: 'hidden', opacity: e * (1 - out),
      transform: `translateY(${(1 - e) * 70 - out * 40}px) rotate(${rot}deg)`,
      boxShadow: '0 40px 90px rgba(0,0,0,0.55)'
    }}>
      <img src={src} alt="" style={{
        position: 'absolute', left: '50%', top: '50%', width: '100%', height: '100%',
        objectFit: 'cover', transform: `translate(-50%,-50%) scale(${z})`,
        filter: 'saturate(1.06) contrast(1.05)'
      }} />
    </div>
  );
}

function Scrim({ from = 0.35, to = 0.92 }) {
  return <div style={{
    position: 'absolute', inset: 0,
    background: `linear-gradient(180deg, rgba(11,9,6,${from}) 0%, rgba(11,9,6,0.05) 38%, rgba(11,9,6,0.12) 55%, rgba(11,9,6,${to}) 100%)`
  }} />;
}

/* big display line that wipes up into place */
function Line({ text, at, size, top, accent, weight, align = 'center', letter = '-0.02em', hold = 99 }) {
  const { T } = useComposition();
  const e = MOTION.enter(at, 0.6)(T);
  const out = MOTION.enter(at + hold, 0.35)(T);
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top, textAlign: align,
      padding: '0 70px', opacity: e * (1 - out), overflow: 'hidden'
    }}>
      <div style={{
        fontFamily: "'Anton', sans-serif", fontSize: size, lineHeight: 0.92,
        letterSpacing: letter, color: accent || CREAM, textTransform: 'uppercase',
        transform: `translateY(${(1 - e) * size * 0.9}px)`,
        textShadow: '0 8px 40px rgba(0,0,0,0.55)', textWrap: 'balance'
      }}>{text}</div>
    </div>
  );
}

function Tag({ text, at, top, left, accent, hold = 99 }) {
  const { T } = useComposition();
  const p = MOTION.pop(at, 0.55)(T);
  const out = MOTION.enter(at + hold, 0.3)(T);
  return (
    <div style={{
      position: 'absolute', top, left, opacity: clamp(p, 0, 1) * (1 - out),
      transform: `scale(${0.86 + 0.14 * clamp(p, 0, 1)})`, transformOrigin: 'left center',
      background: accent, color: INK, padding: '14px 26px 12px',
      fontFamily: "'DM Mono', monospace", fontSize: 34, letterSpacing: '0.18em',
      textTransform: 'uppercase', fontWeight: 500
    }}>{text}</div>
  );
}

/* monospace ingredient rows ticking in */
function Rows({ items, at, top, gap = 62, accent }) {
  const { T } = useComposition();
  return (
    <div style={{ position: 'absolute', left: 110, top, right: 110 }}>
      {items.map((it, i) => {
        const e = MOTION.enter(at + i * 0.22, 0.5)(T);
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'baseline', gap: 22, height: gap,
            opacity: e, transform: `translateX(${(1 - e) * -40}px)`,
            fontFamily: "'DM Mono', monospace", fontSize: 42, color: CREAM, letterSpacing: '0.02em'
          }}>
            <span style={{ color: accent, fontSize: 30 }}>{String(i + 1).padStart(2, '0')}</span>
            <span>{it}</span>
          </div>
        );
      })}
    </div>
  );
}

/* diagonal light sweep fired at a cue */
function Sweep({ at, accent }) {
  const { T } = useComposition();
  const p = MOTION.drift(at, at + 0.55, -1.2, 1.4, Easing.easeInOutQuart)(T);
  const on = T > at - 0.05 && T < at + 0.7 ? 1 : 0;
  return (
    <div style={{
      position: 'absolute', inset: -200, opacity: on * 0.55, pointerEvents: 'none',
      background: `linear-gradient(105deg, transparent 42%, ${accent}44 48%, ${CREAM}cc 50%, ${accent}44 52%, transparent 58%)`,
      transform: `translateX(${p * W * 1.5}px)`, mixBlendMode: 'screen'
    }} />
  );
}

function Grain() {
  const { T } = useComposition();
  const step = Math.floor(T * 12) % 4;
  return (
    <div style={{
      position: 'absolute', inset: -60, pointerEvents: 'none', opacity: 0.22,
      mixBlendMode: 'overlay',
      backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/></filter><rect width='180' height='180' filter='url(%23n)' opacity='0.55'/></svg>\")",
      transform: `translate(${step * 17}px, ${step * 29}px)`
    }} />
  );
}

function Vignette() {
  return <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(120% 80% at 50% 45%, transparent 45%, rgba(0,0,0,0.55) 100%)'
  }} />;
}

/* progress hairline across the whole piece */
function Progress({ accent }) {
  const { T, authoredTotal } = useComposition();
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, background: 'rgba(246,239,227,0.14)' }}>
      <div style={{ height: '100%', width: `${clamp(T / authoredTotal, 0, 1) * 100}%`, background: accent }} />
    </div>
  );
}

/* ---------- music: synthesized loop, in-preview only ---------- */
function useMusic(enabled) {
  const { playing } = useComposition();
  const ref = React.useRef({ ctx: null, timer: null, step: 0, next: 0 });
  const [blocked, setBlocked] = React.useState(false);

  const start = React.useCallback(() => {
    const S = ref.current;
    if (!S.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      S.ctx = new AC();
      S.master = S.ctx.createGain();
      S.master.gain.value = 0.5;
      S.master.connect(S.ctx.destination);
    }
    if (S.ctx.state === 'suspended') S.ctx.resume().then(() => setBlocked(S.ctx.state !== 'running'));
    setBlocked(S.ctx.state === 'suspended');
    if (S.timer) return;
    S.step = 0; S.next = S.ctx.currentTime + 0.08;
    const spb = 60 / 96 / 4; // 16th at 96bpm
    const bass = [55, 0, 82.4, 0, 55, 0, 73.4, 0, 49, 0, 73.4, 0, 65.4, 0, 61.7, 0];
    const chord = [[220, 261.6, 329.6], [196, 246.9, 329.6], [174.6, 220, 293.7], [164.8, 207.6, 261.6]];
    const tone = (t, f, dur, type, g, glide) => {
      const o = S.ctx.createOscillator(), gn = S.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(g, t + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn); gn.connect(S.master); o.start(t); o.stop(t + dur + 0.05);
    };
    const noise = (t, dur, g, hp) => {
      const n = S.ctx.createBufferSource();
      const buf = S.ctx.createBuffer(1, 4096, S.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      n.buffer = buf; n.loop = true;
      const f = S.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
      const gn = S.ctx.createGain();
      gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f); f.connect(gn); gn.connect(S.master); n.start(t); n.stop(t + dur + 0.02);
    };
    S.timer = setInterval(() => {
      const now = S.ctx.currentTime;
      while (S.next < now + 0.25) {
        const s = S.step % 64, t = S.next;
        if (s % 8 === 0) tone(t, 90, 0.22, 'sine', 0.9, 45);          // kick
        if (s % 8 === 4) noise(t, 0.14, 0.16, 1600);                   // clap
        if (s % 2 === 0) noise(t, 0.045, s % 4 === 0 ? 0.05 : 0.03, 7000); // hats
        const b = bass[s % 16];
        if (b) tone(t, b, 0.3, 'triangle', 0.34);
        if (s % 16 === 0) chord[(s / 16) % 4].forEach((f, i) => tone(t, f, 1.5, 'sawtooth', 0.045 - i * 0.008));
        S.step++; S.next += spb;
      }
    }, 30);
  }, []);

  const stop = React.useCallback(() => {
    const S = ref.current;
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    if (S.ctx) S.ctx.suspend();
  }, []);

  React.useEffect(() => {
    if (enabled && playing) start(); else stop();
    return stop;
  }, [enabled, playing, start, stop]);

  return { blocked, unlock: start };
}

/* ---------- the piece ---------- */
function Piece({ accent, grain, captions }) {
  const { CUES, T } = useComposition();
  const C = CUES;
  return (
    <div style={{ position: 'absolute', inset: 0, background: INK, overflow: 'hidden' }}>

      {/* 1 — OPEN */}
      <Shot from={0} to={C.Sauce}>
        <Photo src={IMG.sauce} from={0} to={C.Sauce} z0={1.34} z1={1.1} oy={-40} />
        <Scrim from={0.55} to={0.95} />
        <Line text="Creamy" at={0.15} size={210} top={520} />
        <Line text="Dijon" at={0.33} size={210} top={720} accent={accent} />
        <Line text="Chicken Pasta" at={0.5} size={126} top={930} />
        {captions && <Line text="one pan · twenty minutes" at={1.0} size={44} top={1130} letter="0.18em" />}
      </Shot>

      {/* 2 — SAUCE */}
      <Shot from={C.Sauce} to={C.Dijon}>
        <Card src={IMG.sauce} from={C.Sauce} to={C.Dijon} top={210} size={900} z0={1.02} z1={1.14} />
        <Tag text="step one" at={C.Sauce + 0.2} top={120} left={90} accent={accent} />
        <Line text="Sear, then cream" at={C.Sauce + 0.35} size={104} top={1180} align="left" />
        {captions && <Rows items={['chicken thigh, cubed', 'a splash of white wine', '200ml single cream']} at={C.Sauce + 0.8} top={1350} accent={accent} />}
      </Shot>

      {/* 3 — DIJON */}
      <Shot from={C.Dijon} to={C.Pasta}>
        <Photo src={IMG.dijon} from={C.Dijon} to={C.Pasta} z0={1.1} z1={1.4} oy={30} />
        <Scrim from={0.6} to={0.9} />
        <Line text="One heaped spoon" at={C.Dijon + 0.25} size={92} top={330} />
        <Line text="Dijon" at={C.Dijon + 0.5} size={300} top={1180} accent={accent} />
      </Shot>

      {/* 4 — PASTA */}
      <Shot from={C.Pasta} to={C.Toss}>
        <Card src={IMG.pasta} from={C.Pasta} to={C.Toss} top={430} size={960} rot={-2} z0={1.14} z1={1.02} />
        <Tag text="step two" at={C.Pasta + 0.15} top={230} left={90} accent={accent} />
        <Line text="Spaghetti, al dente" at={C.Pasta + 0.4} size={96} top={1500} />
        {captions && <Line text="keep a mug of the water" at={C.Pasta + 0.9} size={40} top={1650} letter="0.16em" />}
      </Shot>

      {/* 5 — TOSS (rapid cuts) */}
      <Shot from={C.Toss} to={C.Plate}>
        <Photo src={IMG.combine} from={C.Toss} to={C.Toss + 1.05} z0={1.16} z1={1.3} />
        <Photo src={IMG.toss1} from={C.Toss + 1.0} to={C.Toss + 2.0} z0={1.3} z1={1.14} />
        <Photo src={IMG.toss2} from={C.Toss + 1.95} to={C.Plate} z0={1.1} z1={1.28} />
        <Scrim from={0.5} to={0.85} />
        <Line text="Toss" at={C.Toss + 0.15} size={230} top={230} align="left" hold={0.6} />
        <Line text="Toss" at={C.Toss + 1.05} size={230} top={330} accent={accent} align="center" hold={0.55} />
        <Line text="Toss" at={C.Toss + 1.95} size={230} top={430} align="right" hold={9} />
        {captions && <Line text="sauce clings to every strand" at={C.Toss + 2.2} size={42} top={1620} letter="0.14em" />}
      </Shot>

      {/* 6 — PLATE */}
      <Shot from={C.Plate} to={C.Cheese}>
        <Photo src={IMG.plate} from={C.Plate} to={C.Cheese} z0={1.12} z1={1.34} oy={-20} />
        <Scrim from={0.35} to={0.9} />
        <Tag text="step three" at={C.Plate + 0.2} top={170} left={90} accent={accent} />
        <Line text="Into the bowl" at={C.Plate + 0.4} size={110} top={1420} />
      </Shot>

      {/* 7 — CHEESE (stop motion) */}
      <Shot from={C.Cheese} to={C.Outro}>
        <CheeseStack from={C.Cheese} to={C.Outro} />
        <Scrim from={0.45} to={0.9} />
        <Line text="Parmesan" at={C.Cheese + 0.15} size={168} top={220} accent={accent} />
        {captions && <Line text="more than you think" at={C.Cheese + 0.8} size={44} top={430} letter="0.16em" />}
      </Shot>

      {/* 8 — OUTRO */}
      <Shot from={C.Outro} to={99}>
        <Photo src={IMG.cheese[5]} from={C.Outro} to={C.Outro + 6} z0={1.18} z1={1.02} />
        <Scrim from={0.72} to={0.95} />
        <Line text="Creamy Dijon" at={C.Outro + 0.2} size={132} top={480} />
        <Line text="Chicken Spaghetti" at={C.Outro + 0.35} size={132} top={640} accent={accent} />
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 900, textAlign: 'center',
          fontFamily: "'DM Mono', monospace", fontSize: 44, letterSpacing: '0.22em',
          color: CREAM, textTransform: 'uppercase',
          opacity: MOTION.enter(C.Outro + 0.7, 0.6)(T)
        }}>20 min · serves 2</div>
        <div style={{
          position: 'absolute', left: '50%', top: 1560, transform: `translateX(-50%) scale(${0.9 + 0.1 * clamp(MOTION.pop(C.Outro + 1.1, 0.6)(T), 0, 1)})`,
          opacity: clamp(MOTION.pop(C.Outro + 1.1, 0.6)(T), 0, 1),
          border: `3px solid ${accent}`, color: accent, padding: '20px 44px 16px',
          fontFamily: "'DM Mono', monospace", fontSize: 40, letterSpacing: '0.2em', textTransform: 'uppercase'
        }}>save this one</div>
      </Shot>

      {/* continuous layers */}
      <Sweep at={C.Dijon} accent={accent} />
      <Sweep at={C.Toss} accent={accent} />
      <Sweep at={C.Cheese} accent={accent} />
      <Vignette />
      <FadeSeam />
      {grain && <Grain />}
      <Progress accent={accent} />
    </div>
  );
}

/* black at both ends so the loop seam matches */
function FadeSeam() {
  const { T, authoredTotal } = useComposition();
  const o = clamp(Math.max(1 - T / 0.35, (T - (authoredTotal - 0.45)) / 0.45), 0, 1);
  return <div style={{ position: 'absolute', inset: 0, background: INK, opacity: o, pointerEvents: 'none' }} />;
}

function CheeseStack({ from, to }) {
  const { T } = useComposition();
  const span = to - from;
  const n = IMG.cheese.length;
  const idx = clamp(Math.floor(((T - from) / span) * (n + 1.2)), 0, n - 1);
  const z = MOTION.drift(from, to, 1.06, 1.24)(T);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {IMG.cheese.map((src, i) => (
        <img key={i} src={src} alt="" style={{
          position: 'absolute', left: '50%', top: '50%', width: H * 1.02, height: H * 1.02,
          objectFit: 'cover', opacity: i === idx ? 1 : 0,
          transform: `translate(-50%,-50%) scale(${z})`, filter: 'saturate(1.08) contrast(1.05)'
        }} />
      ))}
    </div>
  );
}

function MusicButton({ accent, onClick, muted }) {
  return (
    <button onClick={onClick} style={{
      position: 'absolute', right: 36, top: 36, zIndex: 20, cursor: 'pointer',
      background: muted ? 'rgba(11,9,6,0.72)' : accent, color: muted ? CREAM : INK,
      border: `2px solid ${accent}`, borderRadius: 999, padding: '16px 26px',
      fontFamily: "'DM Mono', monospace", fontSize: 24, letterSpacing: '0.12em', textTransform: 'uppercase'
    }}>{muted ? '♪ tap for sound' : '♪ sound on'}</button>
  );
}

function Inner({ accent, grain, captions, music }) {
  const { blocked, unlock } = useMusic(music);
  return (
    <React.Fragment>
      <Piece accent={accent} grain={grain} captions={captions} />
      {music && blocked && <MusicButton accent={accent} muted onClick={unlock} />}
    </React.Fragment>
  );
}

function PromoVideo() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS || {});
  const accent = t.accent || '#e0a03c';
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#08070a' }}>
      <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={INK}>
        <Inner accent={accent} grain={t.grain !== false} captions={t.captions !== false} music={t.music !== false} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Look" />
        <TweakColor label="Accent" value={accent} options={['#e0a03c', '#d97757', '#8fae6b', '#e7e2d6']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakToggle label="Film grain" value={t.grain !== false} onChange={(v) => setTweak('grain', v)} />
        <TweakSection label="Content" />
        <TweakToggle label="Recipe captions" value={t.captions !== false} onChange={(v) => setTweak('captions', v)} />
        <TweakToggle label="Music" value={t.music !== false} onChange={(v) => setTweak('music', v)} />
        <TweakSection label="Editing" />
        <TweakToggle label="Motion editor" value={t.motionEditor !== false} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </div>
  );
}

window.PromoVideo = PromoVideo;
