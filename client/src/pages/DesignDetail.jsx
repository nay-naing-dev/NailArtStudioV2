import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, Clock, Footprints, Hand } from 'lucide-react';
import { designsApi } from '../lib/api';
import { formatPrice } from '../lib/format';
import { ErrorState, PageLoader } from '../components/ui';

export default function DesignDetail() {
  const { id } = useParams();
  const { data: design, isLoading, isError } = useQuery({ queryKey: ['design', id], queryFn: () => designsApi.get(id) });

  if (isLoading) return <PageLoader />;
  if (isError)
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <ErrorState message="This design isn't available." />
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/designs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> All designs
      </Link>
      <div className="grid gap-10 md:grid-cols-2">
        <div className="space-y-4">
          {design.originalImage?.url ? (
            <img src={design.originalImage.url} alt={design.name} className="aspect-[4/5] w-full rounded-3xl object-cover" />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center bg-gradient-to-br from-blush-100 to-blush-200 text-rose-500/70">
              <Footprints className="size-24" strokeWidth={1} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {design.isolatedImage && (
              <figure className="checker card flex aspect-square items-center justify-center overflow-hidden p-4">
                <img src={design.isolatedImage.url} alt="Nail art only" className="max-h-full object-contain" />
              </figure>
            )}
            {design.swatchImage && (
              <figure className="card flex aspect-square items-center justify-center bg-white p-4">
                <img
                  src={design.swatchImage.url}
                  alt="Polish texture"
                  className="h-full rounded-none object-cover shadow-md"
                />
              </figure>
            )}
          </div>
        </div>

        <div className="md:pt-6">
          <p className="text-sm capitalize text-rose-600">{design.category}</p>
          <h1 className="mt-1 text-4xl font-semibold">{design.name}</h1>
          <div className="mt-4 flex items-center gap-5 text-ink-soft">
            <span className="text-2xl font-medium text-ink">{formatPrice(design.price)}</span>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <Clock className="size-4" /> about {design.durationMinutes} min
            </span>
          </div>
          {design.description && <p className="mt-6 leading-relaxed whitespace-pre-line text-ink-soft">{design.description}</p>}
          {design.tags?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {design.tags.map((t) => (
                <span key={t} className="rounded-sm bg-blush-100 px-3 py-1 text-xs text-rose-700">
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to={`/book?design=${design.id}`} className="btn-primary">
              <CalendarPlus className="size-4" /> {design.kind === 'service' ? 'Book this service' : 'Book this design'}
            </Link>
            {design.kind !== 'service' && (
              <Link to={`/try-on?design=${design.id}`} className="btn-secondary">
                <Hand className="size-4" /> Try it on my hand
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
