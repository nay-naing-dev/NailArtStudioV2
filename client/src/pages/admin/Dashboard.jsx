import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus } from 'lucide-react';
import { appointmentsApi } from '../../lib/api';
import { formatDate, formatPrice, formatTime, isoDate } from '../../lib/format';
import { ErrorState, Spinner, StatusBadge } from '../../components/ui';
import { useStatusMutation } from './useStatusMutation';

function Stat({ label, value, accent }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold ${accent ? 'text-rose-600' : ''}`}>{value ?? '—'}</p>
    </div>
  );
}

export default function Dashboard() {
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: appointmentsApi.stats, refetchInterval: 60_000 });
  const upcoming = useQuery({
    queryKey: ['admin-appointments', { from: isoDate(), limit: 8, view: 'upcoming' }],
    queryFn: () => appointmentsApi.list({ from: isoDate(), limit: 8 }),
    refetchInterval: 60_000,
  });
  const setStatus = useStatusMutation();
  const live = (upcoming.data?.items ?? []).filter((a) => ['pending', 'confirmed'].includes(a.status));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Overview</h1>
        <Link to="/admin/designs/new" className="btn-primary">
          <Plus className="size-4" /> New design
        </Link>
      </div>

      {stats.isError ? (
        <div className="mt-6">
          <ErrorState message="Couldn't load stats." onRetry={stats.refetch} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Today" value={stats.data?.today} />
          <Stat label="Upcoming" value={stats.data?.upcoming} />
          <Stat label="Awaiting confirmation" value={stats.data?.byStatus?.pending ?? (stats.data && 0)} accent />
          <Stat label="Revenue (completed)" value={stats.data && formatPrice(stats.data.completedRevenue)} />
        </div>
      )}

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-semibold">Next appointments</h2>
          <Link to="/admin/appointments" className="text-sm font-medium text-rose-600 hover:underline">
            All appointments
          </Link>
        </div>
        <div className="card divide-y divide-line">
          {upcoming.isLoading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : live.length === 0 ? (
            <p className="p-6 text-sm text-ink-soft">No upcoming appointments.</p>
          ) : (
            live.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="w-28 shrink-0">
                  <p className="text-sm font-semibold">{formatDate(a.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                  <p className="text-sm text-ink-soft">{formatTime(a.startTime)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.customerName}</p>
                  <p className="truncate text-sm text-ink-soft">
                    {a.service?.title ?? 'No service'}{a.design ? ` + ${a.design.title}` : ''} · {a.customerPhone}
                  </p>
                </div>
                <StatusBadge status={a.status} />
                {a.status === 'pending' && (
                  <button
                    className="btn-secondary px-3 py-1.5"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: a.id, status: 'confirmed' })}
                  >
                    <Check className="size-4" /> Confirm
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
