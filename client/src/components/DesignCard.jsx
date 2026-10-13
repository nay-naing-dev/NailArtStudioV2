import { Link } from 'react-router-dom';
import { formatPrice } from '../lib/format';

export default function DesignCard({ design }) {
  return (
    <Link
      to={`/designs/${design.id}`}
      className="group card overflow-hidden rounded-2xl shadow-md transition-all hover:-translate-y-0.5 hover:shadow-xl"
    >
      <div className="relative aspect-square overflow-hidden bg-blush-100">
        <img
          src={design.originalImage?.url}
          alt={design.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        {design.swatchImage && (
          <img
            src={design.swatchImage.url}
            alt=""
            className="absolute bottom-3 right-3 h-14 w-10 rounded-[40%/30%] object-cover shadow-md ring-2 ring-white"
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
