import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Palette, Plus } from 'lucide-react';
import { designsApi } from '../../lib/api';
import { formatPrice } from '../../lib/format';
import { EmptyState, ErrorState, PageLoader, ProcessingBadge } from '../../components/ui';

const busy = (d) => ['pending', 'processing'].includes(d.processing?.status);

export default function Designs() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-designs'],
    queryFn: () => designsApi.list({ all: true, limit: 100 }),
    // Keep polling while any design is still being processed.
    refetchInterval: (q) => (q.state.data?.items.some(busy) ? 2000 : false),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Designs</h1>
        <Link to="/admin/designs/new" className="btn-primary">
          <Plus className="size-4" /> Upload design
        </Link>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <ErrorState message="Couldn't load designs." onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={Palette} title="No designs yet">
            Upload a reference photo and the nail art will be extracted from it automatically.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {data.items.map((d) => (
              <Link
                key={d.id}
                to={`/admin/designs/${d.id}`}
                className={`card overflow-hidden transition hover:shadow-lg ${d.isActive ? '' : 'opacity-60'}`}
              >
                <div className="grid aspect-[4/3] grid-cols-2">
                  <img src={d.originalImage?.url} alt="" className="size-full object-cover" />
                  <div className="checker flex items-center justify-center p-2">
                    {d.isolatedImage ? (
                      <img src={d.isolatedImage.url} alt="" className="max-h-full object-contain" />
                    ) : (
                      <span className="text-xs text-ink-soft">{busy(d) ? 'Extracting…' : '—'}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{d.name}</p>
                    <span className="shrink-0 text-sm text-ink-soft">{formatPrice(d.price)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProcessingBadge status={d.processing?.status} />
                    {!d.isActive && <span className="text-xs text-ink-soft">Archived</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
