import { runShareCardArtworkPath, runShareCardDataUrl, runShareCardFilename, type RunShareCardInput } from './share-run-card';

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (error) {
        image.removeAttribute('src');
        reject(error);
      } else {
        resolve(image);
      }
    };
    const timeout = window.setTimeout(() => finish(new Error('Card image loading timed out')), 10_000);
    image.onload = () => finish(image.naturalWidth && image.naturalHeight ? undefined : new Error('Card image is empty'));
    image.onerror = () => finish(new Error('Card image could not load'));
    // Canvas draws loaded images directly. Do not make export depend on the
    // optional decode() presentation promise, which can be delayed separately.
    image.src = source;
  });
}

function encodePng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    let finished = false;
    const finish = (blob: Blob | null, error = new Error('PNG export unavailable')) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      if (blob?.size && blob.type === 'image/png') resolve(blob);
      else reject(error);
    };
    // Some browsers schedule toBlob through idle work. If its callback stalls,
    // encode this same, already-composited fixed-size canvas synchronously.
    // This happens before any save gesture, never while opening a share menu.
    const timeout = window.setTimeout(() => {
      if (finished) return;
      try {
        const prefix = 'data:image/png;base64,';
        const encoded = canvas.toDataURL('image/png');
        if (!encoded.startsWith(prefix)) throw new Error('PNG fallback unavailable');
        const bytes = Uint8Array.from(atob(encoded.slice(prefix.length)), (char) => char.charCodeAt(0));
        finish(new Blob([bytes], { type: 'image/png' }));
      } catch (error) {
        finish(null, error instanceof Error ? error : new Error('PNG fallback failed'));
      }
    }, 1_000);
    try {
      canvas.toBlob((blob) => finish(blob), 'image/png');
    } catch (error) {
      finish(null, error instanceof Error ? error : new Error('PNG export failed'));
    }
  });
}

export async function renderRunCardPng(input: RunShareCardInput, challengeUrl?: string) {
  const [artwork, overlay] = await Promise.all([
    loadImage(runShareCardArtworkPath(input)),
    loadImage(runShareCardDataUrl(input, challengeUrl)),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering unavailable');
  context.fillStyle = '#09090b';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const sourceRatio = artwork.naturalWidth / artwork.naturalHeight;
  const targetRatio = canvas.width / canvas.height;
  const sourceWidth = sourceRatio > targetRatio
    ? artwork.naturalHeight * targetRatio
    : artwork.naturalWidth;
  const sourceHeight = sourceRatio > targetRatio
    ? artwork.naturalHeight
    : artwork.naturalWidth / targetRatio;
  context.drawImage(
    artwork,
    (artwork.naturalWidth - sourceWidth) / 2,
    (artwork.naturalHeight - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  context.drawImage(overlay, 0, 0, canvas.width, canvas.height);

  try {
    const blob = await encodePng(canvas);
    return new File([blob], runShareCardFilename(input), { type: 'image/png' });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
