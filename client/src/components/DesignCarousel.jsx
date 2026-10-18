import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const VISIBLE = 5;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Compact one-row design picker that shows about five designs at a time.
 * Previous/next move a page at a time; it also scrolls and swipes natively, and snaps to each design.
 */
export default function DesignCarousel({ items, selectedId, onSelect, prevLabel, nextLabel }) {
  const trackRef = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, items.length]);

  // Keep the selected design visible when it changes from elsewhere (e.g. a ?design= link).
  useEffect(() => {
    const el = trackRef.current;
    const node = el?.querySelector('[aria-checked="true"]');
    if (!el || !node) return;
    const left = node.offsetLeft; // the track is `relative`, so this is track-relative
    if (left < el.scrollLeft || left + node.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: left - 4, behavior: 'auto' });
    }
  }, [selectedId, items.length]);

  const page = (dir) =>
    trackRef.current?.scrollBy({
      left: dir * trackRef.current.clientWidth,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });

  const arrow = 'btn-secondary pill size-8 shrink-0 p-0';

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={arrow} onClick={() => page(-1)} disabled={edge.start} aria-label={prevLabel}>
        <ChevronLeft className="size-4" />
      </button>

      <div
        ref={trackRef}
        onScroll={measure}
        role="radiogroup"
        className="relative flex min-w-0 flex-1 snap-x snap-mandatory gap-1 overflow-x-auto scroll-smooth px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((d) => {
          const on = d.id === selectedId;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={d.title}
              title={d.title}
              onClick={() => onSelect(d.id)}
              style={{ flexBasis: `calc((100% - ${(VISIBLE - 1) * 0.25}rem) / ${VISIBLE})` }}
              className={`aspect-[2/3] shrink-0 snap-start overflow-hidden rounded-[40%/30%] ring-2 ring-offset-2 ring-offset-transparent transition ${
                on ? 'ring-rose-500' : 'ring-transparent hover:ring-rose-500/40'
              }`}
            >
              <img src={d.textureUrl} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
            </button>
          );
        })}
      </div>

      <button type="button" className={arrow} onClick={() => page(1)} disabled={edge.end} aria-label={nextLabel}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
