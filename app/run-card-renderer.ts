import { runShareCardArtworkPath, runShareCardDataUrl, runShareCardFilename, type RunShareCardInput } from './share-run-card';

export async function renderRunCardPng(input: RunShareCardInput) {
  const loadImage = async (source: string) => {
    const image = new window.Image();
    image.decoding = 'async';
    image.src = source;
    await image.decode();
    return image;
  };

  const [artwork, overlay] = await Promise.all([
    loadImage(runShareCardArtworkPath(input)),
    loadImage(runShareCardDataUrl(input)),
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

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('PNG export unavailable'));
    }, 'image/png');
  });
  return new File([blob], runShareCardFilename(input), { type: 'image/png' });
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

