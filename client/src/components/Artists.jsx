import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { AtSign, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { artistsApi } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { ErrorState, Spinner } from './ui';
import { GridBackdrop } from './GridBackdrop';

const AUTOPLAY_MS = 7000;
const SWIPE_PX = 80;

const instagramUrl = (v) => (/^https?:\/\//i.test(v) ? v : `https://instagram.com/${v.replace(/^@/, '')}`);
const instagramHandle = (v) => v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/^@?/, '@').replace(/\/$/, '');

function ArtistSlide({ artist }) {
  const { t } = useI18n();

  return (
    <article className="card grid h-full overflow-hidden rounded-3xl shadow-xl shadow-rose-500/10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-blush-100 to-blush-200 md:aspect-auto md:min-h-[32rem]">
        {artist.image ? (
          <img
            src={artist.image}
            alt={artist.name}
            draggable={false}
            style={{ objectPosition: artist.imagePosition }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-8xl text-rose-500/70" aria-hidden="true">
            {artist.name.charAt(0)}
          </div>
        )}
      </div>

      <div className="flex flex-col justify-center p-6 sm:p-8 md:p-10 lg:p-12">
        <p className="text-xs font-medium tracking-widest text-rose-600 uppercase">{artist.role}</p>
        <h3 className="mt-2 text-3xl font-semibold md:text-4xl">{artist.name}</h3>
        {artist.bio && <p className="mt-4 text-ink-soft md:text-lg">{artist.bio}</p>}

        {artist.specialties?.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-2">
            {artist.specialties.map((s) => (
              <li key={s} className="rounded-sm border border-line bg-blush-50 px-3 py-1 text-xs text-rose-700">
                {s}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to={`/book?artist=${artist.id}`} className="btn-primary px-6 py-3">
            <CalendarCheck className="size-4 shrink-0" />
            {t('artists.bookWith', { name: artist.name })}
          </Link>
          {artist.instagram && (
            <a
              href={instagramUrl(artist.instagram)}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary p-3"
              aria-label={`${artist.name} · ${instagramHandle(artist.instagram)}`}
              title={instagramHandle(artist.instagram)}
            >
              <AtSign className="size-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

const FLIP_SECONDS = 0.9;
const faceStyle = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };

/**
 * A card with two faces. The visible face is the current artist; on Next/Previous the hidden (back) face is
 * loaded with the target artist and the whole card turns 180deg around its vertical axis to reveal it.
 */
export function ArtistCarousel({ artists }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const count = artists.length;
  const [index, setIndex] = useState(0);
  const [faces, setFaces] = useState([0, Math.min(1, count - 1)]); // artist index shown on face 0 / face 1
  const [angle, setAngle] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [paused, setPaused] = useState(false);

  const front = ((Math.round(angle / 180) % 2) + 2) % 2; // which face currently points at the viewer

  const flipTo = useCallback(
    (target, step) => {
      if (flipping || count < 2 || target === index) return;
      setFaces((f) => {
        const next = [...f];
        next[1 - front] = target; // load the hidden face; it is invisible until the card turns
        return next;
      });
      setAngle((a) => a + (step > 0 ? -180 : 180));
      setIndex(target);
      setFlipping(true);
    },
    [flipping, count, index, front],
  );

  const go = useCallback((step) => flipTo((index + step + count) % count, step), [flipTo, index, count]);
  const goTo = (n) => flipTo(n, n > index ? 1 : -1);

  // Auto-rotate; hovering or focusing the carousel pauses it.
  useEffect(() => {
    if (count < 2 || paused || reduce || flipping) return;
    const id = setTimeout(() => go(1), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [index, count, paused, reduce, flipping, go]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={t('artists.title')}
      className="mx-auto max-w-5xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1);
        if (e.key === 'ArrowLeft') go(-1);
      }}
    >
      {/* perspective must sit on the direct parent of the rotating element */}
      <motion.div
        style={{ perspective: 1600 }}
        drag={count > 1 && !flipping ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          if (info.offset.x < -SWIPE_PX) go(1);
          else if (info.offset.x > SWIPE_PX) go(-1);
        }}
      >
        <motion.div
          animate={{ rotateY: angle }}
          transition={{ duration: reduce ? 0 : FLIP_SECONDS, ease: [0.45, 0.05, 0.25, 1] }}
          onAnimationComplete={() => setFlipping(false)}
          style={{ transformStyle: 'preserve-3d' }}
          className="grid"
        >
          {[0, 1].map((face) => {
            const hidden = face !== front;
            return (
              <div
                key={face}
                role="group"
                aria-roledescription="slide"
                aria-label={`${faces[face] + 1} / ${count}`}
                aria-hidden={hidden}
                inert={hidden ? '' : undefined}
                style={{ ...faceStyle, gridArea: '1 / 1', transform: face === 1 ? 'rotateY(180deg)' : undefined }}
              >
                <ArtistSlide artist={artists[faces[face]]} />
              </div>
            );
          })}
        </motion.div>
      </motion.div>

      {count > 1 && (
        <div className="mt-8 flex items-center justify-center gap-5">
          <button onClick={() => go(-1)} disabled={flipping} className="btn-secondary size-11 p-0" aria-label={t('artists.prev')}>
            <ChevronLeft className="size-5" />
          </button>

          <div className="flex items-center gap-2" role="tablist" aria-label={t('artists.title')}>
            {artists.map((a, i) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={i === index}
                aria-label={a.name}
                disabled={flipping}
                onClick={() => goTo(i)}
                className={`h-2 rounded-sm transition-all duration-300 ${i === index ? 'w-8 bg-rose-500' : 'w-2 bg-rose-500/25 hover:bg-rose-500/50'}`}
              />
            ))}
          </div>

          <button onClick={() => go(1)} disabled={flipping} className="btn-secondary size-11 p-0" aria-label={t('artists.next')}>
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
      {count > 1 && (
        <p className="mt-3 text-center text-xs tracking-widest text-ink-soft tabular-nums">
          {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </p>
      )}
    </div>
  );
}

export function ArtistsSection() {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['artists'], queryFn: artistsApi.list });

  return (
    <section className="relative isolate overflow-hidden border-y border-line">
      <GridBackdrop />
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="mb-10 text-center">
          <p className="text-xs font-medium tracking-widest text-rose-600 uppercase">{t('artists.eyebrow')}</p>
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">{t('artists.title')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">{t('artists.subtitle')}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : isError ? (
          <ErrorState message={t('artists.loadError')} onRetry={refetch} />
        ) : !data.items.length ? (
          <p className="py-8 text-center text-ink-soft">{t('artists.empty')}</p>
        ) : (
          <ArtistCarousel artists={data.items} />
        )}
      </div>
    </section>
  );
}
