import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Check } from "lucide-react";
import {
  appointmentsApi,
  artistsApi,
  designsApi,
  errorMessage,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatPrice, formatTime, isoDate } from "../lib/format";
import { GridBackdrop } from "../components/GridBackdrop";
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

export default function Book() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
  const selectedDesign = designs.data?.items.find((d) => d.id === designId);

  useEffect(() => setStartTime(""), [date]);

  const book = useMutation({
    mutationFn: () =>
      appointmentsApi.create({
        designId: designId || undefined,
        artistId: artistId || undefined,
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
            {booked.design && <> · {booked.design.name}</>}
            {booked.artist && <> · {booked.artist.name}</>}
          </p>
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
            <Link to="/designs" className="btn-secondary">
              {t("book.backToDesigns")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit =
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
              <div className="flex gap-3 overflow-x-auto pb-2">
                <button
                  onClick={() => setDesignId("")}
                  className={`flex h-28 w-24 shrink-0 items-center justify-center rounded-2xl border-2 p-2 text-center text-xs transition ${
                    !designId
                      ? "border-rose-500 bg-blush-100"
                      : "border-line bg-white hover:border-rose-500/50"
                  }`}
                >
                  {t("book.decide")}
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
                    title={d.name}
                  >
                    <img
                      src={d.originalImage?.url}
                      alt=""
                      className="h-20 w-full object-cover"
                    />
                    <span className="block truncate bg-white px-1.5 py-1 text-xs">
                      {d.name}
                    </span>
                  </button>
                ))}
              </div>
            </Step>

            <Step n={2} title={t("book.stepArtist")}>
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

            <Step n={3} title={t("book.step2")}>
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

            <Step n={4} title={t("book.step3")}>
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
                  <dt className="text-ink-soft">{t("book.design")}</dt>
                  <dd className="text-right">
                    {selectedDesign?.name ?? t("book.decide")}
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
                {selectedDesign && (
                  <div className="flex justify-between gap-4 border-t border-line pt-3">
                    <dt className="text-ink-soft">{t("book.price")}</dt>
                    <dd className="font-medium">
                      {formatPrice(selectedDesign.price)}
                    </dd>
                  </div>
                )}
              </dl>
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
