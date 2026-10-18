import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Scissors } from 'lucide-react';
import { servicesApi } from '../../lib/api';
import { formatPrice } from '../../lib/format';
import { EmptyState, ErrorState, PageLoader } from '../../components/ui';

export default function Services() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-services'],
    queryFn: () => servicesApi.list({ all: true, limit: 100 }),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Services</h1>
        <Link to="/admin/services/new" className="btn-primary">
          <Plus className="size-4" /> Add service
        </Link>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <ErrorState message="Couldn't load services." onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={Scissors} title="No services yet">
            Add the treatments customers can book, such as a manicure, pedicure or foot spa.
          </EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((s) => (
                  <tr key={s.id} className={s.isActive ? '' : 'opacity-60'}>
                    <td className="px-4 py-3">
                      <Link to={`/admin/services/${s.id}`} className="font-medium hover:text-rose-600">
                        {s.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize text-ink-soft">{s.category.replace(/-/g, ' ')}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.duration} min</td>
                    <td className="px-4 py-3">{formatPrice(s.price)}</td>
                    <td className="px-4 py-3 text-ink-soft">{s.isActive ? 'Active' : 'Archived'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
