import { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Check, X, ZoomIn, ZoomOut } from 'lucide-react';
import { GridBackdrop } from './GridBackdrop';
import { Spinner } from './ui';

const ASPECTS = [
  { label: '4:5', value: 4 / 5 },
  { label: '1:1', value: 1 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
];
const MAX_OUTPUT_PX = 2000;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Stored textures live on another origin; fetching them as a blob keeps the canvas export untainted.
const toBlobUrl = async (source) => {
  if (typeof source !== 'string') return URL.createObjectURL(source);
  const res = await fetch(source, { cache: 'no-cache', mode: 'cors' });
  if (!res.ok) throw new Error('Could not load the image');
  return URL.createObjectURL(await res.blob());
};

/** Draws the chosen pixel area of the image onto a canvas and returns it as a JPEG File. */
async function cropToFile(src, area, fileName, { type, ext, quality }) {
  const img = await loadImage(src);
  const scale = Math.min(1, MAX_OUTPUT_PX / Math.max(area.width, area.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);
  canvas.getContext('2d').drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('Could not export the cropped image');
  return new File([blob], fileName.replace(/\.\w+$/, '') + '-cropped.' + ext, { type });
}

/**
 * Modal for choosing the exact area of a photo to showcase: drag to move, slider/scroll to zoom, pick an aspect ratio.
 * onApply(file, crop) receives the cropped JPEG plus the crop parameters (in pixels of the original photo).
 */
export default function ImageCropModal({
  file, // File, or an image URL
  title = 'Crop the nail art',
  description = 'Drag to move, zoom to focus on the nails you want to showcase.',
  initialAspect = 4 / 5,
  aspects = ASPECTS,
  useNaturalAspect = false, // start with the image's own proportions
  output = { type: 'image/jpeg', ext: 'jpg', quality: 0.92 },
  applyLabel = 'Apply crop',
  onApply,
  onCancel,
}) {
  const [src, setSrc] = useState('');
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(initialAspect);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let url;
    let cancelled = false;
    setStatus('loading');
    toBlobUrl(file)
      .then((u) => {
        url = u;
        if (cancelled) return URL.revokeObjectURL(u);
        setSrc(u);
        return loadImage(u).then((img) => {
          if (cancelled) return;
          if (useNaturalAspect) setAspect(img.naturalWidth / img.naturalHeight);
          setStatus('ready');
        });
      })
      .catch(() => !cancelled && setStatus('error')); // e.g. HEIC in a browser that can't decode it
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  const onCropComplete = useCallback((_, pixels) => setArea(pixels), []);

  const apply = async () => {
    setBusy(true);
    try {
      const cropped = await cropToFile(src, area, typeof file === 'string' ? 'texture' : file.name, output);
      onApply(cropped, {
        x: Math.round(area.x),
        y: Math.round(area.y),
        width: Math.round(area.width),
        height: Math.round(area.height),
        zoom: Number(zoom.toFixed(2)),
        aspect: Number(aspect.toFixed(4)),
      });
    } catch {
      setStatus('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Crop photo">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onCancel} />

      <div className="card relative isolate flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-blush-50 shadow-2xl">
        <GridBackdrop />
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-xs text-ink-soft">{description}</p>
          </div>
          <button className="btn-ghost p-2" onClick={onCancel} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="relative h-[52vh] min-h-72 bg-ink/90">
          {status === 'ready' && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              minZoom={1}
              maxZoom={5}
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{ cropAreaStyle: { border: '2px solid rgba(255,255,255,0.9)', borderRadius: '1rem' } }}
            />
          )}
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner className="size-8" />
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-[#fff]">
              <p className="max-w-sm text-sm">This image couldn&rsquo;t be opened for cropping (HEIC is the usual cause for uploads).</p>
              {typeof file !== 'string' && (
                <button className="btn-secondary border-white/40 text-[#fff]" onClick={() => onApply(file, null)}>
                  Use the original photo
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4">
          <div className="flex min-w-52 flex-1 items-center gap-3">
            <ZoomOut className="size-4 text-ink-soft" />
            <input
              type="range"
              min={1}
              max={5}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-rose-500"
              aria-label="Zoom"
              disabled={status !== 'ready'}
            />
            <ZoomIn className="size-4 text-ink-soft" />
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Aspect ratio">
            {aspects.map((a) => (
              <button
                key={a.label}
                type="button"
                role="radio"
                aria-checked={Math.abs(aspect - a.value) < 0.001}
                onClick={() => setAspect(a.value)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  Math.abs(aspect - a.value) < 0.001 ? 'bg-ink text-white' : 'border border-line text-ink-soft hover:text-ink'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-line px-5 py-4">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={apply} disabled={status !== 'ready' || !area || busy}>
            {busy ? <Spinner className="size-4 text-white" /> : <Check className="size-4" />} {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
