import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Archive, ArchiveRestore, ArrowLeft, Crop, ImageUp, RefreshCw, Scissors, Wand2 } from 'lucide-react';
import { designsApi, errorMessage } from '../../lib/api';
import { Field, PageLoader, ProcessingBadge, Spinner } from '../../components/ui';
import ImageCropModal, { loadImage } from '../../components/ImageCropModal';
import DesignSegmenter, { FINGERS, ROLE_LABELS, SEGMENT_MODES } from '../../components/DesignSegmenter';
import { mirrorTile } from '../../tryon/renderNails';

const EMPTY = { title: '', description: '', category: '', tags: '' };
const busy = (d) => ['pending', 'processing'].includes(d?.processing?.status);
const MODES = [{ id: 'auto', label: 'Auto-extract', sub: 'Find the nails in a hand photo', icon: Wand2 }, ...SEGMENT_MODES];
const TYPE_LABELS = { single: 'Single design', set: 'Full set', pattern: 'Pattern' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function toForm(d) {
  return {
    title: d.title,
    description: d.description ?? '',
    category: d.category ?? '',
    tags: (d.tags ?? []).join(', '),
  };
}

function segmentSummary(segments) {
  const fingers = segments.filter((s) => FINGERS.includes(s.role)).length;
  const variations = segments.filter((s) => s.role === 'variation').length;
  return [fingers && plural(fingers, 'finger'), variations && plural(variations, 'variation')].filter(Boolean).join(' · ') || '1 crop';
}

function AssetPanel({ title, caption, asset, checker, placeholder }) {
  return (
    <figure className="card overflow-hidden">
      <div className={`flex aspect-square items-center justify-center p-3 ${checker ? 'checker' : 'bg-blush-100'}`}>
        {asset ? (
          <img src={asset.url} alt={title} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-center text-xs text-ink-soft">{placeholder}</span>
        )}
      </div>
      <figcaption className="border-t border-line p-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-ink-soft">{caption}</p>
      </figcaption>
    </figure>
  );
}

/** A full set's five finger textures, thumb to pinky; fingers without their own art show the fallback. */
function FingerStrip({ design }) {
  return (
    <figure className="card overflow-hidden sm:col-span-2">
      <div className="grid grid-cols-5 items-end gap-3 bg-blush-100 px-4 pt-6 pb-3 sm:h-[calc(100%-4.25rem)] sm:content-center">
        {FINGERS.map((f) => {
          const url = design.fingerTextures?.[f];
          return (
            <div key={f} className="flex flex-col items-center gap-2">
              {/* Each texture keeps its own proportions inside a nail-shaped frame, so a long crop can't stretch the row. */}
              <div className="flex aspect-[2/3] w-full items-center justify-center">
                {url ? (
                  <img src={url} alt={`${ROLE_LABELS[f]} texture`} className="max-h-full max-w-full rounded-[40%/30%] object-contain shadow-md" />
                ) : (
                  <span className="flex size-full items-center justify-center rounded-[40%/30%] border border-dashed border-line p-1 text-center text-[10px] text-ink-soft">
                    Uses main texture
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium text-ink-soft">{ROLE_LABELS[f]}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="border-t border-line p-3">
        <p className="text-sm font-medium">Finger textures</p>
        <p className="text-xs text-ink-soft">Mapped onto each finger in the try-on. The middle nail is the main texture.</p>
      </figcaption>
    </figure>
  );
}

/** The pattern texture mirrored and repeated, as the try-on spreads it across a nail. */
function PatternTilePanel({ url }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    loadImage(url)
      .then((img) => {
        const out = ref.current;
        if (cancelled || !out) return;
        out.width = 400;
        out.height = 400;
        const ctx = out.getContext('2d');
        const k = 130 / img.naturalWidth;
        ctx.scale(k, k);
        ctx.fillStyle = ctx.createPattern(mirrorTile(img), 'repeat');
        ctx.fillRect(0, 0, 400 / k, 400 / k);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <figure className="card overflow-hidden">
      <div className="aspect-square bg-blush-100 p-3">
        <canvas ref={ref} className="size-full rounded-nail-sm" />
      </div>
      <figcaption className="border-t border-line p-3">
        <p className="text-sm font-medium">Seamless tiling</p>
        <p className="text-xs text-ink-soft">Mirrored at the edges so it repeats without seams</p>
      </figcaption>
    </figure>
  );
}

/** How an uploaded photo becomes try-on textures. Choosing a hand-segmenting mode opens the segmenter. */
function ModePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Processing">
      {MODES.map((m) => {
        const on = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m.id)}
            className={`pill flex items-start gap-2 border p-2.5 text-left ${
              on ? 'pill-active border-rose-500 bg-rose-500/10 text-rose-700' : 'border-line bg-white/60 text-ink-soft hover:border-rose-500/50 hover:text-ink'
            }`}
          >
            <m.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">{m.label}</span>
              <span className="block text-[10px] leading-snug opacity-80">{m.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function DesignEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [tolerance, setTolerance] = useState(2.5);
  const [editingTexture, setEditingTexture] = useState(false);
  // How the chosen photo is processed, and the boxes drawn for it in the segmenter.
  const [mode, setMode] = useState('auto');
  const [segments, setSegments] = useState(null);
  // null, or { target: 'upload' | 'existing', source, initialMode, initialSegments }
  const [segmenter, setSegmenter] = useState(null);

  const { data: design, isLoading } = useQuery({
    queryKey: ['design', id],
    queryFn: () => designsApi.get(id),
    enabled: !isNew,
    refetchInterval: (q) => (busy(q.state.data) ? 1500 : false),
  });

  useEffect(() => {
    if (design) {
      setForm(toForm(design));
      if (design.processing?.skinTolerance != null) setTolerance(design.processing.skinTolerance);
    }
    // Only reset the form when a different design loads, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design?.id]);

  // When processing finishes, refresh the list too.
  useEffect(() => {
    if (design && !busy(design)) queryClient.invalidateQueries({ queryKey: ['admin-designs'] });
  }, [design?.processing?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!file) return setPreview('');
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onSaved = (d, msg, variants = []) => {
    toast.success(variants.length ? `${msg} ${plural(variants.length, 'variation')} added as separate designs.` : msg);
    queryClient.setQueryData(['design', d.id], d);
    queryClient.invalidateQueries({ queryKey: ['admin-designs'] });
    queryClient.invalidateQueries({ queryKey: ['designs'] });
  };

  const openUploadSegmenter = (nextMode, source = file) =>
    setSegmenter({ target: 'upload', source, initialMode: nextMode, initialSegments: nextMode === mode ? segments : null });

  const chooseMode = (nextMode) => {
    if (nextMode === 'auto') {
      setMode('auto');
      setSegments(null);
    } else if (file) {
      openUploadSegmenter(nextMode);
    } else {
      setMode(nextMode);
      setSegments(null);
    }
  };

  const chooseFile = (next) => {
    setFile(next);
    setSegments(null);
    if (next && mode !== 'auto') setSegmenter({ target: 'upload', source: next, initialMode: mode, initialSegments: null });
  };

  const save = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v !== '' && v != null && fd.append(k, v));
      if (file) {
        fd.append('image', file);
        fd.append('mode', mode);
        if (mode === 'auto') fd.append('skinTolerance', tolerance);
        else fd.append('segments', JSON.stringify(segments));
      }
      return designsApi.save(isNew ? null : id, fd);
    },
    onSuccess: ({ design: d, variants }) => {
      const manual = file && mode !== 'auto';
      setFile(null);
      setSegments(null);
      onSaved(d, isNew ? (manual ? 'Design saved.' : 'Uploaded. Extracting the nail art…') : file ? (manual ? 'Saved.' : 'Saved. Re-extracting…') : 'Saved', variants);
      if (isNew) navigate(`/admin/designs/${d.id}`, { replace: true });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const resegment = useMutation({
    mutationFn: (body) => designsApi.segment(id, body),
    onSuccess: ({ design: d, variants }) => {
      setSegmenter(null);
      onSaved(d, 'Segments saved. The try-on uses the new textures.', variants);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reprocess = useMutation({
    mutationFn: () => designsApi.reprocess(id, tolerance),
    onSuccess: (d) => onSaved(d, 'Re-extracting…'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const saveTexture = useMutation({
    mutationFn: (textureFile) => designsApi.updateTexture(id, textureFile),
    onSuccess: (d) => {
      setEditingTexture(false);
      onSaved(d, 'Texture saved. The try-on now uses your edited version.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleActive = useMutation({
    mutationFn: () => (design.isActive ? designsApi.archive(id) : designsApi.update(id, { isActive: true })),
    onSuccess: (d) => onSaved(d, d.isActive ? 'Restored' : 'Archived'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!isNew && isLoading) return <PageLoader />;
  if (!isNew && !design) {
    return (
      <p className="text-ink-soft">
        Design not found. <Link to="/admin/designs" className="text-rose-600 hover:underline">Back to designs</Link>
      </p>
    );
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const processing = busy(design);
  const ready = !isNew && design.processing?.status === 'ready';
  const manual = !isNew && design.processing?.method === 'manual';
  const type = design?.designType ?? 'single';
  const textureReady = ready && Boolean(design.swatchImage) && type !== 'set';
  const needsSegments = file && mode !== 'auto' && !segments?.length;

  const editSegments = () =>
    setSegmenter({
      target: 'existing',
      source: design.originalImage.url,
      // Auto-extracted designs have no boxes yet; a full set is the usual reason to start segmenting.
      initialMode: design.segments?.length ? type : 'set',
      initialSegments: design.segments?.length ? design.segments : null,
    });

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/admin/designs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Nail designs
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">{isNew ? 'Upload design' : design.title}</h1>
          {!isNew && (
            <p className="mt-1 text-sm text-ink-soft">
              {TYPE_LABELS[type]}
              {design.variantOf && (
                <>
                  {' '}· split out of{' '}
                  <Link to={`/admin/designs/${design.variantOf}`} className="text-rose-600 hover:underline">
                    a full set
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
        {!isNew && (
          <div className="flex items-center gap-3">
            <ProcessingBadge status={design.processing?.status} />
            <button className="btn-secondary" onClick={() => toggleActive.mutate()} disabled={toggleActive.isPending}>
              {design.isActive ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
              {design.isActive ? 'Archive' : 'Restore'}
            </button>
          </div>
        )}
      </div>

      {!isNew && (
        <section className="mt-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <AssetPanel title="Reference photo" caption="As uploaded" asset={design.originalImage} />
            {type === 'set' ? (
              <FingerStrip design={design} />
            ) : (
              <>
                {type === 'pattern' && design.textureUrl ? (
                  <PatternTilePanel url={design.textureUrl} />
                ) : (
                  <AssetPanel
                    title="Isolated nail art"
                    caption={manual ? 'Not needed: cropped by hand' : 'Background and skin removed'}
                    asset={design.isolatedImage}
                    checker
                    placeholder={processing ? 'Extracting…' : manual ? 'Cropped by hand' : 'Not available'}
                  />
                )}
                <AssetPanel
                  title={type === 'pattern' ? 'Pattern swatch' : 'Try-on texture'}
                  caption={type === 'pattern' ? 'Tiled across every nail' : manual ? 'Your crop, at the 2:3 nail shape' : 'Largest nail, upright and cropped'}
                  asset={design.swatchImage}
                  placeholder={processing ? 'Extracting…' : 'Not available'}
                />
              </>
            )}
          </div>

          {design.processing?.status === 'failed' && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              Extraction failed: {design.processing.error}. Try a different skin tolerance, upload a clearer photo, or segment it by hand with Edit
              segments.
            </p>
          )}
          {design.textureEditedAt && (
            <p className="mt-3 rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-700">
              Texture hand-edited on {new Date(design.textureEditedAt).toLocaleString()}. Re-extracting will replace it.
            </p>
          )}
          {ready && (
            <p className="mt-3 text-xs text-ink-soft">
              {manual ? (
                <>Cropped by hand · {segmentSummary(design.segments ?? [])}</>
              ) : (
                <>
                  {design.processing.nailsDetected} nail(s) found · background removal: {design.processing.method} · skin tolerance{' '}
                  {design.processing.skinTolerance}
                </>
              )}
              {design.dominantColor && (
                <>
                  {' '}· main colour{' '}
                  <span className="inline-block size-3 rounded-full align-middle ring-1 ring-line" style={{ background: design.dominantColor }} />{' '}
                  {design.dominantColor}
                </>
              )}
            </p>
          )}

          <div className="card mt-4 flex flex-wrap items-end gap-4 p-4">
            {!manual && <ToleranceSlider value={tolerance} onChange={setTolerance} />}
            <button className="btn-primary" onClick={editSegments} disabled={processing || resegment.isPending || !design.originalImage}>
              <Scissors className="size-4" /> Edit segments
            </button>
            {type !== 'set' && (
              <button className="btn-secondary" onClick={() => setEditingTexture(true)} disabled={!textureReady || saveTexture.isPending}>
                <Crop className="size-4" /> Edit texture
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={() => {
                const warning = manual
                  ? 'Auto-extraction replaces your hand-drawn segments with a single texture found automatically. Continue?'
                  : design.textureEditedAt
                    ? 'Re-extracting replaces your hand-edited texture. Continue?'
                    : null;
                if (warning && !window.confirm(warning)) return;
                reprocess.mutate();
              }}
              disabled={processing || reprocess.isPending}
            >
              {processing ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />} {manual ? 'Auto-extract instead' : 'Re-extract'}
            </button>
          </div>
        </section>
      )}

      <form
        className="card mt-6 grid gap-5 p-5 md:grid-cols-[280px_1fr] md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-4">
          <div>
            <span className="label">{isNew ? 'Reference photo' : 'Replace photo'}</span>
            <label className="checker flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl border-2 border-dashed border-line text-sm text-ink-soft hover:border-rose-500">
              {preview ? (
                <img src={preview} alt="Selected" className="size-full object-cover" />
              ) : (
                <>
                  <ImageUp className="size-8 text-rose-500" />
                  <span className="px-4 text-center">Click to choose a photo: a hand, a full press-on set, a single nail or a flat pattern.</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                className="sr-only"
                required={isNew}
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {(isNew || file) && (
            <div>
              <span className="label">Processing</span>
              <ModePicker value={mode} onChange={chooseMode} />
              {mode === 'auto' ? (
                <div className="mt-4">
                  <ToleranceSlider value={tolerance} onChange={setTolerance} />
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-nail-sm bg-blush-100/70 px-3 py-2 text-xs">
                  <span className={segments?.length ? 'text-ink' : 'text-ink-soft'}>
                    {segments?.length ? segmentSummary(segments) : file ? 'No boxes drawn yet' : 'Choose a photo, then draw the boxes'}
                  </span>
                  {file && (
                    <button type="button" className="font-medium text-rose-600 hover:underline" onClick={() => openUploadSegmenter(mode)}>
                      {segments?.length ? 'Edit boxes' : 'Draw boxes'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title">
              <input className="input" required maxLength={100} value={form.title} onChange={set('title')} />
            </Field>
          </div>
          <Field label="Category">
            <input className="input" placeholder="e.g. french, chrome, floral" value={form.category} onChange={set('category')} />
          </Field>
          <Field label="Tags" hint="Comma-separated">
            <input className="input" placeholder="pink, glitter" value={form.tags} onChange={set('tags')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea className="input min-h-28" maxLength={1000} value={form.description} onChange={set('description')} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
            {needsSegments && <span className="text-xs text-ink-soft">Draw the boxes before saving.</span>}
            <button className="btn-primary" disabled={save.isPending || needsSegments}>
              {save.isPending ? <Spinner className="size-4 text-white" /> : <Wand2 className="size-4" />}
              {isNew ? (mode === 'auto' ? 'Upload and extract' : 'Upload and save') : 'Save changes'}
            </button>
          </div>
        </div>
      </form>

      {segmenter && (
        <DesignSegmenter
          key={`${segmenter.target}-${segmenter.initialMode}`}
          source={segmenter.source}
          initialMode={segmenter.initialMode}
          initialSegments={segmenter.initialSegments}
          saving={resegment.isPending}
          onCancel={() => setSegmenter(null)}
          onApply={(result) => {
            if (segmenter.target === 'existing') return resegment.mutate(result);
            setMode(result.mode);
            setSegments(result.segments);
            setSegmenter(null);
          }}
        />
      )}
      {editingTexture && textureReady && (
        <ImageCropModal
          file={design.swatchImage.url}
          title="Texture editor"
          description="Zoom in and drag to crop away any leftover skin or background at the edges. The cropped area becomes the pattern used in the virtual try-on."
          useNaturalAspect
          aspects={[
            { label: 'Original', value: design.swatchImage.width && design.swatchImage.height ? design.swatchImage.width / design.swatchImage.height : 2 / 3 },
            { label: '2:3', value: 2 / 3 },
            { label: '3:4', value: 3 / 4 },
            { label: '1:1', value: 1 },
          ]}
          output={{ type: 'image/png', ext: 'png' }}
          applyLabel="Save texture"
          onCancel={() => setEditingTexture(false)}
          onApply={(cropped) => saveTexture.mutate(cropped)}
        />
      )}
    </div>
  );
}

function ToleranceSlider({ value, onChange }) {
  return (
    <label className="block min-w-56 flex-1">
      <span className="label flex justify-between">
        Skin removal <span className="font-normal text-ink-soft">{Number(value) === 0 ? 'off' : Number(value).toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={5}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-rose-500"
      />
      <span className="flex justify-between text-xs text-ink-soft">
        <span>Off (nude polish)</span>
        <span>Aggressive</span>
      </span>
    </label>
  );
}
