import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Check, TicketPercent, X } from "lucide-react";
import {
  appointmentsApi,
  artistsApi,
  designsApi,
  errorMessage,
  servicesApi,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatPrice, formatTime, isoDate } from "../lib/format";
import { GridBackdrop } from "../components/GridBackdrop";
import PriceBreakdown from "../components/PriceBreakdown";
import { Field, Spinner } from "../components/ui";
import { useI18n } from "../lib/i18n";

const DAYS_SHOWN = 21;

function Step({ n, title, children }) {
  return (
    <section className="card min-w-0 p-4 shadow-sm sm:p-5 md:p-6">
      <h2 className="mb-4 flex items-center gap-3 font-sans text-base font-semibold">
        <span className="flex size-7 items-center justify-center rounded-full bg-ink text-xs text-white">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Voucher input. Shows the applied code as a removable chip, or why a code didn't apply. */
function PromoCodeBox({ applied, promo, loading, onApply, onRemove }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const ok = promo?.status === "applied";
  const message = promo && !ok && (promo.reason ? t(`book.promoReasons.${promo.reason}`) : promo.message);

  if (applied && ok) {
    return (
      <div className="mt-4">
        <span className="label">{t("book.promoLabel")}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="pill pill-active inline-flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
            <TicketPercent className="size-4" aria-hidden /> {applied}
          </span>
          <button type="button" className="btn-ghost pill p-1.5" onClick={onRemove} aria-label={t("book.promoRemove")}>
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-emerald-700" role="status">{t("book.promoApplied")}</p>
      </div>
    );
  }

  return (
    <form
      className="mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onApply(code.trim().toUpperCase());
      }}
    >
      <label htmlFor="promo-code" className="label">{t("book.promoLabel")}</label>
      <div className="flex gap-2">
        <input
          id="promo-code"
          className="input min-w-0 py-2 uppercase placeholder:normal-case"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("book.promoPlaceholder")}
          maxLength={30}
          autoComplete="off"
          aria-invalid={Boolean(message && promo?.status === "invalid")}
          aria-describedby={message ? "promo-message" : undefined}
        />
        <button className="btn-secondary shrink-0 px-4 py-2" disabled={!code.trim() || loading}>
          {loading ? <Spinner className="size-4" /> : t("book.promoApply")}
        </button>
      </div>
      {message && (
        <p id="promo-message" className={`mt-1.5 text-xs ${promo.status === "invalid" ? "text-red-600" : "text-ink-soft"}`} role="status">
          {message}
        </p>
      )}
    </form>
  );
}

export default function Book() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [serviceId, setServiceId] = useState(params.get("service") || "");
  const [designId, setDesignId] = useState(params.get("design") || "");
  const [artistId, setArtistId] = useState(params.get("artist") || "");
  const [date, setDate] = useState(isoDate(1));
  const [startTime, setStartTime] = useState("");
  const [contact, setContact] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    notes: "",
  });
  const [booked, setBooked] = useState(null);
  const [promoCode, setPromoCode] = useState(params.get("promo") || "");

  useEffect(() => {
    if (user) {
      setContact((c) => ({
        ...c,
        customerName: c.customerName || user.name || "",
        customerEmail: c.customerEmail || user.email || "",
        customerPhone: c.customerPhone || user.phone || "",
      }));
    }
  }, [user]);

  const services = useQuery({
    queryKey: ["services", { limit: 100 }],
    queryFn: () => servicesApi.list({ limit: 100 }),
  });
  const designs = useQuery({
    queryKey: ["designs", { limit: 100 }],
    queryFn: () => designsApi.list({ limit: 100 }),
  });
  const artists = useQuery({ queryKey: ["artists"], queryFn: artistsApi.list });
  const availability = useQuery({
    queryKey: ["availability", date],
    queryFn: () => appointmentsApi.availability(date),
    enabled: Boolean(date),
  });
  const days = useMemo(
    () => Array.from({ length: DAYS_SHOWN }, (_, i) => isoDate(i)),
    [],
  );
  const selectedArtist = artists.data?.items.find((a) => a.id === artistId);
  const selectedService = services.data?.items.find((s) => s.id === serviceId);
  const selectedDesign = designs.data?.items.find((d) => d.id === designId);

  useEffect(() => setStartTime(""), [date]);

  // Priced by the server: combo discount, live promotions and any promo code.
  const quote = useQuery({
    queryKey: ["quote", serviceId, designId, promoCode],
    queryFn: () =>
      appointmentsApi.quote({
        serviceId,
        designId: designId || undefined,
        promoCode: promoCode || undefined,
      }),
    enabled: Boolean(serviceId),
    placeholderData: keepPreviousData,
  });
  const promo = promoCode ? quote.data?.promo : null;

  const book = useMutation({
    mutationFn: () =>
      appointmentsApi.create({
        serviceId,
        designId: designId || undefined,
        artistId: artistId || undefined,
        // Only send a code that applied; an invalid one would fail the booking.
        promoCode: promo?.status === "applied" ? promoCode : undefined,
        date,
        startTime,
        ...contact,
        notes: contact.notes || undefined,
      }),
    onSuccess: (appt) => {
      setBooked(appt);
      queryClient.invalidateQueries({ queryKey: ["availability"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: () => {
      // Slot may have been taken in the meantime.
      queryClient.invalidateQueries({ queryKey: ["availability", date] });
    },
  });

  if (booked) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="card p-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check className="size-7" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold">{t("book.doneTitle")}</h1>
          <p className="mt-2 text-ink-soft">
            {formatDate(booked.date)} at {formatTime(booked.startTime)}
            {booked.service && <> · {booked.service.title}</>}
            {booked.design && <> · {booked.design.title}</>}
            {booked.artist && <> · {booked.artist.name}</>}
          </p>
          {booked.priceAtBooking != null && (
            <PriceBreakdown price={booked} className="mx-auto mt-6 max-w-xs text-left" />
          )}
          <p className="mt-4 text-sm text-ink-soft">
            {t("book.donePending")} <strong>{t("book.donePendingWord")}</strong>
            . {t("book.doneConfirmNote")}
          </p>
          <div className="mt-8 flex justify-center gap-3">
            {user && (
              <Link to="/my-bookings" className="btn-primary">
                {t("book.viewBookings")}
              </Link>
            )}
            <Link to="/services" className="btn-secondary">
              {t("book.backToServices")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit =
    serviceId &&
    startTime &&
    contact.customerName &&
    contact.customerEmail &&
    contact.customerPhone &&
    !book.isPending;
  const setField = (k) => (e) =>
    setContact({ ...contact, [k]: e.target.value });

  return (
    <div className="relative isolate overflow-hidden">
      <GridBackdrop className="h-64" />
      <div className="mx-auto w-full max-w-4xl overflow-x-clip px-4 py-8 sm:px-6 md:py-12">
        <h1 className="text-3xl font-semibold md:text-4xl">
          {t("book.title")}
        </h1>
        <p className="mt-2 text-ink-soft">
          {user ? (
            t("book.bookingAs", { name: user.name })
          ) : (
            <>
              {t("book.guest")}{" "}
              <Link
                to="/login"
                state={{ from: "/book" }}
                className="text-rose-600 hover:underline"
              >
                {t("book.loginLink")}
              </Link>{" "}
              {t("book.guestHint")}
            </>
          )}
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-6">
            <Step n={1} title={t("book.step1")}>
              {services.isLoading ? (
                <Spinner />
              ) : !services.data?.items.length ? (
                <p className="text-sm text-ink-soft">{t("book.noServices")}</p>
              ) : (
                <div role="radiogroup" aria-label={t("book.step1")} className="grid gap-2">
                  {services.data.items.map((s) => (
                    <button
                      key={s.id}
                      role="radio"
                      aria-checked={serviceId === s.id}
                      onClick={() => setServiceId(s.id)}
                      className={`flex items-center justify-between gap-4 rounded-2xl border-2 px-4 py-3 text-left transition ${
                        serviceId === s.id
                          ? "border-rose-500 bg-blush-100"
                          : "border-line bg-white hover:border-rose-500/50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{s.title}</span>
                        <span className="block text-xs capitalize text-ink-soft">
                          {s.category.replace(/-/g, " ")} · {t("book.minutes", { n: s.duration })}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium text-rose-600">{formatPrice(s.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Step>

            <Step n={2} title={t("book.stepDesign")}>
              <div className="flex gap-3 overflow-x-auto pb-2">
                <button
                  onClick={() => setDesignId("")}
                  className={`flex h-28 w-24 shrink-0 items-center justify-center rounded-2xl border-2 p-2 text-center text-xs transition ${
                    !designId
                      ? "border-rose-500 bg-blush-100"
                      : "border-line bg-white hover:border-rose-500/50"
                  }`}
                >
                  {t("book.noDesign")}
                </button>
                {designs.data?.items.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDesignId(d.id)}
                    className={`relative w-24 shrink-0 overflow-hidden rounded-2xl border-2 text-left transition ${
                      designId === d.id
                        ? "border-rose-500"
                        : "border-transparent hover:border-rose-500/50"
                    }`}
                    title={d.title}
                  >
                    <img src={d.imageUrl} alt="" className="h-20 w-full object-cover" />
                    <span className="block truncate bg-white px-1.5 py-1 text-xs">
                      {d.title}
                    </span>
                  </button>
                ))}
              </div>
            </Step>

            <Step n={3} title={t("book.stepArtist")}>
              <div className="flex gap-3 overflow-x-auto pb-2">
                <button
                  onClick={() => setArtistId("")}
                  className={`flex h-28 w-24 shrink-0 items-center justify-center rounded-2xl border-2 p-2 text-center text-xs transition ${
                    !artistId
                      ? "border-rose-500 bg-blush-100"
                      : "border-line bg-white hover:border-rose-500/50"
                  }`}
                >
                  {t("book.anyArtist")}
                </button>
                {artists.data?.items.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setArtistId(a.id)}
                    title={a.role}
                    className={`flex h-28 w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-2 text-center transition ${
                      artistId === a.id
                        ? "border-rose-500 bg-blush-100"
                        : "border-line bg-white hover:border-rose-500/50"
                    }`}
                  >
                    {a.image ? (
                      <img
                        src={a.image}
                        alt=""
                        className="size-12 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex size-12 items-center justify-center rounded-full bg-blush-200 font-display text-lg text-rose-600">
                        {a.name.charAt(0)}
                      </span>
                    )}
                    <span className="w-full truncate text-xs">{a.name}</span>
                  </button>
                ))}
              </div>
            </Step>

            <Step n={4} title={t("book.step2")}>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {days.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2 transition ${
                      date === d
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-white hover:border-ink/40"
                    }`}
                  >
                    <span className="text-[11px] uppercase opacity-70">
                      {formatDate(d, { weekday: "short" })}
                    </span>
                    <span className="text-lg font-semibold">
                      {formatDate(d, { day: "numeric" })}
                    </span>
                    <span className="text-[11px] opacity-70">
                      {formatDate(d, { month: "short" })}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-5 min-h-24">
                {availability.isLoading ? (
                  <Spinner />
                ) : availability.isError ? (
                  <p className="text-sm text-red-600">
                    {errorMessage(availability.error)}
                  </p>
                ) : !availability.data.open ? (
                  <p className="text-sm text-ink-soft">
                    {availability.data.reason}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {availability.data.slots.map((s) => (
                      <button
                        key={s.startTime}
                        disabled={!s.available}
                        onClick={() => setStartTime(s.startTime)}
                        className={`rounded-xl border py-2.5 text-sm transition disabled:cursor-not-allowed disabled:border-transparent disabled:bg-blush-100/60 disabled:text-ink-soft/40 disabled:line-through ${
                          startTime === s.startTime
                            ? "border-rose-500 bg-rose-500 text-white"
                            : "border-line bg-white hover:border-rose-500"
                        }`}
                      >
                        {formatTime(s.startTime)}
                      </button>
                    ))}
                  </div>
                )}
                {availability.data?.timezone && (
                  <p className="mt-3 text-xs text-ink-soft">
                    {t("book.timezone", { tz: availability.data.timezone })}
                  </p>
                )}
              </div>
            </Step>

            <Step n={5} title={t("book.step3")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("book.name")}>
                  <input
                    className="input"
                    value={contact.customerName}
                    onChange={setField("customerName")}
                    autoComplete="name"
                  />
                </Field>
                <Field label={t("book.phone")}>
                  <input
                    className="input"
                    value={contact.customerPhone}
                    onChange={setField("customerPhone")}
                    autoComplete="tel"
                    type="tel"
                  />
                </Field>
                <Field label={t("book.email")}>
                  <input
                    className="input"
                    value={contact.customerEmail}
                    onChange={setField("customerEmail")}
                    autoComplete="email"
                    type="email"
                  />
                </Field>
                <Field label={t("book.notes")}>
                  <input
                    className="input"
                    value={contact.notes}
                    onChange={setField("notes")}
                    placeholder={t("book.notesPlaceholder")}
                    maxLength={500}
                  />
                </Field>
              </div>
            </Step>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="card p-5">
              <h2 className="font-sans text-base font-semibold">
                {t("book.summary")}
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{t("book.service")}</dt>
                  <dd className="text-right">{selectedService?.title ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{t("book.design")}</dt>
                  <dd className="text-right">
                    {selectedDesign?.title ?? t("book.noDesign")}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{t("book.artist")}</dt>
                  <dd className="text-right">
                    {selectedArtist?.name ?? t("book.anyArtist")}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{t("book.date")}</dt>
                  <dd>{formatDate(date)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{t("book.time")}</dt>
                  <dd>{startTime ? formatTime(startTime) : "—"}</dd>
                </div>
              </dl>
              {selectedService && (
                <>
                  <div className={`mt-3 border-t border-line pt-3 transition-opacity ${quote.isFetching ? "opacity-60" : ""}`}>
                    {quote.data ? (
                      <PriceBreakdown price={quote.data} />
                    ) : (
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-ink-soft">{t("book.price")}</span>
                        <span className="font-medium">{formatPrice(selectedService.price)}</span>
                      </div>
                    )}
                  </div>
                  <PromoCodeBox
                    key={promo?.status === "applied" ? "applied" : "entry"}
                    applied={promoCode}
                    promo={promo}
                    loading={Boolean(promoCode) && quote.isFetching}
                    onApply={setPromoCode}
                    onRemove={() => setPromoCode("")}
                  />
                </>
              )}
              {book.isError && (
                <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {errorMessage(book.error)}
                </p>
              )}
              <button
                className="btn-primary mt-5 w-full"
                disabled={!canSubmit}
                onClick={() => book.mutate()}
              >
                {book.isPending ? (
                  <Spinner className="size-4 text-white" />
                ) : (
                  <CalendarCheck className="size-4" />
                )}
                {t("book.confirm")}
              </button>
              <p className="mt-3 text-center text-xs text-ink-soft">
                {t("book.payNote")}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
