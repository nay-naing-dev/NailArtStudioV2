// Studio contact details. Override any of them with VITE_STUDIO_* variables in client/.env.
const env = import.meta.env;

export const STUDIO = {
  address: env.VITE_STUDIO_ADDRESS || '123 Pyay Road, Kamayut Township, Yangon, Myanmar',
  phone: env.VITE_STUDIO_PHONE || '+95 9 123 456 789',
  hours: [
    { days: env.VITE_STUDIO_HOURS_DAYS || 'Mon – Sat', time: env.VITE_STUDIO_HOURS_TIME || '10:00 – 19:00' },
    { days: 'Sun', time: null }, // closed
  ],
  // What the map searches for. A precise address or "lat,lng" gives the best pin.
  mapQuery: env.VITE_STUDIO_MAP_QUERY || env.VITE_STUDIO_ADDRESS || '123 Pyay Road, Kamayut Township, Yangon, Myanmar',
};

export const mapEmbedUrl = (q = STUDIO.mapQuery) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`;
export const directionsUrl = (q = STUDIO.mapQuery) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
export const telUrl = (phone = STUDIO.phone) => `tel:${phone.replace(/[^\d+]/g, '')}`;
