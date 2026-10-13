import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarX } from 'lucide-react';
import { appointmentsApi, errorMessage } from '../lib/api';
import { formatDate, formatPrice, formatTime, isoDate } from '../lib/format';
import { EmptyState, ErrorState, PageLoader, StatusBadge } from '../components/ui';

export default function MyBookings() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['my-bookings'], queryFn: appointmentsApi.mine });

  const cancel = useMutation({
    mutationFn: appointmentsApi.cancel,
    onSuccess: () => {
      toast.success('Booking cancelled');
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const today = isoDate();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-4xl font-semibold">My bookings</h1>
      <div className="mt-8 space-y-3">
        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <ErrorState message="Couldn't load your bookings." onRetry={refetch} />
        ) : data.length === 0 ? (
          <EmptyState icon={CalendarX} title="No bookings yet">
            <Link to="/book" className="btn-primary mt-2">
              Book an appointment
            </Link>
          </EmptyState>
        ) : (
          data.map((a) => {
            const cancellable = ['pending', 'confirmed'].includes(a.status) && a.date >= today;
            return (
              <div key={a.id} className="card flex items-center gap-4 p-4">
                {a.design?.swatchImage ? (
                  <img src={a.design.swatchImage.url} alt="" className="h-16 w-12 shrink-0 rounded-none object-cover" />
                ) : (
                  <div className="h-16 w-12 shrink-0 rounded-none bg-blush-100" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{formatDate(a.date)}</span>
                    <span className="text-ink-soft">{formatTime(a.startTime)}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="truncate text-sm text-ink-soft">
                    {a.design?.name ?? 'Design chosen at the studio'}
                    {a.priceAtBooking != null && ` · ${formatPrice(a.priceAtBooking)}`}
                  </p>
                </div>
                {cancellable && (
                  <button
                    className="btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={cancel.isPending}
                    onClick={() => window.confirm('Cancel this booking?') && cancel.mutate(a.id)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
