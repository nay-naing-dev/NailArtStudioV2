import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Clock, Sparkles } from "lucide-react";
import { servicesApi } from "../lib/api";
import { formatPrice } from "../lib/format";
import { GridBackdrop } from "../components/GridBackdrop";
import { EmptyState, ErrorState, PageLoader } from "../components/ui";
import { useI18n } from "../lib/i18n";

const categoryLabel = (c) => c.replace(/-/g, " ");

function ServiceRow({ service }) {
  const { t } = useI18n();
  return (
    <li className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5">
      <div className="min-w-0 flex-1 basis-60">
        <h3 className="font-sans text-base font-semibold">{service.title}</h3>
        {service.description && <p className="mt-1 text-sm text-ink-soft">{service.description}</p>}
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
        <Clock className="size-4" /> {t("book.minutes", { n: service.duration })}
      </span>
      <span className="w-28 text-right text-lg font-semibold text-rose-600">{formatPrice(service.price)}</span>
      <Link to={`/book?service=${service.id}`} className="btn-primary px-4 py-2">
        <CalendarPlus className="size-4" /> {t("services.book")}
      </Link>
    </li>
  );
}

export default function Services() {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["services", { limit: 100 }],
    queryFn: () => servicesApi.list({ limit: 100 }),
  });

  const groups = useMemo(() => {
    const byCategory = new Map();
    for (const s of data?.items ?? []) {
      if (!byCategory.has(s.category)) byCategory.set(s.category, []);
      byCategory.get(s.category).push(s);
    }
    return [...byCategory.entries()];
  }, [data]);

  return (
    <div className="relative isolate overflow-hidden">
      <GridBackdrop className="h-64" />
      <div className="mx-auto max-w-4xl px-4 py-10 md:py-14">
        <h1 className="text-4xl font-semibold">{t("services.title")}</h1>
        <p className="mt-2 text-ink-soft">{t("services.subtitle")}</p>

        <div className="mt-8 space-y-10">
          {isLoading ? (
            <PageLoader />
          ) : isError ? (
            <ErrorState message={t("services.loadError")} onRetry={refetch} />
          ) : groups.length === 0 ? (
            <EmptyState icon={Sparkles} title={t("services.emptyTitle")}>
              {t("services.emptySoon")}
            </EmptyState>
          ) : (
            groups.map(([category, items]) => (
              <section key={category} aria-labelledby={`cat-${category}`}>
                <h2 id={`cat-${category}`} className="mb-3 text-2xl font-semibold capitalize">
                  {categoryLabel(category)}
                </h2>
                <ul className="space-y-3">
                  {items.map((s) => (
                    <ServiceRow key={s.id} service={s} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <p className="mt-12 text-sm text-ink-soft">
          {t("services.designsHint")}{" "}
          <Link to="/designs" className="font-medium text-rose-600 hover:underline">
            {t("services.designsLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
