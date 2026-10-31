import imageCompression from 'browser-image-compression';
import compressionLibraryUrl from 'browser-image-compression/dist/browser-image-compression.js?url';
import pica from 'pica';

export type ImageStrategy = 'original' | 'general' | 'crop' | 'adaptive';
/** Coordinates relative to the EXIF-oriented image, not the preview's CSS pixels. */
export interface ImageCrop { x: number; y: number; width: number; height: number }
export const FULL_IMAGE: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };
const resizer = pica({ features: ['js', 'wasm', 'ww'], concurrency: 2 });

function checkAbort(signal?: AbortSignal) { signal?.throwIfAborted(); }
export function boundedCrop(crop: ImageCrop): ImageCrop {
  if (!Object.values(crop).every(Number.isFinite) || crop.width <= 0 || crop.height <= 0) {
    throw new Error('Invalid image crop');
  }
  const x = Math.max(0, Math.min(1, crop.x));
  const y = Math.max(0, Math.min(1, crop.y));
  const width = Math.min(crop.width, 1 - x);
  const height = Math.min(crop.height, 1 - y);
  if (width <= 0 || height <= 0) throw new Error('Empty image crop');
  return { x, y, width, height };
}

async function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode(); // Browsers apply EXIF orientation before drawing.
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image');
    if (image.naturalWidth * image.naturalHeight > 32_000_000) throw new Error('Image exceeds 32 megapixels');
    return image;
  } finally { URL.revokeObjectURL(url); }
}
function canvas(width: number, height: number) {
  const value = document.createElement('canvas');
  value.width = width; value.height = height;
  return value;
}
function context(value: HTMLCanvasElement) {
  const ctx = value.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  return ctx;
}
function encode(value: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => value.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Image encoding failed')), type, quality,
  ));
}
function jpegFile(blob: Blob, name: string) {
  return new File([blob], `${name.replace(/\.[^.]*$/, '')}.jpg`, { type: 'image/jpeg' });
}

/** Edge-weighted pixel error, a compression heuristic; it does not measure OCR accuracy. */
async function edgeError(reference: HTMLCanvasElement, candidate: Blob) {
  const image = await decode(candidate);
  const comparison = canvas(reference.width, reference.height);
  try {
    context(comparison).drawImage(image, 0, 0, comparison.width, comparison.height);
    const a = context(reference).getImageData(0, 0, reference.width, reference.height).data;
    const b = context(comparison).getImageData(0, 0, comparison.width, comparison.height).data;
    let error = 0, weight = 0;
    const luma = (data: Uint8ClampedArray, i: number) => .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2];
    // Sample throughout the image. High contrast edges receive more weight.
    for (let y = 1; y < reference.height - 1; y += 2) {
      for (let x = 1; x < reference.width - 1; x += 2) {
        const i = (y * reference.width + x) * 4;
        const gradient = Math.abs(luma(a, i - 4) - luma(a, i + 4))
          + Math.abs(luma(a, i - reference.width * 4) - luma(a, i + reference.width * 4));
        const w = 1 + Math.min(8, gradient / 16);
        error += w * (luma(a, i) - luma(b, i)) ** 2; weight += w;
      }
    }
    return weight ? Math.sqrt(error / weight) / 255 : 0;
  } finally { comparison.width = comparison.height = 1; }
}

export async function preparePrescriptionImage(file: File, options: {
  strategy?: ImageStrategy; crop?: ImageCrop; signal?: AbortSignal;
} = {}) {
  const started = performance.now();
  const strategy = options.strategy ?? 'adaptive';
  checkAbort(options.signal);
  if (strategy === 'original') return {
    file, strategy, originalBytes: file.size, outputBytes: file.size,
    preprocessingMs: performance.now() - started, crop: FULL_IMAGE,
    width: null, height: null, quality: null, edgeError: null,
  };
  const crop = boundedCrop(strategy === 'general' ? FULL_IMAGE : options.crop ?? FULL_IMAGE);
  const image = await decode(file);
  checkAbort(options.signal);
  const sx = Math.floor(crop.x * image.naturalWidth), sy = Math.floor(crop.y * image.naturalHeight);
  const sw = Math.max(1, Math.min(image.naturalWidth - sx, Math.ceil(crop.width * image.naturalWidth)));
  const sh = Math.max(1, Math.min(image.naturalHeight - sy, Math.ceil(crop.height * image.naturalHeight)));
  // Draw straight into a bounded canvas; a 12MP photo must not allocate a 12MP crop canvas.
  const edge = strategy === 'adaptive' ? 1800 : 1280;
  const ratio = Math.min(1, edge / Math.max(sw, sh)); // Never invent detail by upscaling.
  const source = canvas(Math.min(sw, 4096), Math.min(sh, 4096));
  const target = canvas(Math.max(1, Math.round(sw * ratio)), Math.max(1, Math.round(sh * ratio)));
  let quality = strategy === 'adaptive' ? .84 : .75;
  let error: number | null = null;
  let output: File;
  try {
    if (strategy === 'adaptive') {
      // Bound intermediate memory to 16MP; phone photos normally remain at their native crop size.
      const sourceRatio = Math.min(1, 4096 / Math.max(sw, sh));
      source.width = Math.max(1, Math.round(sw * sourceRatio));
      source.height = Math.max(1, Math.round(sh * sourceRatio));
      context(source).fillStyle = '#fff'; context(source).fillRect(0, 0, source.width, source.height);
      context(source).drawImage(image, sx, sy, sw, sh, 0, 0, source.width, source.height);
      if (source.width === target.width && source.height === target.height) context(target).drawImage(source, 0, 0);
      else await resizer.resize(source, target, { filter: 'mks2013' });
      checkAbort(options.signal);
      let blob = await encode(target, 'image/jpeg', quality);
      error = await edgeError(target, blob);
      if (error > .025) { quality = .92; blob = await encode(target, 'image/jpeg', quality); }
      output = jpegFile(blob, file.name);
    } else {
      context(target).fillStyle = '#fff'; context(target).fillRect(0, 0, target.width, target.height);
      context(target).drawImage(image, sx, sy, sw, sh, 0, 0, target.width, target.height);
      // PNG intermediate avoids a second lossy JPEG encode. Worker code is served by this app.
      const intermediate = new File([await encode(target, 'image/png')], 'crop.png', { type: 'image/png' });
      const blob = await imageCompression(intermediate, {
        fileType: 'image/jpeg', initialQuality: quality, maxSizeMB: 1,
        alwaysKeepResolution: true, maxIteration: 1, useWebWorker: true,
        libURL: new URL(compressionLibraryUrl, location.href).href,
        preserveExif: false, signal: options.signal,
      });
      output = jpegFile(blob, file.name);
    }
    checkAbort(options.signal);
    // Avoid enlarging an already efficient JPEG, except when the user explicitly removed content.
    const full = crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
    if (full && output.size >= file.size && file.type === 'image/jpeg') output = file;
    return {
      file: output, strategy, originalBytes: file.size, outputBytes: output.size,
      preprocessingMs: performance.now() - started, crop, width: target.width, height: target.height,
      quality, edgeError: error,
    };
  } finally { source.width = source.height = target.width = target.height = 1; }
}
