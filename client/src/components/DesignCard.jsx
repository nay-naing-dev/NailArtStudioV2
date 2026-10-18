import { Link } from 'react-router-dom';
import { Palette } from 'lucide-react';

export default function DesignCard({ design }) {
  return (
    <Link
      to={`/designs/${design.id}`}
      className="group card overflow-hidden rounded-2xl shadow-md transition-all hover:-translate-y-0.5 hover:shadow-xl"
    >
      <div className="relative aspect-square overflow-hidden bg-blush-100">
        {design.imageUrl ? (
          <img
            src={design.imageUrl}
            alt={design.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blush-100 to-blush-200 text-rose-500/70">
            <Palette className="size-14" strokeWidth={1.25} />
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="truncate text-base font-semibold">{design.title}</h3>
        <p className="text-xs capitalize text-ink-soft">{design.category}</p>
      </div>
    </Link>
  );
}
