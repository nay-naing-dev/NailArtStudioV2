import { BadgePercent } from 'lucide-react';
import { formatPrice } from '../lib/format';
import { useI18n } from '../lib/i18n';

const rate = (d) => (d.discountType === 'percentage' ? `${d.discountValue}%` : formatPrice(d.discountValue));

/** Discount line label: "Service + Design combo discount (−5%)", "Thadingyut Special · VIP15 (−10%)". */
export function useDiscountLabel() {
  const { t } = useI18n();
  return (d) => `${d.kind === 'combo' ? t('book.comboDiscount') : d.title}${d.code ? ` · ${d.code}` : ''} (−${rate(d)})`;
}

/**
 * Subtotal, each applied discount and the total, from a quote or a booked appointment.
 * Accepts either shape: { subtotal, discounts, total } or { subtotalAtBooking, discounts, priceAtBooking }.
 */
export default function PriceBreakdown({ price, className = '' }) {
  const { t } = useI18n();
  const label = useDiscountLabel();
  const subtotal = price.subtotal ?? price.subtotalAtBooking;
  const total = price.total ?? price.priceAtBooking;
  const discounts = price.discounts ?? [];

  return (
    <dl className={`space-y-2 text-sm ${className}`}>
      {discounts.length > 0 && (
        <>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-soft">{t('book.subtotal')}</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          {discounts.map((d) => (
            <div key={`${d.kind}-${d.title}`} className="flex justify-between gap-4 text-emerald-700">
              <dt className="flex min-w-0 items-start gap-1.5">
                <BadgePercent className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{label(d)}</span>
              </dt>
              <dd className="shrink-0 font-medium">−{formatPrice(d.amount)}</dd>
            </div>
          ))}
        </>
      )}
      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
        <dt className="font-medium">{t('book.total')}</dt>
        <dd className="text-right">
          {discounts.length > 0 && <s className="mr-2 text-xs text-ink-soft">{formatPrice(subtotal)}</s>}
          <span className="text-lg font-semibold">{formatPrice(total)}</span>
        </dd>
      </div>
    </dl>
  );
}
