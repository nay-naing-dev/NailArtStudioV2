/** Decorative fine grid for a section. The parent needs `relative isolate` (and usually `overflow-hidden`). */
export function GridBackdrop({ className = '' }) {
  return <div aria-hidden="true" className={`grid-backdrop pointer-events-none absolute inset-0 -z-10 ${className}`} />;
}
