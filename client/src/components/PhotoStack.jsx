import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { formatPrice } from '../lib/format';

/** Hero collage: three photos cascading over each other, tilted at different angles. */
const HERO_SLOTS = [
  { className: 'left-0 top-[6%] w-[54%]', rotate: -8, z: 1, delay: 0 },
  { className: 'right-0 top-0 w-[54%]', rotate: 7, z: 2, delay: 0.12 },
  { className: 'left-[16%] bottom-0 w-[58%]', rotate: -2.5, z: 3, delay: 0.24 },
];

export function HeroStack({ items }) {
  const reduce = useReducedMotion();

  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-8 rounded-[40%] bg-gradient-to-br from-blush-200 to-rose-500/40 blur-2xl" />
      {HERO_SLOTS.map((slot, i) => {
        const item = items[i];
        return (
          <motion.div
            key={item?.id ?? i}
            initial={reduce ? false : { opacity: 0, y: 40, rotate: slot.rotate * 2 }}
            animate={{ opacity: 1, y: 0, rotate: slot.rotate }}
            transition={{ duration: 0.7, delay: slot.delay, ease: [0.22, 1, 0.36, 1] }}
            whileHover={reduce ? undefined : { rotate: 0, scale: 1.04, zIndex: 10 }}
            style={{ zIndex: slot.z }}
            className={`absolute overflow-hidden rounded-2xl bg-blush-100 shadow-2xl shadow-black/25 ${slot.className}`}
          >
            <div className="aspect-[4/5]">
              {item && <img src={item.originalImage?.url} alt={item.name} className="h-full w-full object-cover" />}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Showcase row: polaroid-style cards fanned out so each one overlaps its neighbour; hover brings one to the front. */
const FAN_TILTS = [-6, 3, -2, 5, -4];
const FAN_LIFTS = [0, 18, -6, 14, 0];

export function DesignFan({ items }) {
  const reduce = useReducedMotion();
  const shown = items.slice(0, FAN_TILTS.length);

  return (
    <div className="-mx-4 overflow-x-auto px-4 py-10 [scrollbar-width:none] md:overflow-visible [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto flex w-max items-start md:w-auto md:justify-center">
        {shown.map((d, i) => (
          <motion.div
            key={d.id}
            initial={reduce ? false : { opacity: 0, y: 60, rotate: FAN_TILTS[i] * 2 }}
            whileInView={{ opacity: 1, y: FAN_LIFTS[i], rotate: FAN_TILTS[i] }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            whileHover={reduce ? undefined : { y: FAN_LIFTS[i] - 24, rotate: 0, scale: 1.06, zIndex: 20 }}
            style={{ zIndex: i + 1 }}
            className="-ml-8 w-44 shrink-0 first:ml-0 sm:w-52 md:-ml-12 lg:w-60"
          >
            <Link
              to={`/designs/${d.id}`}
              className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-blush-100 shadow-xl shadow-black/20 transition-shadow hover:shadow-2xl"
            >
              <img src={d.originalImage?.url} alt={d.name} loading="lazy" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent px-3 pt-8 pb-3 text-[#fff]">
                <span className="truncate text-sm font-semibold">{d.name}</span>
                <span className="shrink-0 text-xs font-medium">{formatPrice(d.price)}</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
