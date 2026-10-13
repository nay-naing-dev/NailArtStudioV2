import { AlertCircle, Loader2 } from 'lucide-react';
import { STATUS_LABELS } from '../lib/format';

export function Spinner({ className = 'size-5' }) {
  return <Loader2 className={`animate-spin text-rose-500 ${className}`} aria-hidden />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
      <Spinner className="size-8" />
    </div>
  );
}

export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <AlertCircle className="size-8 text-rose-500" aria-hidden />
      <p className="text-ink-soft">{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      {Icon && <Icon className="size-8 text-rose-500" aria-hidden />}
      <h3 className="text-lg">{title}</h3>
      {children && <div className="text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  confirmed: 'bg-sky-50 text-sky-800 ring-sky-200',
  completed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  cancelled: 'bg-stone-100 text-stone-600 ring-stone-200',
  no_show: 'bg-red-50 text-red-700 ring-red-200',
};

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-sm px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const PROCESSING_STYLES = {
  pending: 'bg-stone-100 text-stone-700 ring-stone-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
  ready: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
};

export function ProcessingBadge({ status }) {
  const busy = status === 'pending' || status === 'processing';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-xs font-medium ring-1 ${PROCESSING_STYLES[status]}`}
    >
      {busy && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {status === 'ready' ? 'Ready' : status === 'failed' ? 'Failed' : 'Processing'}
    </span>
  );
}

export function Field({ label, error, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
