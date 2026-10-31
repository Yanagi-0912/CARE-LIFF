/** Size-only control: generated PNG -> JPEG .92 -> the same pipelines. No OCR/API calls. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
const out=path.resolve(process.env.COMPRESSION_OUT??'../output/prescription_compression_20261030');
const cases=JSON.parse(await fs.readFile(path.join(out,'cases.json'),'utf8')).filter(c=>c.group==='reviewed');
const server=await createServer({server:{host:'127.0.0.1',port:5175,strictPort:true,hmr:false}});await server.listen();
const browser=await chromium.launch();
const page=await browser.newPage();
await page.goto(process.env.COMPRESSION_BASE_URL??'http://127.0.0.1:5175/e2e/fixtures/prescription-image.html');
await page.waitForFunction(()=>window.ready);
const rows=[];
try{
  for(const c of cases){
    const input=await fs.readFile(path.isAbsolute(c.path)?c.path:path.resolve(out,c.path));
    rows.push(await page.evaluate(async ({base64,c})=>{
      const raw=Uint8Array.from(atob(base64),x=>x.charCodeAt(0));
      const source=await createImageBitmap(new Blob([raw],{type:'image/png'}));
      const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
      canvas.getContext('2d').drawImage(source,0,0);source.close();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
      const file=new File([blob],`${c.id}.jpg`,{type:'image/jpeg'});
      const row={id:c.id,sourcePngBytes:raw.length,jpeg92Bytes:file.size,strategies:{}};
      for(const strategy of ['general','crop','adaptive']){
        const p=await window.preparePrescriptionImage(file,{strategy,crop:c.crop});
        row.strategies[strategy]={bytes:p.outputBytes,preprocessingMs:p.preprocessingMs,quality:p.quality};
      }
      canvas.width=canvas.height=1;return row;
    },{base64:input.toString('base64'),c}));
  }
}finally{await browser.close();await server.close();}
await fs.writeFile(path.join(out,'jpeg_size_calibration.json'),JSON.stringify({
  description:'Size-only sensitivity control; source JPEGs were derived at quality .92 from the same synthetic PNGs, not actual phone photos. No OCR was run on this control.',
  count:rows.length,rows,
},null,2)+'\n');
console.log(JSON.stringify({count:rows.length,apiCalls:0}));
