import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, Hand, Palette } from 'lucide-react';
import { designsApi } from '../lib/api';
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
        <div>
          {design.imageUrl ? (
            <img src={design.imageUrl} alt={design.title} className="aspect-[4/5] w-full rounded-3xl object-cover" />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center bg-gradient-to-br from-blush-100 to-blush-200 text-rose-500/70">
              <Palette className="size-24" strokeWidth={1} />
            </div>
          )}
        </div>

        <div className="md:pt-6">
          <p className="text-sm capitalize text-rose-600">
            {design.category}
          </p>
          <h1 className="mt-1 text-4xl font-semibold">{design.title}</h1>
          {design.description && <p className="mt-6 leading-relaxed whitespace-pre-line text-ink-soft">{design.description}</p>}
          {design.tags?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {design.tags.map((t) => (
                <span key={t} className="pill bg-blush-100 px-3 py-1 text-xs text-rose-700">
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to={`/book?design=${design.id}`} className="btn-primary">
              <CalendarPlus className="size-4" /> Book with this design
            </Link>
            <Link to={`/try-on?design=${design.id}`} className="btn-secondary">
              <Hand className="size-4" /> Try it on my hand
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
