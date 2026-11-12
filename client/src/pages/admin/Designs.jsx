import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Palette, Plus } from 'lucide-react';
import { designsApi } from '../../lib/api';
import { sized } from '../../lib/images';
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
        <h1 className="text-3xl font-semibold">Nail designs</h1>
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
            Upload a hand photo to extract the nail art automatically, or segment a full press-on set, a single nail or a pattern by hand.
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
                  <img src={sized(d.imageUrl, 400)} alt="" loading="lazy" className="size-full object-cover" />
                  <div className="checker flex items-center justify-center p-2">
                    {d.fingerTextures ? (
                      <div className="flex h-full items-center gap-1">
                        {Object.values(d.fingerTextures).map((url) => (
                          <img key={url} src={url} alt="" className="max-h-[70%] w-[18%] rounded-[40%/30%] object-cover" />
                        ))}
                      </div>
                    ) : d.isolatedImage || d.textureUrl ? (
                      <img src={d.isolatedImage?.url ?? d.textureUrl} alt="" className="max-h-full object-contain" />
                    ) : (
                      <span className="text-xs text-ink-soft">{busy(d) ? 'Extracting…' : '—'}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 p-3">
                  <p className="truncate font-medium">{d.title}</p>
                  <div className="flex items-center gap-2">
                    <ProcessingBadge status={d.processing?.status} />
                    {d.designType !== 'single' && (
                      <span className="pill bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700">{d.designType === 'set' ? 'Full set' : 'Pattern'}</span>
                    )}
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
