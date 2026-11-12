import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Grid3x3, LayoutGrid, RectangleVertical, RotateCw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { GridBackdrop } from './GridBackdrop';
import { loadImage, toBlobUrl } from './ImageCropModal';
import { Spinner } from './ui';
import { mirrorTile } from '../tryon/renderNails';

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const ROLE_LABELS = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky', variation: 'Variation', texture: 'Texture' };
// Outline colours sit on top of the photo, so they are fixed rather than themed.
const ROLE_COLORS = {
  thumb: '#f472b6',
  index: '#fb923c',
  middle: '#facc15',
  ring: '#34d399',
  pinky: '#60a5fa',
  variation: '#e9d5ff',
  texture: '#ffffff',
};

export const SEGMENT_MODES = [
  {
    id: 'set',
    label: 'Full set',
    sub: 'Several nails, one per finger',
    icon: LayoutGrid,
    hint: 'Drag on the photo to box each nail. New boxes take the next finger, thumb to pinky; change it in the list. Mark extra nails as Variation to save each as its own design.',
  },
  {
    id: 'single',
    label: 'Single nail',
    sub: 'One close-up, 2:3 nail shape',
    icon: RectangleVertical,
    hint: 'Frame one nail. The box keeps a standard 2:3 nail shape. If the nail tip doesn’t point up, use Rotate tip.',
  },
  {
    id: 'pattern',
    label: 'Pattern',
    sub: 'Flat swatch, tiled seamlessly',
    icon: Grid3x3,
    hint: 'Frame a flat area of the pattern with no nail edges or background. It’s mirrored into a seamless tile and spread across every nail at the same scale.',
  },
];

const NAIL_ASPECT = 2 / 3;
const MIN_PX = 12; // matches the server's smallest accepted crop
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 1e5) / 1e5;
let lastId = 0;
const uid = () => `box-${++lastId}`;

// turn = clockwise rotation that makes the tip point up, so the tip lies on this edge of the box in the photo.
const TIP_EDGE = { 0: 'top', 90: 'left', 180: 'bottom', 270: 'right' };
const nextTurn = (turn) => (turn + 270) % 360; // moves the tip one edge clockwise
// Pixel aspect a single-nail box keeps in the photo: 2:3 once it's turned tip-up.
const singleAspect = (turn) => (turn % 180 === 0 ? NAIL_ASPECT : 1 / NAIL_ASPECT);

/** Box from a fixed anchor corner to the pointer (normalised coords), optionally locked to a pixel aspect ratio. */
function fromAnchor(a, p, img, aspectPx) {
  const sx = p.x < a.x ? -1 : 1;
  const sy = p.y < a.y ? -1 : 1;
  let w = Math.abs(p.x - a.x);
  let h = Math.abs(p.y - a.y);
  if (aspectPx) {
    // In pixels, so the ratio holds on screen and in the crop; capped by the room left in the drag direction.
    const roomW = (sx > 0 ? 1 - a.x : a.x) * img.w;
    const roomH = (sy > 0 ? 1 - a.y : a.y) * img.h;
    const wPx = Math.min(Math.max(w * img.w, h * img.h * aspectPx), roomW, roomH * aspectPx);
    w = wPx / img.w;
    h = wPx / aspectPx / img.h;
  }
  return { x: sx > 0 ? a.x : a.x - w, y: sy > 0 ? a.y : a.y - h, width: w, height: h };
}

/** Swaps a box's pixel width and height around its centre (a single nail turned sideways), kept inside the photo. */
function turnBox(b, img) {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  let wPx = b.height * img.h;
  let hPx = b.width * img.w;
  const k = Math.min(1, img.w / wPx, img.h / hPx);
  wPx *= k;
  hPx *= k;
  const width = wPx / img.w;
  const height = hPx / img.h;
  return { ...b, x: clamp(cx - width / 2, 0, 1 - width), y: clamp(cy - height / 2, 0, 1 - height), width, height };
}

function defaultBox(mode, img) {
  if (mode === 'single') {
    let hPx = img.h * 0.6;
    let wPx = hPx * NAIL_ASPECT;
    if (wPx > img.w * 0.9) [wPx, hPx] = [img.w * 0.9, (img.w * 0.9) / NAIL_ASPECT];
    const width = wPx / img.w;
    const height = hPx / img.h;
    return { id: uid(), role: 'texture', turn: 0, x: (1 - width) / 2, y: (1 - height) / 2, width, height };
  }
  return { id: uid(), role: 'texture', turn: 0, x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
}

const tooSmall = (b, img) => b.width * img.w < MIN_PX || b.height * img.h < MIN_PX;
const nextRole = (list) => FINGERS.find((f) => !list.some((b) => b.role === f)) ?? 'variation';

/** Draws one box of the photo, rotated tip-up, exactly as the server will crop it. */
function cropToCanvas(canvas, img, box, turn, maxPx) {
  const sx = box.x * img.naturalWidth;
  const sy = box.y * img.naturalHeight;
  const sw = Math.max(1, box.width * img.naturalWidth);
  const sh = Math.max(1, box.height * img.naturalHeight);
  const sideways = turn % 180 !== 0;
  const scale = Math.min(1, maxPx / Math.max(sw, sh));
  canvas.width = Math.max(1, Math.round((sideways ? sh : sw) * scale));
  canvas.height = Math.max(1, Math.round((sideways ? sw : sh) * scale));
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(img, sx, sy, sw, sh, (-sw * scale) / 2, (-sh * scale) / 2, sw * scale, sh * scale);
}

function CropPreview({ img, box, className = '', maxPx = 160 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) cropToCanvas(ref.current, img, box, box.turn, maxPx);
  }, [img, box, maxPx]);
  return <canvas ref={ref} className={className} />;
}

/** The pattern crop mirrored into a seamless tile and repeated, as the try-on lays it across a nail. */
function PatternPreview({ img, box }) {
  const ref = useRef(null);
  useEffect(() => {
    const out = ref.current;
    if (!out) return;
    const crop = document.createElement('canvas');
    cropToCanvas(crop, img, box, box.turn, 240);
    const tile = mirrorTile(crop);
    out.width = 480;
    out.height = 320;
    const ctx = out.getContext('2d');
    const k = 150 / crop.width; // one crop spans about a third of the preview
    ctx.scale(k, k);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, out.width / k, out.height / k);
  }, [img, box]);
  return <canvas ref={ref} className="w-full rounded-nail-sm ring-1 ring-line" />;
}

function BoxView({ box, selected, single, mode }) {
  const color = ROLE_COLORS[box.role];
  const edge = TIP_EDGE[box.turn];
  const arrowPos = {
    top: 'left-1/2 top-1 -translate-x-1/2',
    bottom: 'left-1/2 bottom-1 -translate-x-1/2',
    left: 'top-1/2 left-1 -translate-y-1/2',
    right: 'top-1/2 right-1 -translate-y-1/2',
  }[edge];
  return (
    <div
      data-handle="move"
      data-id={box.id}
      className={`absolute cursor-move ${box.role === 'variation' ? 'border-dashed' : 'border-solid'} ${selected ? 'border-[3px]' : 'border-2'}`}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
        borderColor: color,
        // Single-box modes dim everything outside the crop, like a classic cropper.
        boxShadow: single ? '0 0 0 9999px rgba(20, 10, 14, 0.55)' : selected ? `0 0 0 3px ${color}55` : undefined,
      }}
    >
      {mode === 'set' && (
        <span
          className="pointer-events-none absolute bottom-full -left-0.5 mb-1 rounded-nail-sm px-1.5 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap text-[#2a1a20] shadow"
          style={{ background: color }}
        >
          {box.role === 'variation' && box.label ? box.label : ROLE_LABELS[box.role]}
        </span>
      )}
      <span
        className={`pointer-events-none absolute flex size-4 items-center justify-center rounded-full text-[#2a1a20] ${arrowPos}`}
        style={{ background: color }}
        title="Nail tip"
      >
        <ArrowUp className="size-3" style={{ transform: `rotate(${(360 - box.turn) % 360}deg)` }} strokeWidth={3} />
      </span>
      {selected &&
        ['nw', 'ne', 'sw', 'se'].map((c) => (
          <span
            key={c}
            data-handle={c}
            data-id={box.id}
            className={`absolute size-4 rounded-[3px] border-2 bg-white shadow ${c[0] === 'n' ? '-top-2' : '-bottom-2'} ${c[1] === 'w' ? '-left-2' : '-right-2'} ${
              c === 'nw' || c === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
            }`}
            style={{ borderColor: color }}
          />
        ))}
    </div>
  );
}

/**
 * Admin tool for cutting try-on textures out of a design photo.
 *   Full set:    a box per nail, each mapped to a finger or saved as a standalone variation
 *   Single nail: one box locked to the 2:3 nail aspect
 *   Pattern:     one free box, tiled seamlessly in the try-on
 * onApply({ mode, segments }) receives boxes as fractions of the photo plus a clockwise `turn` that makes the tip
 * point up, ready for the API.
 */
export default function DesignSegmenter({ source, initialMode = 'set', initialSegments, saving = false, onApply, onCancel }) {
  const [src, setSrc] = useState('');
  const [img, setImg] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [mode, setMode] = useState(initialMode);
  const [boxes, setBoxes] = useState(() => ({
    set: [],
    single: [],
    pattern: [],
    [initialMode]: (initialSegments ?? []).map((s) => ({ id: uid(), role: s.role, label: s.label ?? '', turn: s.turn ?? 0, ...s.box })),
  }));
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState({ w: 0, h: 0 });

  const areaRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;

  const dims = img && { w: img.naturalWidth, h: img.naturalHeight };
  const list = boxes[mode];
  const singleBox = mode !== 'set';
  const updateList = useCallback((fn) => setBoxes((prev) => ({ ...prev, [mode]: fn(prev[mode]) })), [mode]);

  // ---------- load the photo ----------
  useEffect(() => {
    let url;
    let cancelled = false;
    toBlobUrl(source)
      .then(async (u) => {
        url = u;
        if (cancelled) return URL.revokeObjectURL(u);
        const image = await loadImage(u);
        if (cancelled) return;
        const d = { w: image.naturalWidth, h: image.naturalHeight };
        // Single and pattern modes always have their one box ready to adjust.
        setBoxes((prev) => ({
          ...prev,
          single: prev.single.length ? prev.single : [defaultBox('single', d)],
          pattern: prev.pattern.length ? prev.pattern : [defaultBox('pattern', d)],
        }));
        setSrc(u);
        setImg(image);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error')); // e.g. HEIC, which most browsers can't decode
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);

  // Fit the photo inside the stage at zoom 1.
  useEffect(() => {
    const el = areaRef.current;
    if (!el || !dims) return;
    const measure = () => {
      const availW = el.clientWidth - 32;
      const availH = el.clientHeight - 44;
      const s = Math.min(availW / dims.w, availH / dims.h);
      setFit({ w: dims.w * s, h: dims.h * s });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dims?.w, dims?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') return onCancel();
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && mode === 'set') {
        e.preventDefault();
        updateList((l) => l.filter((b) => b.id !== selectedId));
        setSelectedId(null);
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, selectedId, mode, updateList]);

  // ---------- pointer: draw, move and resize boxes ----------
  const toNorm = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = toNorm(e);
    const handle = e.target.closest('[data-handle]');
    const current = boxesRef.current[mode];

    if (handle) {
      const b = current.find((x) => x.id === handle.dataset.id);
      if (!b) return;
      const kind = handle.dataset.handle;
      dragRef.current =
        kind === 'move'
          ? { kind, id: b.id, start: p, orig: b }
          : { kind: 'resize', id: b.id, anchor: { x: kind[1] === 'w' ? b.x + b.width : b.x, y: kind[0] === 'n' ? b.y + b.height : b.y } };
      setSelectedId(b.id);
    } else {
      // A drag on empty photo draws a new box. In single-box modes it replaces the box (restored if the drag is a click).
      const prev = singleBox ? current[0] : null;
      const box = { id: uid(), role: singleBox ? 'texture' : nextRole(current), label: '', turn: prev?.turn ?? 0, ...p, width: 0, height: 0 };
      updateList((l) => (singleBox ? [box] : [...l, box]));
      dragRef.current = { kind: 'draw', id: box.id, anchor: p, prev };
      setSelectedId(box.id);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // Where the dragged box ends up with the pointer at p. Depends only on the drag's start and p, never on render timing.
  const boxAt = (d, b, p) =>
    d.kind === 'move'
      ? { ...b, x: clamp(d.orig.x + p.x - d.start.x, 0, 1 - b.width), y: clamp(d.orig.y + p.y - d.start.y, 0, 1 - b.height) }
      : { ...b, ...fromAnchor(d.anchor, p, dims, mode === 'single' ? singleAspect(b.turn) : null) };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toNorm(e);
    updateList((l) => l.map((b) => (b.id === d.id ? boxAt(d, b, p) : b)));
  };

  const endDrag = (e, cancelled) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const current = boxesRef.current[mode].find((x) => x.id === d.id);
    // Browsers may fold the last pointermove into pointerup, so the release point is applied too.
    const final = current && !cancelled ? boxAt(d, current, toNorm(e)) : current;
    if (d.kind === 'draw' && (!final || tooSmall(final, dims))) {
      updateList((l) => (d.prev ? [d.prev] : l.filter((x) => x.id !== d.id)));
      setSelectedId(d.prev?.id ?? null);
    } else if (final) {
      updateList((l) => l.map((b) => (b.id === d.id ? final : b)));
    }
  };

  // ---------- list actions ----------
  const patch = (id, changes) => updateList((l) => l.map((b) => (b.id === id ? { ...b, ...changes } : b)));
  // Picking a finger another box already has swaps the two, so each finger stays assigned once.
  const setRole = (id, role) =>
    updateList((l) => {
      const me = l.find((b) => b.id === id);
      return l.map((b) => (b.id === id ? { ...b, role } : FINGERS.includes(role) && b.role === role ? { ...b, role: me.role } : b));
    });
  const rotate = (id) =>
    updateList((l) =>
      l.map((b) => {
        if (b.id !== id) return b;
        const turned = { ...b, turn: nextTurn(b.turn) };
        return mode === 'single' ? turnBox(turned, dims) : turned;
      }),
    );
  const remove = (id) => {
    updateList((l) => l.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const apply = () =>
    onApply({
      mode,
      segments: list.map((b) => ({
        role: mode === 'set' ? b.role : 'texture',
        box: { x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) },
        turn: b.turn,
        ...(b.role === 'variation' && b.label?.trim() && { label: b.label.trim() }),
      })),
    });

  const modeInfo = SEGMENT_MODES.find((m) => m.id === mode);
  const fingerCount = list.filter((b) => FINGERS.includes(b.role)).length;
  const variationCount = list.filter((b) => b.role === 'variation').length;
  const canApply = status === 'ready' && (mode === 'set' ? list.length > 0 : list.length === 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Segment design">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onCancel} />

      <div className="card relative isolate flex max-h-full w-full max-w-6xl flex-col overflow-hidden bg-blush-50 shadow-2xl">
        <GridBackdrop />
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Segment the design</h2>
            <p className="mt-0.5 text-xs text-ink-soft">{modeInfo.hint}</p>
          </div>
          <button className="btn-ghost shrink-0 p-2" onClick={onCancel} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-line px-5 py-3" role="radiogroup" aria-label="Segmenting mode">
          {SEGMENT_MODES.map((m) => {
            const on = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setMode(m.id);
                  setSelectedId(null);
                }}
                className={`pill flex items-center gap-2.5 border px-3 py-2 text-left ${
                  on ? 'pill-active border-rose-500 bg-rose-500/10 text-rose-700' : 'border-line bg-white/60 text-ink-soft hover:border-rose-500/50 hover:text-ink'
                }`}
              >
                <m.icon className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="hidden truncate text-[11px] opacity-80 sm:block">{m.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* A fixed flex-basis (not height, which flex-1 would override) keeps the stage from resizing as boxes are added. */}
        <div className="grid min-h-0 flex-1 lg:flex-[0_1_62vh] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div ref={areaRef} className="relative h-[42vh] overflow-auto bg-ink/90 lg:h-full">
            {status === 'ready' && fit.w > 0 && (
              <div className="flex min-h-full min-w-full items-center justify-center px-4 pt-7 pb-4" style={{ width: 'max-content', height: 'max-content' }}>
                <div
                  ref={stageRef}
                  className={`relative cursor-crosshair touch-none select-none ${singleBox ? 'overflow-hidden' : ''}`}
                  style={{ width: fit.w * zoom, height: fit.h * zoom }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={(e) => endDrag(e, false)}
                  onPointerCancel={(e) => endDrag(e, true)}
                >
                  <img src={src} alt="Design photo" draggable={false} className="pointer-events-none size-full" />
                  {list.map((b) => (
                    <BoxView key={b.id} box={b} mode={mode} single={singleBox} selected={b.id === selectedId || singleBox} />
                  ))}
                </div>
              </div>
            )}
            {status === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner className="size-8" />
              </div>
            )}
            {status === 'error' && (
              <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[#fff]">
                This photo can&rsquo;t be shown in the browser (HEIC is the usual cause). Convert it to JPEG, or use Auto-extract instead.
              </p>
            )}
          </div>

          <aside className="max-h-[32vh] space-y-3 overflow-y-auto border-t border-line p-4 lg:max-h-none lg:border-t-0 lg:border-l">
            {status === 'ready' && mode === 'set' && (
              <>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-sans text-sm font-semibold">Boxes</h3>
                  <span className="text-xs text-ink-soft">
                    {fingerCount}/5 fingers{variationCount ? ` · ${variationCount} variation${variationCount === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="rounded-nail-sm border border-dashed border-line p-4 text-center text-xs text-ink-soft">
                    Drag on the photo to draw your first box, around the thumb nail.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((b) => (
                      <li
                        key={b.id}
                        onClick={() => setSelectedId(b.id)}
                        className={`flex gap-3 rounded-nail-sm border bg-white/70 p-2 transition ${b.id === selectedId ? 'border-rose-500 ring-2 ring-rose-500/15' : 'border-line'}`}
                      >
                        <div className="flex h-16 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[40%/30%] bg-blush-100 ring-2" style={{ '--tw-ring-color': ROLE_COLORS[b.role] }}>
                          <CropPreview img={img} box={b} maxPx={96} className="size-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <select
                            className="input py-1.5 text-xs"
                            value={b.role}
                            onChange={(e) => setRole(b.id, e.target.value)}
                            aria-label="Finger"
                          >
                            {FINGERS.map((f) => (
                              <option key={f} value={f}>
                                {ROLE_LABELS[f]}
                              </option>
                            ))}
                            <option value="variation">Variation (own design)</option>
                          </select>
                          {b.role === 'variation' && (
                            <input
                              className="input py-1.5 text-xs"
                              placeholder="Name, e.g. Rose accent"
                              maxLength={60}
                              value={b.label}
                              onChange={(e) => patch(b.id, { label: e.target.value })}
                            />
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <button type="button" className="btn-ghost pill p-1.5" onClick={() => rotate(b.id)} title="Rotate so the tip points up" aria-label="Rotate tip">
                            <RotateCw className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="btn-ghost pill p-1.5 hover:bg-red-50 hover:text-red-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(b.id);
                            }}
                            aria-label={`Remove ${ROLE_LABELS[b.role]} box`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-ink-soft">
                  The arrow marks the nail tip; rotate until it points to the tip. Fingers without a box use the middle nail (or the first box) in
                  the try-on. Delete removes the selected box.
                </p>
              </>
            )}

            {status === 'ready' && mode !== 'set' && list[0] && (
              <>
                <h3 className="font-sans text-sm font-semibold">{mode === 'single' ? 'Try-on texture' : 'Seamless tile preview'}</h3>
                {mode === 'single' ? (
                  <div className="flex justify-center rounded-nail bg-blush-100/60 p-4">
                    <CropPreview img={img} box={list[0]} maxPx={320} className="h-48 w-32 rounded-[40%/30%] object-cover shadow-lg" />
                  </div>
                ) : (
                  <PatternPreview img={img} box={list[0]} />
                )}
                <button type="button" className="btn-secondary w-full" onClick={() => rotate(list[0].id)}>
                  <RotateCw className="size-4" /> Rotate tip
                </button>
                <p className="text-[11px] text-ink-soft">
                  {mode === 'single'
                    ? 'Drag the box to move it, the corners to resize, or draw a new one. The arrow marks the nail tip.'
                    : 'Edges are mirrored so the tile repeats without seams. Avoid shadows and nail edges in the box.'}
                </p>
              </>
            )}
          </aside>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-3">
          <div className="flex min-w-48 flex-1 items-center gap-3">
            <ZoomOut className="size-4 text-ink-soft" aria-hidden />
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full max-w-64 accent-rose-500"
              aria-label="Zoom"
              disabled={status !== 'ready'}
            />
            <ZoomIn className="size-4 text-ink-soft" aria-hidden />
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={apply} disabled={!canApply || saving}>
              {saving ? <Spinner className="size-4 text-white" /> : <Check className="size-4" />} Use {mode === 'set' ? `${list.length} box${list.length === 1 ? '' : 'es'}` : 'this crop'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
