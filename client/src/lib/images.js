/**
 * Display-sized version of a stored image. Cloudinary URLs get a resize + auto format/quality transform,
 * so a gallery thumbnail isn't the full-resolution original photo. Local /uploads URLs are returned as-is.
 * Only for <img> display: try-on and the editors need the untouched asset.
 */
export function sized(url, width) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${width}/`);
}
