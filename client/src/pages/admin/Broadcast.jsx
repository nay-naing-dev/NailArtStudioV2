import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Mail, Megaphone, Send, Users, X } from 'lucide-react';
import { broadcastApi, errorMessage } from '../../lib/api';
import { ErrorState, Field, Spinner } from '../../components/ui';
import { GridBackdrop } from '../../components/GridBackdrop';

const SUBJECT_MAX = 150;
const MESSAGE_MAX = 10000;
const EMPTY = { subject: '', messageContent: '' };

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Centered dialog over a blurred backdrop. Escape and backdrop clicks call onClose. */
function Modal({ label, onClose, children }) {
  const panelRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panelRef.current?.querySelector('[data-autofocus]')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={panelRef} className="card relative isolate w-full max-w-md overflow-hidden bg-blush-50 p-6 text-center shadow-2xl md:p-8">
        <GridBackdrop />
        <button className="btn-ghost pill absolute top-3 right-3 p-2" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

function ModalIcon({ icon: Icon, tone = 'rose' }) {
  const tones = { rose: 'bg-blush-100 text-rose-600', ok: 'bg-emerald-50 text-emerald-600', bad: 'bg-red-50 text-red-600' };
  return (
    <span className={`mx-auto mb-4 flex size-14 items-center justify-center rounded-nail ${tones[tone]}`}>
      <Icon className="size-7" aria-hidden />
    </span>
  );
}

/** Roughly how the email will look in a customer's inbox. */
function EmailPreview({ studioName, subject, message }) {
  const paragraphs = message.trim() ? message.trim().split(/\n\s*\n/) : [];
  return (
    <div className="rounded-nail border border-line bg-white p-5 shadow-sm">
      <p className="text-[11px] font-medium tracking-[0.2em] text-rose-600 uppercase">{studioName}</p>
      <h3 className={`mt-1 text-lg font-semibold break-words ${subject ? '' : 'text-ink-soft/50'}`}>{subject || 'Your subject line'}</h3>
      <div className="mt-3 max-h-72 space-y-3 overflow-y-auto text-sm leading-relaxed break-words whitespace-pre-line">
        {paragraphs.length ? (
          paragraphs.map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <p className="text-ink-soft/50">Your announcement, promo code or studio news appears here.</p>
        )}
      </div>
      <p className="mt-4 border-t border-line pt-3 text-[11px] text-ink-soft">
        You&rsquo;re receiving this because you have an account with {studioName}.
      </p>
    </div>
  );
}

export default function Broadcast() {
  const [form, setForm] = useState(EMPTY);
  // null | 'confirm' | { ok: true, result } | { ok: false, message }
  const [dialog, setDialog] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const audience = useQuery({ queryKey: ['admin-broadcast-audience'], queryFn: broadcastApi.audience });
  const customers = audience.data?.customers ?? 0;

  const send = useMutation({
    mutationFn: () => broadcastApi.send({ subject: form.subject.trim(), messageContent: form.messageContent.trim() }),
    onSuccess: (result) => {
      setDialog({ ok: true, result });
      setForm(EMPTY);
    },
    onError: (err) => setDialog({ ok: false, message: errorMessage(err, "The broadcast couldn't be sent.") }),
  });

  const filled = form.subject.trim() && form.messageContent.trim();
  const blocked = !audience.data?.emailEnabled || customers === 0;
  const closeDialog = useCallback(() => setDialog(null), []);

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-3xl font-semibold">Email broadcast</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Send an announcement, promo code or studio news to every registered customer. Each customer gets their own copy.
        </p>
      </div>

      {audience.isError ? (
        <div className="mt-6">
          <ErrorState message="Couldn't load your customer list." onRetry={audience.refetch} />
        </div>
      ) : (
        <form
          className="card relative isolate mt-6 overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault();
            setDialog('confirm');
          }}
        >
          <GridBackdrop />
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="space-y-5 p-5 md:p-8">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-nail-sm bg-blush-100 text-rose-600">
                  <Megaphone className="size-5" aria-hidden />
                </span>
                <h2 className="font-sans text-base font-semibold">Customer announcement</h2>
              </div>

              {audience.data && !audience.data.emailEnabled && (
                <p className="flex gap-2 rounded-nail-sm bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200" role="alert">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Email isn&rsquo;t set up yet. Add SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM to the server&rsquo;s .env, then restart it.
                </p>
              )}

              <Field label="Subject line">
                <input
                  className="input"
                  required
                  maxLength={SUBJECT_MAX}
                  value={form.subject}
                  onChange={set('subject')}
                  disabled={send.isPending}
                  placeholder="e.g. Thadingyut glow-up: 15% off all gel sets"
                />
              </Field>

              <Field
                label="Message"
                hint={`Plain text. Leave a blank line to start a new paragraph. ${form.messageContent.length.toLocaleString()} / ${MESSAGE_MAX.toLocaleString()}`}
              >
                <textarea
                  className="input min-h-64 resize-y leading-relaxed"
                  required
                  maxLength={MESSAGE_MAX}
                  value={form.messageContent}
                  onChange={set('messageContent')}
                  disabled={send.isPending}
                  placeholder={'Hi lovely,\n\nOur festival collection is here! Book before 31 October and use code GLOW15 at checkout.\n\nSee you soon,\nThe studio team'}
                />
              </Field>
            </div>

            <aside className="flex flex-col gap-5 border-t border-line bg-blush-100/40 p-5 md:p-8 lg:border-t-0 lg:border-l">
              <div className="flex items-center gap-3">
                <Users className="size-5 text-rose-600" aria-hidden />
                <p className="text-sm">
                  {audience.isLoading ? (
                    <Spinner className="size-4" />
                  ) : (
                    <>
                      Goes to <strong className="font-semibold">{plural(customers, 'customer')}</strong>
                    </>
                  )}
                </p>
              </div>

              <div>
                <p className="label flex items-center gap-2">
                  <Mail className="size-4 text-ink-soft" aria-hidden /> Preview
                </p>
                <EmailPreview studioName={audience.data?.studioName ?? 'Nail Studio'} subject={form.subject.trim()} message={form.messageContent} />
              </div>

              <button className="btn-primary btn-lg mt-auto w-full px-6" disabled={!filled || blocked || send.isPending}>
                {send.isPending ? (
                  <>
                    <Spinner className="size-5 text-white" /> Sending to {plural(customers, 'customer')}…
                  </>
                ) : (
                  <>
                    <Send className="size-5" /> Send Broadcast to All Customers
                  </>
                )}
              </button>
              {!audience.isLoading && customers === 0 && (
                <p className="-mt-2 text-center text-xs text-ink-soft">No customers have registered yet.</p>
              )}
            </aside>
          </div>
        </form>
      )}

      {dialog === 'confirm' && (
        <Modal label="Confirm broadcast" onClose={closeDialog}>
          <ModalIcon icon={Send} />
          <h2 className="text-xl font-semibold">Send to {plural(customers, 'customer')}?</h2>
          <p className="mt-2 text-sm break-words text-ink-soft">
            &ldquo;{form.subject.trim()}&rdquo; will be emailed right away. This can&rsquo;t be undone.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button className="btn-ghost" onClick={closeDialog}>
              Cancel
            </button>
            <button
              className="btn-primary"
              data-autofocus
              onClick={() => {
                setDialog(null);
                send.mutate();
              }}
            >
              <Send className="size-4" /> Yes, send it
            </button>
          </div>
        </Modal>
      )}

      {dialog?.ok === true && (
        <Modal label="Broadcast sent" onClose={closeDialog}>
          <ModalIcon icon={CircleCheck} tone="ok" />
          <h2 className="text-xl font-semibold">Broadcast sent</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Delivered to {dialog.result.sent} of {plural(dialog.result.total, 'customer')}.
          </p>
          {dialog.result.failed > 0 && (
            <div className="mt-4 rounded-nail-sm bg-amber-50 p-3 text-left text-xs text-amber-800 ring-1 ring-amber-200">
              <p className="font-medium">{plural(dialog.result.failed, 'address')} couldn&rsquo;t be reached:</p>
              <ul className="mt-1 max-h-32 overflow-y-auto">
                {dialog.result.failedEmails.map((email) => (
                  <li key={email} className="truncate">
                    {email}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn-primary mt-6" data-autofocus onClick={closeDialog}>
            Done
          </button>
        </Modal>
      )}

      {dialog?.ok === false && (
        <Modal label="Broadcast failed" onClose={closeDialog}>
          <ModalIcon icon={CircleAlert} tone="bad" />
          <h2 className="text-xl font-semibold">Broadcast not sent</h2>
          <p className="mt-2 text-sm break-words text-ink-soft">{dialog.message}</p>
          <p className="mt-2 text-xs text-ink-soft">Your message is still in the form, so you can try again.</p>
          <button className="btn-secondary mt-6" data-autofocus onClick={closeDialog}>
            Back to message
          </button>
        </Modal>
      )}
    </div>
  );
}
