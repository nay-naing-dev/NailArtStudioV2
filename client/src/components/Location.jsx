import { Clock, MapPin, Navigation, Phone } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { directionsUrl, mapEmbedUrl, STUDIO, telUrl } from '../lib/studio';
import { GridBackdrop } from './GridBackdrop';

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-4 border-t border-line py-5 first:border-t-0 first:pt-0">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blush-100 text-rose-600">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">{label}</p>
        <div className="mt-1 text-sm">{children}</div>
      </div>
    </div>
  );
}

export default function Location() {
  const { t } = useI18n();

  return (
    <section className="relative isolate overflow-hidden border-t border-line">
      <GridBackdrop />
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="mb-10 max-w-xl">
          <p className="text-xs font-medium tracking-widest text-rose-600 uppercase">{t('location.eyebrow')}</p>
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">{t('location.title')}</h2>
          <p className="mt-3 text-ink-soft">{t('location.subtitle')}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Map card */}
          <div className="card overflow-hidden shadow-lg shadow-rose-500/5">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-soft">
              <span className="size-2 rounded-sm bg-rose-500" />
              <span className="truncate">{STUDIO.address}</span>
            </div>
            <iframe
              title={t('location.mapTitle')}
              src={mapEmbedUrl()}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              className="map-frame block h-72 w-full border-0 sm:h-96 lg:h-full lg:min-h-[26rem]"
            />
          </div>

          {/* Details card */}
          <div className="card flex flex-col p-6 shadow-md">
            <InfoRow icon={MapPin} label={t('location.address')}>
              <address className="not-italic">{STUDIO.address}</address>
            </InfoRow>
            <InfoRow icon={Clock} label={t('location.hours')}>
              <dl className="space-y-1">
                {STUDIO.hours.map((h) => (
                  <div key={h.days} className="flex justify-between gap-4">
                    <dt className="text-ink-soft">{h.days}</dt>
                    <dd className={h.time ? 'font-medium' : 'text-ink-soft'}>{h.time ?? t('location.closed')}</dd>
                  </div>
                ))}
              </dl>
            </InfoRow>
            <InfoRow icon={Phone} label={t('location.phone')}>
              <a href={telUrl()} className="font-medium hover:text-rose-600">
                {STUDIO.phone}
              </a>
            </InfoRow>

            <div className="mt-auto flex flex-col gap-3 pt-2 sm:flex-row lg:flex-col xl:flex-row">
              <a href={directionsUrl()} target="_blank" rel="noreferrer" className="btn-primary flex-1">
                <Navigation className="size-4" /> {t('location.directions')}
              </a>
              <a href={telUrl()} className="btn-secondary flex-1">
                <Phone className="size-4" /> {t('location.call')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
