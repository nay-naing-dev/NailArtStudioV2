import { Link } from 'react-router-dom';
import { Footprints } from 'lucide-react';
import { formatPrice } from '../lib/format';

export default function DesignCard({ design }) {
  return (
    <Link
      to={`/designs/${design.id}`}
      className="group card overflow-hidden rounded-2xl shadow-md transition-all hover:-translate-y-0.5 hover:shadow-xl"
    >
      <div className="relative aspect-square overflow-hidden bg-blush-100">
        {design.originalImage?.url ? (
          <img
            src={design.originalImage.url}
            alt={design.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blush-100 to-blush-200 text-rose-500/70">
            <Footprints className="size-14" strokeWidth={1.25} />
          </div>
        )}
        {design.swatchImage && (
          <img
            src={design.swatchImage.url}
            alt=""
            className="absolute bottom-3 right-3 h-14 w-10 rounded-none object-cover shadow-md ring-2 ring-white"
          />
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{design.name}</h3>
          <p className="text-xs capitalize text-ink-soft">{design.category}</p>
        </div>
        <span className="shrink-0 text-sm font-medium text-rose-600">{formatPrice(design.price)}</span>
      </div>
    </Link>
  );
}
