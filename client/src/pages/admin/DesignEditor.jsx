import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Archive, ArchiveRestore, ArrowLeft, ImageUp, RefreshCw, Wand2 } from 'lucide-react';
import { designsApi, errorMessage } from '../../lib/api';
import { Field, PageLoader, ProcessingBadge, Spinner } from '../../components/ui';

const EMPTY = { name: '', description: '', category: '', tags: '', price: '', durationMinutes: 60 };
const busy = (d) => ['pending', 'processing'].includes(d?.processing?.status);

function toForm(d) {
  return {
    name: d.name,
    description: d.description ?? '',
    category: d.category ?? '',
    tags: (d.tags ?? []).join(', '),
    price: d.price,
    durationMinutes: d.durationMinutes,
  };
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

export default function DesignEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [tolerance, setTolerance] = useState(2.5);

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

  const onSaved = (d, msg) => {
    toast.success(msg);
    queryClient.setQueryData(['design', d.id], d);
    queryClient.invalidateQueries({ queryKey: ['admin-designs'] });
    queryClient.invalidateQueries({ queryKey: ['designs'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v !== '' && v != null && fd.append(k, v));
      if (file) {
        fd.append('image', file);
        fd.append('skinTolerance', tolerance);
      }
      return isNew ? designsApi.create(fd) : designsApi.update(id, fd);
    },
    onSuccess: (d) => {
      setFile(null);
      onSaved(d, isNew ? 'Uploaded. Extracting the nail art…' : file ? 'Saved. Re-extracting…' : 'Saved');
      if (isNew) navigate(`/admin/designs/${d.id}`, { replace: true });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reprocess = useMutation({
    mutationFn: () => designsApi.reprocess(id, tolerance),
    onSuccess: (d) => onSaved(d, 'Re-extracting…'),
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

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/admin/designs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Designs
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{isNew ? 'Upload design' : design.name}</h1>
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
            <AssetPanel
              title="Isolated nail art"
              caption="Background and skin removed"
              asset={design.isolatedImage}
              checker
              placeholder={processing ? 'Extracting…' : 'Not available'}
            />
            <AssetPanel
              title="Try-on texture"
              caption="Largest nail, upright and cropped"
              asset={design.swatchImage}
              placeholder={processing ? 'Extracting…' : 'Not available'}
            />
          </div>

          {design.processing?.status === 'failed' && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              Extraction failed: {design.processing.error}. Try a different skin tolerance, or upload a clearer photo.
            </p>
          )}
          {design.processing?.status === 'ready' && (
            <p className="mt-3 text-xs text-ink-soft">
              {design.processing.nailsDetected} nail(s) found · background removal: {design.processing.method} · skin
              tolerance {design.processing.skinTolerance}
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
            <ToleranceSlider value={tolerance} onChange={setTolerance} />
            <button className="btn-secondary" onClick={() => reprocess.mutate()} disabled={processing || reprocess.isPending}>
              {processing ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />} Re-extract
            </button>
          </div>
        </section>
      )}

      <form
        className="card mt-6 grid gap-5 p-5 md:grid-cols-[260px_1fr] md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <span className="label">{isNew ? 'Reference photo' : 'Replace photo'}</span>
          <label className="checker flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-line text-sm text-ink-soft hover:border-rose-500">
            {preview ? (
              <img src={preview} alt="Selected" className="size-full object-cover" />
            ) : (
              <>
                <ImageUp className="size-8 text-rose-500" />
                <span className="px-4 text-center">Click to choose a photo. A hand or background in it is fine.</span>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
              className="sr-only"
              required={isNew}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {isNew && (
            <div className="mt-4">
              <ToleranceSlider value={tolerance} onChange={setTolerance} />
            </div>
          )}
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name">
              <input className="input" required maxLength={100} value={form.name} onChange={set('name')} />
            </Field>
          </div>
          <Field label="Price">
            <input className="input" type="number" min={0} step="any" required value={form.price} onChange={set('price')} />
          </Field>
          <Field label="Duration (minutes)">
            <input className="input" type="number" min={15} max={480} step={15} value={form.durationMinutes} onChange={set('durationMinutes')} />
          </Field>
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
          <div className="flex justify-end sm:col-span-2">
            <button className="btn-primary" disabled={save.isPending}>
              {save.isPending ? <Spinner className="size-4 text-white" /> : <Wand2 className="size-4" />}
              {isNew ? 'Upload and extract' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
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
