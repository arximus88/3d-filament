// Build a CDN URL that resizes/recompresses remote product images on the
// fly via the free `images.weserv.nl` proxy. Saves ~60-90% bytes when the
// source store serves 2000×2000 WebP for a 240×240 card thumbnail.
//
// Usage:
//   <img src={resizedImg(p.image, 240, 240)} />
//   <img src={resizedImg(p.image, 480)} /> // width only, keep aspect
//
// Returns the original URL unchanged in two cases:
//   • the source is empty
//   • the source is a relative / local asset (proxy needs an absolute URL)
// In dev mode (`import.meta.env.DEV`) we ALSO pass through the original
// URL so build/preview don't depend on a third-party proxy.

export function resizedImg(
  url: string | null | undefined,
  width: number,
  height?: number,
): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return url;
  if (import.meta.env.DEV) return url;

  const params = new URLSearchParams({
    url,
    w: String(width),
    output: 'webp',
    q: '82',
  });
  if (height) {
    params.set('h', String(height));
    params.set('fit', 'cover');
  }
  return `https://images.weserv.nl/?${params.toString()}`;
}
