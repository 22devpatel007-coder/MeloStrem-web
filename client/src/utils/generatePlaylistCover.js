/**
 * Generates a 2×2 collage from up to 4 song cover URLs.
 * Returns a base64 data URL (JPEG), or null if Canvas is unavailable or
 * generation fails for any reason. Never throws.
 */

const IMAGE_LOAD_TIMEOUT_MS = 5000;

const loadImgSafe = (url) =>
  new Promise((resolve) => {
    // Per-image timeout: if load neither succeeds nor fails within 5s, resolve null
    const timer = setTimeout(() => resolve(null), IMAGE_LOAD_TIMEOUT_MS);

    const img = new Image();
    // crossOrigin MUST be set before src to prevent canvas taint with Cloudinary URLs
    img.crossOrigin = 'anonymous';
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });

export async function generatePlaylistCover(coverUrls = []) {
  try {
    // Guard 1: Canvas API not available (old Safari, some WebViews)
    if (typeof window === 'undefined' || !window.HTMLCanvasElement) return null;

    const SIZE = 400;
    const HALF = SIZE / 2;

    const canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;

    // Guard 2: GPU unavailable or Brave strict fingerprinting blocks 2D context
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const urls     = coverUrls.slice(0, 4).filter(Boolean);
    const images   = await Promise.all(urls.map(loadImgSafe));
    const positions = [[0, 0], [HALF, 0], [0, HALF], [HALF, HALF]];

    images.forEach((img, i) => {
      // Skip slots where image failed to load
      if (!img) return;
      const [x, y] = positions[i];
      ctx.drawImage(img, x, y, HALF, HALF);
    });

    // Guard 3: toDataURL throws SecurityError if canvas is tainted
    try {
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  } catch {
    // Outer safety net: any unexpected error returns null, never propagates
    return null;
  }
}