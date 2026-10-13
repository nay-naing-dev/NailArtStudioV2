import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { appointmentsApi } from '../../lib/api';
import { formatDate, formatPrice, formatTime, STATUS_LABELS, STATUS_TRANSITIONS } from '../../lib/format';
import { ErrorState, Spinner, StatusBadge } from '../../components/ui';
import { useStatusMutation } from './useStatusMutation';

const LIMIT = 20;

function StatusSelect({ appt, onChange, disabled }) {
  const options = [appt.status, ...STATUS_TRANSITIONS[appt.status]];
  return (
    <select
      className="input w-auto py-1.5 text-xs"
      value={appt.status}
      disabled={disabled}
      onChange={(e) => {
        const status = e.target.value;
        if (status === 'cancelled' && !window.confirm(`Cancel ${appt.customerName}'s appointment?`)) return;
        onChange(status);
      }}
      aria-label="Change status"
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {s === appt.status ? STATUS_LABELS[s] : `→ ${STATUS_LABELS[s]}`}
        </option>
      ))}
    </select>
  );
}

export default function Appointments() {
  const [filters, setFilters] = useState({ status: '', from: '', to: '', search: '' });
  const [page, setPage] = useState(1);
  const params = Object.fromEntries(Object.entries({ ...filters, page, limit: LIMIT }).filter(([, v]) => v !== ''));

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-appointments', params],
    queryFn: () => appointmentsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const setStatus = useStatusMutation();
  const setFilter = (k) => (e) => {
    setFilters({ ...filters, [k]: e.target.value });
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-semibold">Appointments</h1>

      <div className="card mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input className="input" placeholder="Search name, email, phone" value={filters.search} onChange={setFilter('search')} aria-label="Search" />
        <select className="input" value={filters.status} onChange={setFilter('status')} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input className="input" type="date" value={filters.from} onChange={setFilter('from')} aria-label="From date" />
        <input className="input" type="date" value={filters.to} onChange={setFilter('to')} aria-label="To date" />
      </div>

      <div className="card mt-4 overflow-x-auto">
        {isLoading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : isError ? (
          <div className="p-4">
            <ErrorState message="Couldn't load appointments." onRetry={refetch} />
          </div>
        ) : data.items.length === 0 ? (
          <p className="p-6 text-sm text-ink-soft">No appointments match these filters.</p>
        ) : (
          <table className={`w-full min-w-[760px] text-left text-sm ${isFetching ? 'opacity-60' : ''}`}>
            <thead className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Design</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-medium">{formatDate(a.date)}</p>
                    <p className="text-ink-soft">
                      {formatTime(a.startTime)} – {formatTime(a.endTime)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.customerName}</p>
                    <p className="text-ink-soft">{a.customerPhone}</p>
                    <p className="text-ink-soft">{a.customerEmail}</p>
                    {a.notes && <p className="mt-1 max-w-56 text-xs text-ink-soft italic">“{a.notes}”</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {a.design?.swatchImage && (
                        <img src={a.design.swatchImage.url} alt="" className="h-10 w-7 rounded-[40%/30%] object-cover" />
                      )}
                      <div>
                        <p>{a.design?.name ?? '—'}</p>
                        {a.priceAtBooking != null && <p className="text-ink-soft">{formatPrice(a.priceAtBooking)}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                    {!a.customer && <p className="mt-1 text-xs text-ink-soft">Guest</p>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusSelect
                      appt={a}
                      disabled={setStatus.isPending}
                      onChange={(status) => setStatus.mutate({ id: a.id, status })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data?.pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <span className="text-ink-soft">
            Page {data.page} of {data.pages} · {data.total} total
          </span>
          <button className="btn-secondary p-2" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </button>
          <button className="btn-secondary p-2" disabled={page >= data.pages} onClick={() => setPage(page + 1)} aria-label="Next page">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
