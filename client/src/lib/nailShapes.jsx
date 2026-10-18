import { NAIL_SHAPES } from '../tryon/nailShapeProfile';

export { NAIL_SHAPES };

// Simple outline of each nail shape (tip at the top), drawn in a 24x32 box.
const PATHS = {
  Almond: 'M5 30V16C5 9 9 3 12 2c3 1 7 7 7 14v14Z',
  Square: 'M5 30V5h14v25Z',
  Stiletto: 'M5 30V18C5 12 10 5 12 1c2 4 7 11 7 17v12Z',
  Coffin: 'M5 30V12L8 3h8l3 9v18Z',
  Round: 'M5 30V12a7 7 0 0 1 14 0v18Z',
  Oval: 'M5 30V14C5 6 8 2 12 2s7 4 7 12v16Z',
};

export function NailShapeIcon({ shape, className = 'h-7 w-5' }) {
  return (
    <svg viewBox="0 0 24 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[shape]} />
    </svg>
  );
}
