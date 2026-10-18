import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck, Hand, Sparkles } from "lucide-react";
import { designsApi } from "../lib/api";
import { DesignFan, HeroStack } from "../components/PhotoStack";
import { ArtistsSection } from "../components/Artists";
import Location from "../components/Location";
import { GridBackdrop } from "../components/GridBackdrop";
import { useI18n } from "../lib/i18n";

const FEATURES = [
  { icon: Hand, k: "f1" },
  { icon: CalendarCheck, k: "f2" },
  { icon: Sparkles, k: "f3" },
];

export default function Home() {
  const { t } = useI18n();
  const { data } = useQuery({
    queryKey: ["designs", { limit: 6 }],
    queryFn: () => designsApi.list({ limit: 6 }),
  });

  return (
    <>
      <div className="relative isolate overflow-hidden">
        <GridBackdrop />
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-24">
          <div>
            <h1 className="text-5xl leading-[1.05] font-semibold sm:text-6xl md:text-7xl">
              {t("home.titleBefore")}{" "}
              <em className="text-rose-500">{t("home.titleEm")}</em>{" "}
              {t("home.titleAfter")}
            </h1>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link to="/book" className="btn-primary btn-lg">
                {t("home.ctaBook")} <ArrowRight className="size-5" />
              </Link>
              <Link to="/designs" className="btn-secondary btn-lg">
                {t("home.ctaBrowse")}
              </Link>
            </div>
          </div>
          <HeroStack items={(data?.items ?? []).filter((d) => d.imageUrl)} />
        </section>
      </div>

      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.k} className="flex gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blush-100 text-rose-600">
                <f.icon className="size-5" />
              </div>
              <div>
                <h3 className="font-sans text-base font-semibold">
                  {t(`home.${f.k}Title`)}
                </h3>
                <p className="mt-1 text-sm text-ink-soft">
                  {t(`home.${f.k}Text`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {data?.items?.length > 0 && (
        <section className="relative isolate overflow-hidden">
          <GridBackdrop />
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="text-3xl font-semibold md:text-4xl">{t("home.latest")}</h2>
              <Link to="/designs" className="text-sm font-medium text-rose-600 hover:underline">
                {t("home.seeAll")}
              </Link>
            </div>
            <DesignFan items={data.items.filter((d) => d.imageUrl)} />
          </div>
        </section>
      )}

      <ArtistsSection />

      <Location />
    </>
  );
}
