import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Hand } from 'lucide-react';
import { computeNails, refineNails } from '../tryon/nailGeometry';
import { applyShape } from '../tryon/nailShapeProfile';
import { renderNail } from '../tryon/renderNails';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';

/**
 * Home hero: one hand photo, with the chosen nail art rendered onto its nails by the try-on engine.
 *
 * The hand photo is a cut-out (transparent background) with its hand landmarks detected ahead of time
 * (public/hero/hand.json), so no hand model has to load here. Each design is rendered once, lazily, and the
 * results crossfade while the backdrop shifts to a tint of the design.
 *
 * Designs come from the gallery (any design with a try-on texture). Until the studio has uploaded some,
 * the built-in demo textures in public/hero/swatches are shown.
 */

const HAND_URL = '/hero/hand.webp';
const LIGHT_URL = '/hero/hand-light.webp';
const LANDMARKS_URL = '/hero/hand.json';
const NAIL_SHAPE = 'Oval';
const RENDER_SETTINGS = { opacity: 1, gloss: 0.55, shading: 1 };
const AUTOPLAY_MS = 3800;
const MAX_DESIGNS = 6;

const DEMO_DESIGNS = [
  { id: 'demo-rose-chrome', title: 'Rosé Chrome', category: 'chrome', textureUrl: '/hero/swatches/rose-chrome.webp', color: '#d9779c' },
  { id: 'demo-milk-french', title: 'Milk French', category: 'french', textureUrl: '/hero/swatches/milk-french.webp', color: '#efcfd2' },
  { id: 'demo-midnight-gold', title: 'Midnight Gold', category: 'foil', textureUrl: '/hero/swatches/midnight-gold.webp', color: '#2b3670' },
  { id: 'demo-cloud-marble', title: 'Cloud Marble', category: 'marble', textureUrl: '/hero/swatches/cloud-marble.webp', color: '#cfc7bd' },
  { id: 'demo-cherry-dot', title: 'Cherry Dot', category: 'dots', textureUrl: '/hero/swatches/cherry-dot.webp', color: '#c11a3b' },
  { id: 'demo-lilac-aura', title: 'Lilac Aura', category: 'aura', textureUrl: '/hero/swatches/lilac-aura.webp', color: '#b48fdc' },
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
 * outline aren't darkened by the transparent background when the renderer samples the light under them.
 */
async function loadHand() {
  const [img, lightImg, meta] = await Promise.all([
    loadImage(HAND_URL),
    loadImage(LIGHT_URL).catch(() => null),
    fetch(LANDMARKS_URL).then((r) => r.json()),
  ]);
  const photo = toCanvas(img);
  const ctx = photo.getContext('2d', { willReadFrequently: true });
  const light = lightImg ? toCanvas(lightImg) : photo;
  // hand.json carries nails measured from this exact photo; fall back to estimating them from the landmarks.
  const nails = meta.nails?.length
    ? meta.nails.map((n) => ({ ...n, shape: NAIL_SHAPE }))
    : refineNails(
        computeNails(meta.landmarks, photo.width, photo.height),
        ctx.getImageData(0, 0, photo.width, photo.height),
      ).map((n) => applyShape(n, NAIL_SHAPE));
  return { photo, light, nails };
}

/** Renders one design onto the hand and returns an object URL of the result. */
async function renderDesign(hand, textureUrl) {
  const swatch = await loadImage(textureUrl);
  const out = document.createElement('canvas');
  out.width = hand.photo.width;
  out.height = hand.photo.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(hand.photo, 0, 0);
  for (const nail of hand.nails) renderNail(ctx, hand.light, nail, swatch, RENDER_SETTINGS);
  // Keep the polish inside the finger outline
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(hand.photo, 0, 0);
  const blob = await new Promise((res) => out.toBlob(res, 'image/webp', 0.9));
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
            const result = await renderDesign(hand, d.textureUrl);
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

  // Gentle parallax: the hand drifts up a little as the page scrolls.
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const handY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : -80]);

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

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden transition-[background-color] duration-[900ms] ease-out"
      style={{ backgroundColor: backdrop.base }}
    >
      {/* Soft light behind the hand, tinted by the design */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 transition-[background] duration-[900ms]"
        style={{ background: `radial-gradient(60% 55% at 58% 62%, ${backdrop.glow} 0%, transparent 70%)` }}
      />

      <div className="mx-auto grid max-w-6xl gap-5 px-4 pt-8 md:min-h-[calc(100svh-4rem)] md:grid-cols-12 md:gap-4 md:pt-0">
        {/* Copy */}
        <div className="relative z-20 flex flex-col justify-center md:col-span-5 md:py-16">
          <h1 className="text-4xl leading-[1.05] font-semibold sm:text-6xl lg:text-7xl">
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
        </div>

        {/* Hand (on phones the picker floats over the faded palm) */}
        <div className="relative flex items-end justify-center md:col-span-4">
        <motion.div
          style={{ y: handY }}
          className="relative aspect-[1200/1822] w-full max-w-[300px] md:h-[min(80svh,700px)] md:w-auto md:max-w-none"
        >
          {/* The photo was framed tight on the wrist side, so that edge fades into the backdrop */}
          <div className={`hero-hand-fade absolute inset-0 ${reduceMotion ? '' : 'hero-hand-float'}`}>
            {/* Bare hand underneath, so there's something on screen while the first design renders */}
            <img src={HAND_URL} alt="" className="absolute inset-0 size-full object-contain object-bottom drop-shadow-2xl" />
            {designs.map((d, i) =>
              renders[d.id] ? (
                <img
                  key={d.id}
                  src={renders[d.id].url}
                  alt={i === active ? t('home.hero.handAlt', { name: d.title }) : ''}
                  aria-hidden={i !== active}
                  className="absolute inset-0 size-full object-contain object-bottom transition-opacity duration-700 ease-out"
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
          <div className="absolute inset-x-0 bottom-3 z-10 md:hidden">{picker}</div>
        </div>

        {/* Design picker */}
        <div className="relative z-10 hidden items-center md:col-span-3 md:flex">{picker}</div>
      </div>
    </section>
  );
}
