import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Camera, Download, Eye, EyeOff, Hand, ImageUp, RotateCcw, ScanLine, Sparkles, X } from 'lucide-react';
import { designsApi, errorMessage, tryonApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Spinner } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { generateTryOn } from '../tryon/aiTryOn';
import { detectHands, getHandLandmarker } from '../tryon/handDetector';
import { adjustNail, computeNails, hitTest, isBackOfHand, refineNails } from '../tryon/nailGeometry';
import { renderScene } from '../tryon/renderNails';

const MAX_PHOTO = 1400;
const DEFAULT_SETTINGS = { opacity: 0.96, gloss: 0.6, shading: 1, lengthScale: 1, widthScale: 1 };

/** Loads an image for canvas use. Retries with a cache-buster in case a non-CORS copy is cached. */
function loadImage(url) {
  const attempt = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  return attempt(url).catch(() => attempt(`${url}${url.includes('?') ? '&' : '?'}cors=1`));
}

async function fileToCanvas(file) {
  const bitmap = await createImageBitmap(file); // applies EXIF orientation
  const scale = Math.min(1, MAX_PHOTO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

function Slider({ label, value, min, max, step, onChange, format = (v) => v.toFixed(2) }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-medium">
        {label} <span className="font-normal text-ink-soft">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-rose-500"
      />
    </label>
  );
}

export default function TryOn() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const designId = params.get('design') || '';

  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | detecting | ready | no-hands | error
  const [error, setError] = useState('');
  const [hands, setHands] = useState([]); // [{ nails, back }]
  const [swatch, setSwatch] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [adjust, setAdjust] = useState({}); // nailId -> { hidden, dx, dy, lengthScale, widthScale, rotation }
  const [selectedId, setSelectedId] = useState(null);
  const [compare, setCompare] = useState(false);
  const { user, isAdmin } = useAuth();
  const aiConfig = useQuery({ queryKey: ['tryon-config'], queryFn: tryonApi.config, staleTime: 5 * 60_000 });
  const [consent, setConsent] = useState(false);
  const [ai, setAi] = useState({ state: 'idle' }); // idle | running | done | error  (+ result, error, designName)
  const [showGuides, setShowGuides] = useState(false);

  const designs = useQuery({ queryKey: ['designs', { limit: 100 }], queryFn: () => designsApi.list({ limit: 100 }) });
  const design = designs.data?.items.find((d) => d.id === designId);

  // Start downloading the model straight away so detection is quick once a photo is chosen.
  useEffect(() => {
    getHandLandmarker().catch(() => {});
  }, []);

  // Pick the first design if none is selected.
  useEffect(() => {
    if (!designId && designs.data?.items.length) setParams({ design: designs.data.items[0].id }, { replace: true });
  }, [designId, designs.data, setParams]);

  useEffect(() => {
    if (!design?.swatchImage) return setSwatch(null);
    let cancelled = false;
    loadImage(design.swatchImage.url)
      .then((img) => !cancelled && setSwatch(img))
      .catch(() => !cancelled && setError(t('tryon.textureFail')));
    return () => {
      cancelled = true;
    };
  }, [design?.swatchImage]);

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setStatus('detecting');
    setHands([]);
    setAdjust({});
    setSelectedId(null);
    setAi({ state: 'idle' });
    try {
      const canvas = await fileToCanvas(file);
      setPhoto(canvas);
      const { landmarks, handedness } = await detectHands(canvas);
      if (!landmarks.length) {
        setStatus('no-hands');
        return;
      }
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      setHands(
        landmarks.map((lm, i) => ({
          nails: refineNails(computeNails(lm, canvas.width, canvas.height, i), pixels),
          back: isBackOfHand(lm, handedness[i]),
        })),
      );
      setStatus('ready');
    } catch (err) {
      console.error(err);
      setError(t('tryon.detectFail'));
      setStatus('error');
    }
  };

  const nails = useMemo(
    () =>
      hands
        .flatMap((h) => h.nails)
        .filter((n) => !adjust[n.id]?.hidden)
        .map((n) => adjustNail(n, adjust[n.id], settings)),
    [hands, adjust, settings],
  );

  // Re-render whenever anything changes; requestAnimationFrame coalesces rapid slider and drag updates.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    const frame = requestAnimationFrame(() => {
      canvas.width = photo.width;
      canvas.height = photo.height;
      const ctx = canvas.getContext('2d');
      if (compare) ctx.drawImage(photo, 0, 0);
      else renderScene(ctx, photo, nails, swatch, settings, { selectedId, showGuides });
    });
    return () => cancelAnimationFrame(frame);
  }, [photo, nails, swatch, settings, selectedId, showGuides, compare]);

  // ---------- pointer: select and drag nails ----------
  const toCanvas = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvasRef.current.width) / rect.width,
      y: ((e.clientY - rect.top) * canvasRef.current.height) / rect.height,
    };
  };

  const onPointerDown = (e) => {
    if (!nails.length) return;
    const p = toCanvas(e);
    const hit = [...nails].reverse().find((n) => hitTest(n, p.x, p.y));
    setSelectedId(hit?.id ?? null);
    if (hit) {
      const a = adjust[hit.id] ?? {};
      dragRef.current = { id: hit.id, start: p, dx: a.dx ?? 0, dy: a.dy ?? 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toCanvas(e);
    updateNail(drag.id, { dx: drag.dx + p.x - drag.start.x, dy: drag.dy + p.y - drag.start.y });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const updateNail = useCallback((id, patch) => setAdjust((a) => ({ ...a, [id]: { ...a[id], ...patch } })), []);

  const download = () => {
    canvasRef.current.toBlob(
      (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `try-on-${design?.name?.replace(/\W+/g, '-').toLowerCase() || 'nails'}.jpg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
      'image/jpeg',
      0.92,
    );
  };

  // Hide guides and selection in the downloaded image.
  const prepareDownload = () => {
    setSelectedId(null);
    setShowGuides(false);
    requestAnimationFrame(() => requestAnimationFrame(download));
  };

  const runAi = async () => {
    setAi({ state: 'running', stage: 'pending', designName: design?.name });
    try {
      // Uses the nails as the customer adjusted them, so the AI edits exactly what they see in the preview.
      const result = await generateTryOn({
        photo,
        nails,
        designId,
        onStatus: (stage) => setAi((a) => (a.state === 'running' ? { ...a, stage } : a)),
      });
      setAi({ state: 'done', result, designName: design?.name });
    } catch (err) {
      setAi({ state: 'error', error: errorMessage(err, 'Generation failed') });
    }
  };

  const allNails = hands.flatMap((h) => h.nails);
  const selected = allNails.find((n) => n.id === selectedId);
  const selAdj = (selected && adjust[selected.id]) || {};
  const palmWarning = status === 'ready' && hands.every((h) => !h.back);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl font-semibold">{t('tryon.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('tryon.subtitle')}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Stage */}
        <div>
          <div className="card relative flex min-h-80 items-center justify-center overflow-hidden bg-blush-100/50">
            {photo ? (
              <canvas
                ref={canvasRef}
                className={`max-h-[75vh] w-auto max-w-full touch-none ${nails.length ? 'cursor-pointer' : ''}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                aria-label={t('tryon.title')}
              />
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-3 p-10 text-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-white text-rose-500 shadow">
                  <Hand className="size-8" />
                </span>
                <span className="font-medium">{t('tryon.upload')}</span>
                <span className="max-w-xs text-sm text-ink-soft">
                  {t('tryon.uploadHint')}
                </span>
                <span className="btn-primary mt-2">
                  <ImageUp className="size-4" /> {t('tryon.choosePhoto')}
                </span>
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
              </label>
            )}

            {status === 'detecting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
                <Spinner className="size-8" />
                <p className="text-sm font-medium">{t('tryon.finding')}</p>
              </div>
            )}
          </div>

          {status === 'no-hands' && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              {t('tryon.noHands')}
            </p>
          )}
          {palmWarning && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              {t('tryon.palm')}
            </p>
          )}
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          {ai.state === 'done' && (
            <section className="card mt-4 overflow-hidden" aria-label={t('tryon.aiResult')}>
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h2 className="flex items-center gap-2 font-sans text-sm font-semibold">
                  <Sparkles className="size-4 text-rose-500" /> {t('tryon.aiResult')}{ai.designName && ` · ${ai.designName}`}
                </h2>
                <button className="btn-ghost p-1.5" onClick={() => setAi({ state: 'idle' })} aria-label="Close result">
                  <X className="size-4" />
                </button>
              </div>
              <img src={ai.result.resultImage.url} alt="AI-generated try-on" className="max-h-[75vh] w-full bg-blush-100 object-contain" />
              <div className="flex flex-wrap gap-2 p-3">
                <a className="btn-secondary" href={ai.result.resultImage.url} download target="_blank" rel="noreferrer">
                  <Download className="size-4" /> {t('tryon.saveImage')}
                </a>
                {design && (
                  <Link to={`/book?design=${design.id}`} className="btn-primary ml-auto">
                    <CalendarPlus className="size-4" /> {t('tryon.bookLook')}
                  </Link>
                )}
              </div>
              <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">
                {t('tryon.aiDisclaimer')}
              </p>
            </section>
          )}

          {photo && (
            <div className="mt-4 flex flex-wrap gap-2">
              <label className="btn-secondary cursor-pointer">
                <Camera className="size-4" /> {t('tryon.newPhoto')}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
              </label>
              <button
                className="btn-secondary select-none"
                onPointerDown={() => setCompare(true)}
                onPointerUp={() => setCompare(false)}
                onPointerLeave={() => setCompare(false)}
                onKeyDown={(e) => e.key === ' ' && setCompare(true)}
                onKeyUp={() => setCompare(false)}
              >
                {compare ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {t('tryon.compare')}
              </button>
              <button className={`btn-secondary ${showGuides ? 'border-rose-500 text-rose-600' : ''}`} onClick={() => setShowGuides(!showGuides)}>
                <ScanLine className="size-4" /> {t('tryon.guides')}
              </button>
              <button className="btn-secondary" onClick={prepareDownload} disabled={status !== 'ready'}>
                <Download className="size-4" /> {t('tryon.saveImage')}
              </button>
              {design && (
                <Link to={`/book?design=${design.id}`} className="btn-primary ml-auto">
                  <CalendarPlus className="size-4" /> {t('tryon.bookLook')}
                </Link>
              )}
            </div>
          )}
          {status === 'ready' && (
            <p className="mt-3 text-xs text-ink-soft">{t('tryon.tip')}</p>
          )}
        </div>

        {/* Controls */}
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-3 font-sans text-sm font-semibold">{t('tryon.design')}</h2>
            {designs.isLoading ? (
              <Spinner />
            ) : designs.data?.items.length ? (
              <div className="grid grid-cols-4 gap-2">
                {designs.data.items.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setParams({ design: d.id }, { replace: true })}
                    title={d.name}
                    className={`aspect-[2/3] overflow-hidden rounded-[40%/30%] ring-2 ring-offset-2 transition ${
                      d.id === designId ? 'ring-rose-500' : 'ring-transparent hover:ring-rose-500/40'
                    }`}
                  >
                    <img src={d.swatchImage?.url} alt={d.name} className="size-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">{t('tryon.noDesigns')}</p>
            )}
            {design && <p className="mt-3 text-sm font-medium">{design.name}</p>}
          </section>

          {aiConfig.data && !aiConfig.data.enabled && isAdmin && (
            <section className="card space-y-1.5 border-dashed border-amber-400 bg-amber-50 p-4 text-xs text-amber-900">
              <h2 className="flex items-center gap-2 font-sans text-sm font-semibold">
                <Sparkles className="size-4" /> AI photo is not set up (only admins see this)
              </h2>
              <p>
                Add <code className="rounded bg-white px-1">REPLICATE_API_TOKEN=…</code> to <code className="rounded bg-white px-1">server/.env</code> and
                restart the API server. See "AI try-on (Replicate)" in the README.
              </p>
            </section>
          )}

          {aiConfig.data?.enabled && (
            <section className="card space-y-3 border-rose-500/30 p-4">
              <h2 className="flex items-center gap-2 font-sans text-sm font-semibold">
                <Sparkles className="size-4 text-rose-500" /> {t('tryon.aiTitle')}
              </h2>
              <p className="text-xs text-ink-soft">
                {t('tryon.aiDesc')}
              </p>
              {!user ? (
                <p className="text-sm">
                  <Link to="/login" state={{ from: '/try-on' + (designId ? `?design=${designId}` : '') }} className="font-medium text-rose-600 hover:underline">
                    {t('tryon.aiLogin')}
                  </Link>{' '}
                  {t('tryon.aiLoginTail')}
                </p>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-xs text-ink-soft">
                    <input type="checkbox" className="mt-0.5 accent-rose-500" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>
                      {t('tryon.aiConsent', { days: aiConfig.data.retentionDays })}
                    </span>
                  </label>
                  <button
                    className="btn-primary w-full"
                    disabled={!consent || status !== 'ready' || !nails.length || !design || ai.state === 'running'}
                    onClick={runAi}
                  >
                    {ai.state === 'running' ? <Spinner className="size-4 text-white" /> : <Sparkles className="size-4" />}
                    {ai.state === 'running' ? (ai.stage === 'processing' ? t('tryon.aiGenerating') : t('tryon.aiStarting')) : t('tryon.aiGenerate')}
                  </button>
                  {ai.state === 'error' && <p className="rounded-xl bg-red-50 p-2.5 text-xs text-red-700">{ai.error}</p>}
                  {status !== 'ready' && <p className="text-xs text-ink-soft">{t('tryon.aiUploadFirst')}</p>}
                </>
              )}
            </section>
          )}

          <section className="card space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-sm font-semibold">{t('tryon.instant')}</h2>
              <button className="text-xs text-ink-soft hover:text-ink" onClick={() => setSettings(DEFAULT_SETTINGS)}>
                {t('common.reset')}
              </button>
            </div>
            <Slider label={t('tryon.length')} value={settings.lengthScale} min={0.6} max={1.6} step={0.02} onChange={(v) => setSettings({ ...settings, lengthScale: v })} />
            <Slider label={t('tryon.width')} value={settings.widthScale} min={0.6} max={1.4} step={0.02} onChange={(v) => setSettings({ ...settings, widthScale: v })} />
            <Slider label={t('tryon.gloss')} value={settings.gloss} min={0} max={1} step={0.05} onChange={(v) => setSettings({ ...settings, gloss: v })} />
            <Slider label={t('tryon.lighting')} value={settings.shading} min={0} max={1.5} step={0.05} onChange={(v) => setSettings({ ...settings, shading: v })} />
            <Slider label={t('tryon.opacity')} value={settings.opacity} min={0.3} max={1} step={0.02} onChange={(v) => setSettings({ ...settings, opacity: v })} />
          </section>

          {status === 'ready' && (
            <section className="card p-4">
              <h2 className="mb-3 font-sans text-sm font-semibold">{t('tryon.nails')}</h2>
              <div className="flex flex-wrap gap-1.5">
                {allNails.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    className={`rounded-full px-2.5 py-1 text-xs transition ${
                      n.id === selectedId ? 'bg-ink text-white' : 'border border-line bg-white'
                    } ${adjust[n.id]?.hidden ? 'line-through opacity-50' : ''}`}
                  >
                    {hands.length > 1 && `${Number(n.id[0]) + 1}·`}
                    {t(`tryon.fingers.${n.finger}`)}
                  </button>
                ))}
              </div>

              {selected && (
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-rose-500"
                      checked={!selAdj.hidden}
                      onChange={(e) => updateNail(selected.id, { hidden: !e.target.checked })}
                    />
                    {t('tryon.showOnNail')}
                  </label>
                  <Slider label={t('tryon.length')} value={selAdj.lengthScale ?? 1} min={0.5} max={1.8} step={0.02} onChange={(v) => updateNail(selected.id, { lengthScale: v })} />
                  <Slider label={t('tryon.width')} value={selAdj.widthScale ?? 1} min={0.5} max={1.6} step={0.02} onChange={(v) => updateNail(selected.id, { widthScale: v })} />
                  <Slider
                    label={t('tryon.rotation')}
                    value={selAdj.rotation ?? 0}
                    min={-45}
                    max={45}
                    step={1}
                    format={(v) => `${v}°`}
                    onChange={(v) => updateNail(selected.id, { rotation: v })}
                  />
                  <button
                    className="btn-ghost w-full"
                    onClick={() => setAdjust((a) => ({ ...a, [selected.id]: undefined }))}
                  >
                    <RotateCcw className="size-4" /> {t('tryon.resetNail')}
                  </button>
                </div>
              )}
            </section>
          )}

          <p className="px-1 text-xs text-ink-soft">
            {t('tryon.privacy')}
          </p>
        </aside>
      </div>
    </div>
  );
}
