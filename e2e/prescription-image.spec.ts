import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { t } from './fixtures';
import type { preparePrescriptionImage } from '../src/utils/prescriptionImage';

declare global { interface Window { preparePrescriptionImage: typeof preparePrescriptionImage } }

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/prescription-image.html');
  await page.waitForFunction(() => (window as unknown as {ready: boolean}).ready);
});

test('real browser crop, compression, pica resize and local workers preserve geometry', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', request => { if (request.url().startsWith('http') && !['localhost','127.0.0.1'].includes(new URL(request.url()).hostname)) remote.push(request.url()); });
  const result = await page.evaluate(async () => {
    const { preparePrescriptionImage } = window;
    const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 2400, 1800);
    ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 600, 1800);
    ctx.fillStyle = 'blue'; ctx.fillRect(600, 0, 1800, 1800);
    ctx.fillStyle = 'white'; ctx.font = '24px sans-serif';
    for (let y = 80; y < 1600; y += 42) ctx.fillText('合成測試 藥名 5mg QD 每次1錠', 700, y);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    const file = new File([blob], 'synthetic.png', { type: 'image/png' });
    const rows = [];
    for (const strategy of ['original', 'general', 'crop', 'adaptive'] as const) {
      const p = await preparePrescriptionImage(file, { strategy, crop: { x:.25,y:0,width:.75,height:1 } });
      const bmp = await createImageBitmap(p.file);
      const sample = document.createElement('canvas'); sample.width = sample.height = 1;
      sample.getContext('2d')!.drawImage(bmp, 20, 20, 1, 1, 0, 0, 1, 1);
      rows.push({ strategy, width:bmp.width,height:bmp.height,bytes:p.file.size,type:p.file.type,
        pixel:Array.from(sample.getContext('2d')!.getImageData(0,0,1,1).data), same: p.file === file });
      bmp.close();
    }
    return rows;
  });
  expect(result[0]).toMatchObject({same:true,width:2400,height:1800,type:'image/png'});
  expect(result[1]).toMatchObject({width:1280,height:960,type:'image/jpeg'});
  expect(result[2]).toMatchObject({width:1280,height:1280,type:'image/jpeg'});
  expect(result[3]).toMatchObject({width:1800,height:1800,type:'image/jpeg'});
  expect(result[2].pixel[2]).toBeGreaterThan(230); expect(result[2].pixel[0]).toBeLessThan(20);
  expect(result[3].pixel[2]).toBeGreaterThan(230);
  expect(remote).toEqual([]);
});

test('small images are not upscaled; invalid crop and cancellation fail before upload', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { preparePrescriptionImage } = window;
    const c = document.createElement('canvas');c.width=96;c.height=64;
    const blob = await new Promise<Blob>(resolve => c.toBlob(b=>resolve(b!), 'image/png'));
    const file = new File([blob], 'small.png', {type:'image/png'});
    const small = await preparePrescriptionImage(file);
    let invalid = false, aborted = false;
    try { await preparePrescriptionImage(file, {crop:{x:1,y:0,width:.1,height:1}}); } catch { invalid = true; }
    const controller = new AbortController();controller.abort();
    try { await preparePrescriptionImage(file, {signal:controller.signal}); } catch { aborted = true; }
    return { width:small.width,height:small.height,invalid,aborted };
  });
  expect(result).toEqual({width:96,height:64,invalid:true,aborted:true});
});

test('EXIF orientation is applied once before normalized cropping', async ({ page }) => {
  const base64 = fs.readFileSync(path.resolve('e2e/fixtures/prescription-orientation.jpg')).toString('base64');
  const result = await page.evaluate(async base64 => {
    const { preparePrescriptionImage } = window;
    const file = new File([Uint8Array.from(atob(base64), c=>c.charCodeAt(0))], 'oriented.jpg', {type:'image/jpeg'});
    const p = await preparePrescriptionImage(file, {crop:{x:0,y:0,width:1,height:.5}});
    const b = await createImageBitmap(p.file);
    const c = document.createElement('canvas');c.width=c.height=1;
    c.getContext('2d')!.drawImage(b,0,0,1,1);
    const pixel=Array.from(c.getContext('2d')!.getImageData(0,0,1,1).data);b.close();
    return {width:p.width,height:p.height,pixel};
  }, base64);
  expect(result).toMatchObject({width:200,height:200});
  expect(result.pixel[0]).toBeGreaterThan(240); expect(result.pixel[2]).toBeLessThan(15);
});

test('scan requires crop confirmation and uploads a processed JPEG', async ({ page }) => {
  let bytes: Buffer | null = null;
  await page.route(url => url.pathname.endsWith('/prescription-scan'), async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST'}});return;
    }
    bytes=route.request().postDataBuffer();
    await route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({detail:{reason:'service_unavailable'}})});
  });
  await page.evaluate(() => {
    localStorage.setItem('CARE_AUTH_TOKEN','test-only');
    const originalFetch=window.fetch;
    window.fetch=async (input,init) => {
      if(String(input).includes('/prescription-scan') && init?.body instanceof FormData){
        const file=init.body.get('file') as File, image=await createImageBitmap(file);
        (window as unknown as {uploadedImage:unknown}).uploadedImage={width:image.width,height:image.height,type:file.type};image.close();
      }
      return originalFetch(input,init);
    };
    (window as unknown as {mountScanDialog:()=>void}).mountScanDialog();
  });
  const png = await page.evaluate(() => {
    const c=document.createElement('canvas');c.width=400;c.height=600;
    const ctx=c.getContext('2d')!, data=ctx.createImageData(400,600);
    let seed=31;
    for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=150+(seed%105);data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;}
    ctx.putImageData(data,0,0);return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel(t('meds.scan.captureButton'), {exact:true}).setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.getByRole('button',{name:t('meds.scan.startScan')})).toBeEnabled();
  expect(bytes).toBeNull();
  await expect(page.locator('cropper-selection')).toBeVisible();
  // Exercise the rendered resize handle, then inspect the actual uploaded image.
  const handle=page.locator('cropper-handle[action="e-resize"]');
  const box=await handle.boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.mouse.down();await page.mouse.move(box!.x-50,box!.y+box!.height/2,{steps:10});await page.mouse.up();
  await page.getByRole('button',{name:t('meds.scan.startScan')}).click();
  await expect.poll(() => bytes?.length ?? 0).toBeGreaterThan(0);
  expect(bytes!.includes(Buffer.from('image/jpeg'))).toBe(true);
  // WebKit's intercepted multipart body may omit file bytes. Inspect the actual FormData File too.
  const uploaded=await page.evaluate(()=>(window as unknown as {uploadedImage:{width:number;height:number;type:string}}).uploadedImage);
  expect(uploaded.type).toBe('image/jpeg');expect(uploaded.height).toBe(600);expect(uploaded.width).toBeLessThan(360);
});
