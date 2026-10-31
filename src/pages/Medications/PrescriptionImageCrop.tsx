import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type Cropper from 'cropperjs';
import type { ImageCrop } from '@/utils/prescriptionImage';
import { Button } from '@/components/ui/button';

/** Cropper uses unscaled canvas pixels; dialog enter animations scale DOMRects. */
function imageBounds(cropper: Cropper) {
  const image = cropper.getCropperImage()?.getBoundingClientRect();
  const canvas = cropper.getCropperCanvas();
  if (!image || !canvas) return null;
  const frame = canvas.getBoundingClientRect();
  if (!frame.width || !frame.height) return null;
  const sx = canvas.clientWidth / frame.width, sy = canvas.clientHeight / frame.height;
  return { x: (image.left-frame.left)*sx, y: (image.top-frame.top)*sy,
    width: image.width*sx, height: image.height*sy };
}

export function PrescriptionImageCrop({ file, onChange, onReady, onError }: {
  file: File; onChange: (crop: ImageCrop) => void; onReady: () => void; onError: () => void;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<Cropper | null>(null);
  const callbacks = useRef({ onChange, onReady, onError });
  useEffect(() => { callbacks.current = { onChange, onReady, onError }; });
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    const url = URL.createObjectURL(file);
    const element = new Image(); element.src = url;
    const reset = () => {
      const cropper = instance.current;
      const image = cropper?.getCropperImage();
      const canvas = cropper?.getCropperCanvas();
      const selection = cropper?.getCropperSelection();
      if (!image || !canvas || !selection) return;
      image.$center('contain');
      const box = imageBounds(cropper!);
      if (!box) return;
      selection.$change(box.x, box.y, box.width, box.height);
      callbacks.current.onChange({ x: 0, y: 0, width: 1, height: 1 });
    };
    void (async () => {
      try {
        await element.decode();
        const { default: CropperClass } = await import('cropperjs');
        if (disposed || !container.current) return;
        const cropper = new CropperClass(element, {
          container: container.current,
          template: `<cropper-canvas background style="height:100%;width:100%">
            <cropper-image></cropper-image><cropper-shade></cropper-shade>
            <cropper-selection movable resizable keyboard precise tabindex="0">
              <cropper-grid role="presentation" covered></cropper-grid>
              <cropper-handle action="move" theme-color="rgba(255,255,255,.1)"></cropper-handle>
              ${['n','e','s','w','ne','nw','se','sw'].map(dir => `<cropper-handle action="${dir}-resize"></cropper-handle>`).join('')}
            </cropper-selection></cropper-canvas>`,
        });
        instance.current = cropper;
        await cropper.getCropperImage()?.$ready();
        if (disposed) return;
        reset();
        cropper.getCropperSelection()?.addEventListener('change', (event: Event) => {
          const detail = (event as CustomEvent<{x:number;y:number;width:number;height:number}>).detail;
          const image = imageBounds(cropper);
          if (!image || !image.width || !image.height) return;
          const x = Math.max(0, (detail.x-image.x) / image.width);
          const y = Math.max(0, (detail.y-image.y) / image.height);
          const right = Math.min(1, (detail.x+detail.width-image.x)/image.width);
          const bottom = Math.min(1, (detail.y+detail.height-image.y)/image.height);
          if (right <= x || bottom <= y) { event.preventDefault(); return; }
          callbacks.current.onChange({ x, y, width: right-x, height: bottom-y });
        });
        observer = new ResizeObserver(reset); observer.observe(container.current!);
        callbacks.current.onReady();
      } catch { if (!disposed) callbacks.current.onError(); }
    })();
    return () => {
      disposed = true; observer?.disconnect(); instance.current?.destroy(); instance.current = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground">{t('meds.scan.cropHint')}</p>
    <div ref={container} role="group" aria-label={t('meds.scan.cropLabel')} className="h-[min(42vh,340px)] w-full overflow-hidden rounded-lg" />
    <Button type="button" variant="outline" size="sm" onClick={() => {
      const cropper = instance.current, image = cropper?.getCropperImage(), canvas = cropper?.getCropperCanvas();
      if (!image || !canvas) return;
      const box = imageBounds(cropper!);
      if (box) cropper?.getCropperSelection()?.$change(box.x, box.y, box.width, box.height);
    }}>{t('meds.scan.resetCrop')}</Button>
  </div>;
}
