import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  motionValue,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion';
import { ArrowRight, Hand } from 'lucide-react';
import { paintNails } from '../lib/heroPolish';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';

/**
 * Home hero: one hand photo, with the chosen nail art painted onto its nails (see lib/heroPolish.js).
 *
 * The hand photo is a cut-out (transparent background) whose nail plates were fitted by hand and stored in
 * public/hero/hand.json, so no hand model has to load here. Each design is rendered once, lazily, and the
 * results crossfade while the backdrop shifts to a tint of the design.
 *
 * Designs come from the gallery (any design with a try-on texture). Until the studio has uploaded some,
 * the built-in demo textures in public/hero/swatches are shown.
 */

const HAND_URL = '/hero/hand.webp';
const LIGHT_URL = '/hero/hand-light.webp';
const LANDMARKS_URL = '/hero/hand.json';
// Middle of the four finger nails in the photo (from hand.json), where the hero camera zooms to.
const HAND_FOCUS = { x: 0.712, y: 0.176 };
const AUTOPLAY_MS = 3800;
const MAX_DESIGNS = 6;

/*
 * Scroll timeline of the pinned hero (fractions of the section's scroll):
 *   0 → ZOOM_END     copy slides away, the camera moves in on the nails
 *   ZOOM_END → CYCLE_END   held close-up; each step of scrolling paints the next design
 *   CYCLE_END → EXIT_END   the hand lifts out of frame and the row of nail tips rises into place
 *   EXIT_END → 1     the row holds, then the page carries on
 */
const ZOOM_END = 0.2;
const FALLBACK_PROGRESS = motionValue(1); // used when the sequence is off (reduced motion)
const CYCLE_END = 0.64;
const EXIT_END = 0.88;

const DEMO_DESIGNS = [
  { id: 'demo-rose-chrome', title: 'Rosé Chrome', category: 'chrome', textureUrl: '/hero/swatches/rose-chrome.webp', color: '#d9779c', finish: 'chrome' },
  { id: 'demo-milk-french', title: 'Milk French', category: 'french', textureUrl: '/hero/swatches/milk-french.webp', color: '#efcfd2' },
  { id: 'demo-midnight-gold', title: 'Midnight Gold', category: 'foil', textureUrl: '/hero/swatches/midnight-gold.webp', color: '#2b3670' },
  { id: 'demo-cloud-marble', title: 'Cloud Marble', category: 'marble', textureUrl: '/hero/swatches/cloud-marble.webp', color: '#cfc7bd' },
  { id: 'demo-cherry-dot', title: 'Cherry Dot', category: 'dots', textureUrl: '/hero/swatches/cherry-dot.webp', color: '#c11a3b' },
  { id: 'demo-lilac-aura', title: 'Lilac Aura', category: 'aura', textureUrl: '/hero/swatches/lilac-aura.webp', color: '#b48fdc', finish: 'satin' },
];

// ---------- helpers ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Backdrop for a design: a soft tint of its colour (light theme) or a deep, dark tint (dark theme). */
function backdropFor(color, theme) {
  const rgb = hexToRgb(color);
  return theme === 'dark'
    ? { base: rgbToHex(mixRgb(rgb, [11, 13, 10], 0.82)), glow: rgbToHex(mixRgb(rgb, [11, 13, 10], 0.55)) }
    : { base: rgbToHex(mixRgb(rgb, [255, 250, 251], 0.74)), glow: rgbToHex(mixRgb(rgb, [255, 255, 255], 0.45)) };
}

/** Average colour of a texture, for designs that have no dominant colour saved. */
function averageColor(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
  return rgbToHex(sum.map((s) => s / (d.length / 4)));
}

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
  return c;
}

/**
 * Loads the hand once: the cut-out, its lighting source and the nails fitted to it.
 * The lighting source is the same photo with skin colour carried past the hand's edges, so nails near the
 * outline aren't darkened by the transparent background when the renderer reads the light under them.
 */
async function loadHand() {
  const [img, lightImg, meta] = await Promise.all([
    loadImage(HAND_URL),
    loadImage(LIGHT_URL).catch(() => null),
    fetch(LANDMARKS_URL).then((r) => r.json()),
  ]);
  const photo = toCanvas(img);
  const lightCanvas = lightImg ? toCanvas(lightImg) : photo;
  const light = lightCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, photo.width, photo.height);
  return { photo, light, nails: meta.nails, coverage: meta.coverage };
}

function textureData(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** Renders one design onto the hand and returns an object URL of the result. */
async function renderDesign(hand, design) {
  const swatch = await loadImage(design.textureUrl);
  const out = document.createElement('canvas');
  out.width = hand.photo.width;
  out.height = hand.photo.height;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(hand.photo, 0, 0);
  paintNails(ctx, hand.light, hand.nails, textureData(swatch), design.finish, hand.coverage);
  // Keep the polish inside the finger outline
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(hand.photo, 0, 0);
  const blob = await new Promise((res) => out.toBlob(res, 'image/webp', 0.92));
  return { url: URL.createObjectURL(blob), color: averageColor(swatch) };
}

const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 60));

// ---------- component ----------

export default function NailArtHero({ designs: galleryDesigns = [] }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  const designs = useMemo(() => {
    const real = galleryDesigns.filter((d) => d.textureUrl).slice(0, MAX_DESIGNS);
    return real.length ? real.map((d) => ({ ...d, color: d.dominantColor })) : DEMO_DESIGNS;
  }, [galleryDesigns]);

  const [active, setActive] = useState(0);
  const [renders, setRenders] = useState({}); // id -> { url, color }
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const handRef = useRef(null);

  const current = designs[Math.min(active, designs.length - 1)];
  const isDemo = current.id.startsWith('demo-');
  const color = current.color || renders[current.id]?.color || '#e8b4c4';
  const backdrop = backdropFor(color, theme);

  // Render the active design first, then the rest in idle time.
  useEffect(() => {
    let cancelled = false;
    const order = [active, ...designs.map((_, i) => i).filter((i) => i !== active)];
    (async () => {
      try {
        handRef.current ??= loadHand();
        const hand = await handRef.current;
        for (const i of order) {
          const d = designs[i];
          if (cancelled) return;
          if (renders[d.id]) continue;
          await new Promise((r) => idle(r));
          try {
            const result = await renderDesign(hand, d);
            if (cancelled) return URL.revokeObjectURL(result.url);
            setRenders((prev) => ({ ...prev, [d.id]: result }));
          } catch {
            /* a texture that fails to load is just skipped */
          }
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designs]);

  // Free the rendered images when the hero goes away.
  const rendersRef = useRef(renders);
  rendersRef.current = renders;
  useEffect(() => () => Object.values(rendersRef.current).forEach((r) => URL.revokeObjectURL(r.url)), []);

  // Cycle through designs like a lookbook until the visitor picks one.
  useEffect(() => {
    if (paused || reduceMotion || designs.length < 2) return;
    const id = setInterval(() => setActive((a) => (a + 1) % designs.length), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, reduceMotion, designs.length]);

  const pick = (i) => {
    setPaused(true);
    setActive(i);
  };

  // Arrow keys move through the designs, as in any radio group.
  const onKeyDown = (e) => {
    let next;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (active + 1) % designs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (active - 1 + designs.length) % designs.length;
    else return;
    e.preventDefault();
    pick(next);
    e.currentTarget.children[next]?.focus();
  };

  // ----- scroll-driven sequence -----
  const pinned = !reduceMotion;
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const handColRef = useRef(null);
  const handElRef = useRef(null);
  const { scrollYProgress: p } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });

  // Scrolling takes over from autoplay, and the close-up steps through the designs.
  useMotionValueEvent(p, 'change', (v) => {
    if (!pinned) return;
    if (v > 0.01) setPaused(true);
    if (v >= ZOOM_END && v < CYCLE_END) {
      const i = Math.min(designs.length - 1, Math.floor(((v - ZOOM_END) / (CYCLE_END - ZOOM_END)) * designs.length));
      setActive((a) => (a === i ? a : i));
    }
  });

  const copyOpacity = useTransform(p, [0, ZOOM_END * 0.8], [1, 0]);
  const copyX = useTransform(p, [0, ZOOM_END], [0, -80]);
  const hintOpacity = useTransform(p, [0, 0.04], [1, 0]);

  // The camera: zoom towards the nails (they sit in the top fifth of the photo), drift a little while held,
  // then the hand lifts away.
  const handScale = useTransform(p, [0, ZOOM_END, CYCLE_END, CYCLE_END + 0.14], [1, 1.75, 1.9, 1.5]);
  const cam = useNailCamera(stageRef, handColRef, handElRef);
  const handY = useTransform(p, [0, ZOOM_END, CYCLE_END, CYCLE_END + 0.14], [0, cam.dy, cam.dy - 12, cam.dy - cam.stageH * 1.2]);
  const handX = useTransform(p, [0, ZOOM_END, CYCLE_END], [0, cam.dx, cam.dx + 10]);
  const handRotate = useTransform(p, [0, ZOOM_END, CYCLE_END, EXIT_END], [0, -3, 2, 6]);
  const handOpacity = useTransform(p, [CYCLE_END + 0.04, CYCLE_END + 0.12], [1, 0]);
  // Motion blur that follows scroll speed, like a fast camera move.
  const speed = useSpring(useTransform(useVelocity(p), (v) => Math.min(6, Math.abs(v) * 5)), { stiffness: 300, damping: 40 });
  const handFilter = useMotionTemplate`blur(${speed}px)`;

  const pickerOpacity = useTransform(p, [CYCLE_END, CYCLE_END + 0.06], [1, 0]);
  const stripOpacity = useTransform(p, [CYCLE_END + 0.09, CYCLE_END + 0.15], [0, 1]);
  const stripTitleY = useTransform(p, [CYCLE_END + 0.08, EXIT_END], ['30vh', '0vh']);
  const stripEvents = useTransform(stripOpacity, (o) => (o > 0.6 ? 'auto' : 'none'));
  const stepCounter = `${String(active + 1).padStart(2, '0')} / ${String(designs.length).padStart(2, '0')}`;

  const tryOnTo = isDemo ? '/try-on' : `/try-on?design=${current.id}`;
  const bookTo = isDemo ? '/book' : `/book?design=${current.id}`;

  // Rendered in two places (over the hand on phones, beside it on wider screens); only one is ever displayed.
  const picker = (
    <div
      className="w-full rounded-nail border border-white/50 bg-white/60 p-4 shadow-xl shadow-black/5 backdrop-blur-xl md:p-5"
      onMouseEnter={() => setPaused(true)}
    >
      <p className="text-[11px] font-medium tracking-[0.18em] text-ink-soft uppercase">{t('home.hero.nowShowing')}</p>
      <div className="flex items-baseline justify-between gap-3 md:block">
        <h2 key={current.id} className="hero-name-in mt-1 text-2xl font-semibold italic md:text-3xl">
          {current.title}
        </h2>
        {current.category && <p className="text-sm text-ink-soft capitalize md:mt-0.5">{current.category}</p>}
      </div>

      <div
        role="radiogroup"
        aria-label={t('home.hero.pick')}
        onKeyDown={onKeyDown}
        className="mt-4 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${designs.length}, minmax(0, 3.25rem))` }}
      >
        {designs.map((d, i) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={i === active}
            aria-label={d.title}
            tabIndex={i === active ? 0 : -1}
            onClick={() => pick(i)}
            className={`aspect-[2/3] w-full rounded-t-full rounded-b-md bg-cover bg-center transition duration-300 hover:-translate-y-0.5 ${
              i === active ? 'ring-2 ring-ink ring-offset-2 ring-offset-transparent' : 'ring-1 ring-black/10'
            }`}
            style={{ backgroundImage: `url(${d.textureUrl})` }}
          />
        ))}
      </div>

      <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-black/10">
        {!paused && !reduceMotion && (
          <div key={active} className="hero-progress h-full bg-ink/60" style={{ animationDuration: `${AUTOPLAY_MS}ms` }} />
        )}
      </div>

      <Link to={tryOnTo} className="mt-3 hidden items-center gap-1.5 text-sm font-medium text-rose-600 hover:underline md:inline-flex">
        {t('home.hero.tryThis')} <ArrowRight className="size-4" />
      </Link>
    </div>
  );

  const handStyle = pinned
    ? { scale: handScale, x: handX, y: handY, rotate: handRotate, opacity: handOpacity, filter: handFilter, transformOrigin: `${HAND_FOCUS.x * 100}% ${HAND_FOCUS.y * 100}%` }
    : undefined;

  return (
    <section
      ref={sectionRef}
      className={`relative isolate transition-[background-color] duration-[900ms] ease-out ${pinned ? 'h-[360svh]' : ''}`}
      style={{ backgroundColor: backdrop.base }}
    >
      <div ref={stageRef} className={pinned ? 'sticky top-16 h-[calc(100svh-4rem)] overflow-hidden' : 'relative overflow-hidden'}>
        {/* Soft light behind the hand, tinted by the design */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 transition-[background] duration-[900ms]"
          style={{ background: `radial-gradient(60% 55% at 55% 55%, ${backdrop.glow} 0%, transparent 70%)` }}
        />

        <div className="mx-auto grid h-full max-w-6xl gap-5 px-4 pt-8 md:grid-cols-12 md:gap-4 md:pt-0">
          {/* Copy */}
          <motion.div
            style={pinned ? { opacity: copyOpacity, x: copyX } : undefined}
            className="relative z-20 flex flex-col justify-center md:col-span-4 md:py-16"
          >
            <h1 className="text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl">
              {t('home.titleBefore')} <em className="text-rose-500">{t('home.titleEm')}</em> {t('home.titleAfter')}
            </h1>
            <p className="mt-5 hidden max-w-md text-base text-ink-soft sm:block md:text-lg">{t('home.subtitle')}</p>
            <div className="mt-6 flex gap-3 sm:mt-8">
              <Link to={bookTo} className="btn-primary flex-1 px-3 py-3 whitespace-nowrap sm:flex-none sm:px-10 sm:py-4 sm:text-base sm:tracking-wide">
                {t('home.hero.book')} <ArrowRight className="size-5" />
              </Link>
              <Link to={tryOnTo} className="btn-secondary flex-1 px-3 py-3 whitespace-nowrap sm:flex-none sm:px-10 sm:py-4 sm:text-base sm:tracking-wide">
                <Hand className="hidden size-5 sm:block" /> {t('home.hero.tryYours')}
              </Link>
            </div>
          </motion.div>

          {/* Hand (on phones the picker floats over the faded palm) */}
          <div ref={handColRef} className="relative flex items-end justify-center md:col-span-5">
            <motion.div
              ref={handElRef}
              style={handStyle}
              className="relative aspect-square w-full max-w-[340px] will-change-transform md:h-[min(70svh,600px)] md:w-auto md:max-w-none"
            >
              <div className={`absolute inset-0 ${reduceMotion ? '' : 'hero-hand-float'}`}>
                {/* Bare hand underneath, so there's something on screen while the first design renders */}
                <img src={HAND_URL} alt="" className="absolute inset-0 size-full object-contain object-bottom drop-shadow-2xl" />
                {designs.map((d, i) =>
                  renders[d.id] ? (
                    <img
                      key={d.id}
                      src={renders[d.id].url}
                      alt={i === active ? t('home.hero.handAlt', { name: d.title }) : ''}
                      aria-hidden={i !== active}
                      className="absolute inset-0 size-full object-contain object-bottom transition-opacity duration-500 ease-out"
                      style={{ opacity: i === active ? 1 : 0 }}
                    />
                  ) : null,
                )}
              </div>
              {!renders[current.id] && !failed && (
                <span className="absolute top-1/3 left-1/2 -translate-x-1/2 rounded-full bg-white/70 px-3 py-1 text-xs text-ink-soft backdrop-blur">
                  {t('home.hero.painting')}
                </span>
              )}
            </motion.div>
            <motion.div style={pinned ? { opacity: pickerOpacity } : undefined} className="absolute inset-x-0 bottom-3 z-10 md:hidden">
              {picker}
            </motion.div>
          </div>

          {/* Design picker */}
          <motion.div
            style={pinned ? { opacity: pickerOpacity } : undefined}
            className="relative z-10 hidden items-center md:col-span-3 md:flex"
          >
            <div className="w-full">
              {pinned && <p className="mb-2 text-right text-xs tracking-[0.2em] text-ink-soft tabular-nums">{stepCounter}</p>}
              {picker}
            </div>
          </motion.div>
        </div>

        {/* Scroll hint */}
        {pinned && (
          <motion.div
            style={{ opacity: hintOpacity }}
            className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-xs tracking-[0.2em] text-ink-soft uppercase md:flex"
          >
            {t('home.hero.scrollHint')}
            <span className="hero-scroll-line h-8 w-px bg-ink/40" />
          </motion.div>
        )}

        {/* The row of nail tips that rises in as the hand leaves */}
        <motion.div
          style={pinned ? { opacity: stripOpacity, pointerEvents: stripEvents } : undefined}
          className={pinned ? 'absolute inset-0 z-30 flex flex-col items-center justify-center px-4' : 'relative flex flex-col items-center px-4 py-16'}
        >
          <motion.h2
            style={pinned ? { y: stripTitleY } : undefined}
            className="text-center text-4xl font-semibold sm:text-5xl md:text-6xl"
          >
            {t('home.hero.stripTitle', { count: designs.length })}
          </motion.h2>
          <motion.p style={pinned ? { y: stripTitleY } : undefined} className="mt-3 text-center text-ink-soft">
            {t('home.hero.stripSubtitle')}
          </motion.p>
          <div className="mt-10 flex w-full max-w-5xl items-end justify-center gap-3 sm:gap-6 md:mt-14 md:gap-10">
            {designs.map((d, i) => (
              <NailTip
                key={d.id}
                design={d}
                index={i}
                count={designs.length}
                progress={pinned ? p : null}
                active={i === active}
                onSelect={() => pick(i)}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** One glossy press-on tip in the row: rises in on its own beat, links to the design. */
function NailTip({ design, index, count, progress, active, onSelect }) {
  const start = CYCLE_END + 0.08 + (index / count) * 0.06;
  const y = useTransform(progress ?? FALLBACK_PROGRESS, [start, start + 0.12], ['70vh', '0vh']);
  const rotate = useTransform(progress ?? FALLBACK_PROGRESS, [start, start + 0.12], [index % 2 ? 8 : -8, 0]);
  const to = design.id.startsWith('demo-') ? '/designs' : `/designs/${design.id}`;
  return (
    <motion.div style={progress ? { y, rotate } : undefined} className="flex min-w-0 flex-1 flex-col items-center sm:flex-none">
      <Link
        to={to}
        onMouseEnter={onSelect}
        onFocus={onSelect}
        className="group flex flex-col items-center gap-3 focus-visible:outline-none"
      >
        <span
          className={`hero-tip relative block aspect-[5/8] w-full max-w-[110px] bg-cover bg-center shadow-xl shadow-black/15 transition duration-300 group-hover:-translate-y-2 sm:w-20 md:w-28 ${
            active ? 'ring-2 ring-ink/70 ring-offset-4 ring-offset-transparent' : ''
          }`}
          style={{ backgroundImage: `url(${design.textureUrl})` }}
        />
        <span className="text-center">
          <span className="block text-sm font-medium sm:text-base">{design.title}</span>
          {design.category && <span className="hidden text-xs text-ink-soft capitalize sm:block">{design.category}</span>}
        </span>
      </Link>
    </motion.div>
  );
}

/**
 * Where the camera has to move so the nails end up in the middle of the stage, measured from the layout
 * (so it works at any screen size). Scaling happens around the nails (transform-origin), so only this
 * offset is needed.
 */
function useNailCamera(stageRef, colRef, handRef) {
  const [cam, setCam] = useState({ dx: 0, dy: 0, stageH: 800 });
  useEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      const col = colRef.current;
      const hand = handRef.current;
      if (!stage || !col || !hand) return;
      const fx = col.offsetLeft + hand.offsetLeft + HAND_FOCUS.x * hand.offsetWidth;
      const fy = col.offsetTop + hand.offsetTop + HAND_FOCUS.y * hand.offsetHeight;
      setCam({ dx: stage.clientWidth / 2 - fx, dy: stage.clientHeight * 0.46 - fy, stageH: stage.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (stageRef.current) ro.observe(stageRef.current);
    if (handRef.current) ro.observe(handRef.current);
    return () => ro.disconnect();
  }, [stageRef, colRef, handRef]);
  return cam;
}
