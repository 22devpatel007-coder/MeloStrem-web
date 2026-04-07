/**
 * Generates a 2×2 collage from up to 4 song cover URLs.
 * Returns a base64 data URL (JPEG).
 */
export async function generatePlaylistCover(coverUrls = []) {
  const SIZE = 400;
  const HALF = SIZE / 2;

  const canvas  = document.createElement('canvas');
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx     = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const loadImg = (url) => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => {
      const fb = new Image();
      fb.src = 'https://placehold.co/200x200/111/555?text=';
      fb.onload = () => resolve(fb);
    };
    img.src = url;
  });

  const positions = [[0, 0], [HALF, 0], [0, HALF], [HALF, HALF]];
  const images    = await Promise.all(coverUrls.slice(0, 4).map(loadImg));
  images.forEach((img, i) => {
    const [x, y] = positions[i];
    ctx.drawImage(img, x, y, HALF, HALF);
  });

  return canvas.toDataURL('image/jpeg', 0.85);
}
