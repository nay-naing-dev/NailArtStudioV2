import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Palette } from "lucide-react";
import { designsApi } from "../lib/api";
import { GridBackdrop } from "../components/GridBackdrop";
import DesignCard from "../components/DesignCard";
import { useI18n } from "../lib/i18n";
import { EmptyState, ErrorState, PageLoader } from "../components/ui";

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Gallery() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const q = useDebounced(search.trim());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["designs", { search: q, limit: 100 }],
    queryFn: () => designsApi.list({ search: q || undefined, limit: 100 }),
  });

  const categories = useMemo(
    () => [...new Set((data?.items ?? []).map((d) => d.category))].sort(),
    [data],
  );
  const items = (data?.items ?? []).filter(
    (d) => !category || d.category === category,
  );

  return (
    <div className="relative isolate overflow-hidden">
      <GridBackdrop className="h-64" />
      <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <h1 className="text-4xl font-semibold">{t("gallery.title")}</h1>
        <p className="mt-2 text-ink-soft">{t("gallery.subtitle")}</p>

        <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative md:w-80">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              className="input pl-10"
              placeholder={t("gallery.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("gallery.search")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {["", ...categories].map((c) => (
              <button
                key={c || "all"}
                onClick={() => setCategory(c)}
                className={`rounded-full px-3.5 py-1.5 text-sm capitalize transition ${
                  category === c
                    ? "bg-ink text-white"
                    : "border border-line bg-white text-ink-soft hover:text-ink"
                }`}
              >
                {c || t("gallery.all")}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <PageLoader />
          ) : isError ? (
            <ErrorState message={t("gallery.loadError")} onRetry={refetch} />
          ) : items.length === 0 ? (
            <EmptyState icon={Palette} title={t("gallery.emptyTitle")}>
              {q || category
                ? t("gallery.emptyFiltered")
                : t("gallery.emptySoon")}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((d) => (
                <DesignCard key={d.id} design={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
