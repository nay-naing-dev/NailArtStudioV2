import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BadgePercent, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { errorMessage, promotionsApi } from '../../lib/api';
import { formatDate, formatPrice, isoDate } from '../../lib/format';
import { EmptyState, ErrorState, Field, PageLoader, Spinner } from '../../components/ui';

const EMPTY = { title: '', code: '', discountType: 'percentage', discountValue: '', startDate: isoDate(), expiryDate: isoDate(7), isActive: true };

const STATE_STYLES = {
  live: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  scheduled: 'bg-sky-50 text-sky-800 ring-sky-200',
  expired: 'bg-stone-100 text-stone-600 ring-stone-200',
  inactive: 'bg-white text-ink-soft ring-line',
};
const STATE_LABELS = { live: 'Live', scheduled: 'Scheduled', expired: 'Expired', inactive: 'Off' };

const discountText = (p) => (p.discountType === 'percentage' ? `${p.discountValue}% off` : `${formatPrice(p.discountValue)} off`);

const toForm = (p) => ({
  title: p.title,
  code: p.code ?? '',
  discountType: p.discountType,
  discountValue: p.discountValue,
  startDate: p.startDate,
  expiryDate: p.expiryDate,
  isActive: p.isActive,
});

/** On/off switch for a promotion. */
function Toggle({ on, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${on ? 'bg-rose-500' : 'bg-line'}`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function PromotionForm({ initial, editing, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const percent = form.discountType === 'percentage';

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, discountValue: Number(form.discountValue), code: form.code.trim() };
      return editing ? promotionsApi.update(editing, body) : promotionsApi.create(body);
    },
    onSuccess: (p) => onSaved(p, editing ? 'Promotion saved' : 'Promotion created'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <form
      className="card grid gap-4 p-5 sm:grid-cols-2 md:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="font-sans text-base font-semibold sm:col-span-2">{editing ? 'Edit promotion' : 'New promotion'}</h2>
      <Field label="Campaign name">
        <input className="input" required maxLength={80} value={form.title} onChange={set('title')} placeholder="e.g. Thadingyut Special" />
      </Field>
      <Field label="Promo code (optional)" hint="Leave empty to apply it automatically to every booking while it's live.">
        <input
          className="input uppercase placeholder:normal-case"
          value={form.code}
          onChange={set('code')}
          maxLength={30}
          pattern="[A-Za-z0-9_\-]{3,30}"
          title="3-30 letters, numbers, - or _"
          placeholder="e.g. THINGYAN26"
        />
      </Field>

      <div>
        <span className="label">Discount</span>
        <div className="flex gap-2">
          <div className="flex shrink-0 gap-1 rounded-2xl border border-line bg-white/70 p-1" role="radiogroup" aria-label="Discount type">
            {[
              ['percentage', '%'],
              ['fixed', 'Amount'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={form.discountType === value}
                onClick={() => setForm({ ...form, discountType: value })}
                className={`pill px-3 py-1.5 text-sm ${form.discountType === value ? 'pill-active bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <input
              className="input pr-12"
              type="number"
              required
              min={1}
              max={percent ? 100 : undefined}
              step={percent ? 1 : 'any'}
              value={form.discountValue}
              onChange={set('discountValue')}
              aria-label={percent ? 'Percent off' : 'Amount off'}
            />
            {percent && (
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-ink-soft">%</span>
            )}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-3 self-end pb-3 text-sm">
        <Toggle on={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="Active" />
        Active
      </label>

      <Field label="Starts">
        <input className="input" type="date" required value={form.startDate} onChange={set('startDate')} />
      </Field>
      <Field label="Ends (inclusive)">
        <input className="input" type="date" required min={form.startDate} value={form.expiryDate} onChange={set('expiryDate')} />
      </Field>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          <X className="size-4" /> Cancel
        </button>
        <button className="btn-primary" disabled={save.isPending}>
          {save.isPending ? <Spinner className="size-4 text-white" /> : editing ? <Save className="size-4" /> : <Plus className="size-4" />}
          {editing ? 'Save changes' : 'Create promotion'}
        </button>
      </div>
    </form>
  );
}

export default function Promotions() {
  const queryClient = useQueryClient();
  // null = form closed; 'new' = creating; otherwise the id being edited
  const [editing, setEditing] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin-promotions'], queryFn: promotionsApi.list });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-promotions'] });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }) => promotionsApi.update(id, { isActive }),
    onSuccess: (p) => {
      toast.success(p.isActive ? `${p.title} is on` : `${p.title} is off`);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id) => promotionsApi.remove(id),
    onSuccess: () => {
      toast.success('Promotion deleted');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const editingPromo = editing && editing !== 'new' ? data?.items.find((p) => p.id === editing) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Promotions</h1>
          <p className="mt-1 text-sm text-ink-soft">
            One promotion applies per booking (the best available), on top of the automatic Service + Design combo discount.
          </p>
        </div>
        {!editing && (
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New promotion
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-6">
          <PromotionForm
            key={editing}
            editing={editingPromo?.id}
            initial={editingPromo ? toForm(editingPromo) : EMPTY}
            onCancel={() => setEditing(null)}
            onSaved={(p, msg) => {
              toast.success(msg);
              setEditing(null);
              refresh();
            }}
          />
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <ErrorState message="Couldn't load promotions." onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={BadgePercent} title="No promotions yet">
            Create a seasonal campaign such as Thadingyut or Thingyan, or a flash sale with a promo code.
          </EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Discount</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">On</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((p) => (
                  <tr key={p.id} className={p.state === 'live' ? '' : 'text-ink-soft'}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{p.title}</p>
                      {p.code ? (
                        <code className="pill mt-1 inline-block bg-blush-100 px-2 py-0.5 text-xs text-rose-700">{p.code}</code>
                      ) : (
                        <p className="text-xs text-ink-soft">Automatic, no code</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{discountText(p)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(p.startDate, { day: 'numeric', month: 'short', year: 'numeric' })} –{' '}
                      {formatDate(p.expiryDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATE_STYLES[p.state]}`}>
                        {STATE_LABELS[p.state]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        on={p.isActive}
                        disabled={toggle.isPending}
                        onChange={(isActive) => toggle.mutate({ id: p.id, isActive })}
                        label={`${p.title} active`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost pill p-2" onClick={() => setEditing(p.id)} aria-label={`Edit ${p.title}`}>
                          <Pencil className="size-4" />
                        </button>
                        <button
                          className="btn-ghost pill p-2 hover:bg-red-50 hover:text-red-700"
                          disabled={remove.isPending}
                          onClick={() => window.confirm(`Delete "${p.title}"? Past bookings keep their discount.`) && remove.mutate(p.id)}
                          aria-label={`Delete ${p.title}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
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
