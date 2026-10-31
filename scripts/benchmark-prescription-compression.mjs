import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const out = path.resolve(process.env.COMPRESSION_OUT ?? '../output/prescription_compression_20261030');
const cases = JSON.parse(await fs.readFile(path.join(out, 'cases.json'), 'utf8'));
const strategies = ['original', 'general', 'crop', 'adaptive'];
const profile = { uploadBitsPerSecond: 500_000, downloadBitsPerSecond: 2_000_000, latencyMs: 150 };
const pipelineSha256 = crypto.createHash('sha256').update(await fs.readFile('src/utils/prescriptionImage.ts')).digest('hex');
const clientDir = path.join(out, 'client'); await fs.mkdir(clientDir, { recursive: true });
const jobs = [];
// Seeded shuffle, retaining all 112 paired cases and all 4 strategies.
let seed = 20261030;
const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 2 ** 32; };
for (const c of cases) for (const strategy of strategies) jobs.push({ ...c, strategy });
for (let i = jobs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i+1)); [jobs[i], jobs[j]] = [jobs[j], jobs[i]]; }
const infoPath = path.join(out, 'run_info.json');
let previousInfo;
try {
  previousInfo = JSON.parse(await fs.readFile(infoPath, 'utf8'));
  if (previousInfo.pipelineSha256 && previousInfo.pipelineSha256 !== pipelineSha256) throw new Error('Pipeline changed; use a new output directory.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.writeFile(infoPath, JSON.stringify({
  caseCount: cases.length, strategyCount: 4, plannedCalls: jobs.length, profile, concurrentClients: 4,
  measurement: 'Browser preprocessing + actual XHR to local unchanged CARE OCR adapter; CDP throttles each isolated client.',
  uploadMetric: 'XHR upload load event, not a claim of exact server-receipt time; server receive time recorded separately.',
  sources: '100 reviewed synthetic PNGs + 12 generative degradations; no real patient data.',
  crop: 'Fixed, manually annotated normalized rectangles, shared by crop and adaptive. Annotation time excluded.',
  adaptive: '1800px maximum edge, no upscaling, pica mks2013 where resizing is needed; JPEG .84 or .92 chosen by edge-weighted pixel RMSE > .025. Heuristic, not semantic OCR compression.',
  general: '1280px maximum edge, JPEG initial quality .75 via browser-image-compression; crop strategy uses the same settings after manual crop.',
  order: jobs.map(j => `${j.id}-${j.strategy}`), startedAt: previousInfo?.startedAt ?? new Date().toISOString(), pipelineSha256,
  resumedAt: previousInfo ? [...(previousInfo.resumedAt ?? []), new Date().toISOString()] : [],
  hmrDisabled: true,
  packages: JSON.parse(await fs.readFile('package.json','utf8')).dependencies,
}, null, 2));
const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true, hmr: false } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const completed = [];
let consecutiveInfrastructureFailures = 0;
let stop = false;
async function worker(index) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', error => console.error('PAGE', error.message));
  await page.goto('http://127.0.0.1:5174/e2e/fixtures/prescription-image.html');
  await page.waitForFunction(() => window.ready === true);
  await page.evaluate(async () => { window.prepareImage = (await import('/src/utils/prescriptionImage.ts')).preparePrescriptionImage; });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: profile.latencyMs,
    downloadThroughput: profile.downloadBitsPerSecond / 8,
    uploadThroughput: profile.uploadBitsPerSecond / 8,
    connectionType: 'cellular3g',
  });
  while (jobs.length && !stop) {
    const job = jobs.shift(); const key = `${job.id}-${job.strategy}`;
    const dest = path.join(clientDir, `${key}.json`);
    try { await fs.access(dest); continue; } catch { /* resumable */ }
    const bytes = await fs.readFile(path.isAbsolute(job.path) ? job.path : path.resolve(out,job.path));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== job.sha256) throw new Error(`Source changed: ${job.id}`);
    const result = await page.evaluate(async ({ base64, job }) => {
      const raw = Uint8Array.from(atob(base64), x => x.charCodeAt(0));
      const file = new File([raw], `${job.id}.png`, { type: 'image/png' });
      const startedAt = new Date().toISOString();
      const start = performance.now();
      const prepared = await window.prepareImage(file, { strategy: job.strategy, crop: job.crop });
      const requestStart = performance.now();
      let uploadSeconds = null;
      const response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `http://127.0.0.1:8766/scan/${job.id}/${job.strategy}`);
        xhr.setRequestHeader('Content-Type', prepared.file.type);
        xhr.timeout = 180000;
        xhr.upload.addEventListener('load', () => { uploadSeconds = (performance.now()-requestStart)/1000; });
        xhr.onload = () => xhr.status === 200 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(`HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error('XHR transport failed'));
        xhr.ontimeout = () => reject(new Error('XHR timeout'));
        xhr.send(prepared.file);
      });
      const end = performance.now();
      const { file: unused, ...processing } = prepared;
      void unused;
      return { id: job.id, group: job.group, strategy: job.strategy, startedAt, processing,
        uploadSeconds, requestSeconds: (end-requestStart)/1000, totalSeconds: (end-start)/1000, response };
    }, { base64: bytes.toString('base64'), job });
    if (result.response.cached) throw new Error(`Server result exists without client timing: ${key}; inspect before resuming`);
    await fs.writeFile(dest, JSON.stringify(result, null, 2)+'\n');
    completed.push(result);
    consecutiveInfrastructureFailures = result.response.failure_reason === 'service_unavailable' ? consecutiveInfrastructureFailures+1 : 0;
    console.log(JSON.stringify({ worker:index, completed:completed.length, remaining:jobs.length, key, bytes:result.processing.outputBytes,
      prep: +(result.processing.preprocessingMs/1000).toFixed(3), upload:+result.uploadSeconds?.toFixed(2),
      total:+result.totalSeconds.toFixed(2), status:result.response.status }));
    if (consecutiveInfrastructureFailures >= 4) { stop = true; console.error('Stopped after four consecutive infrastructure failures. Data retained.'); }
  }
  await ctx.close();
}
try { await Promise.all(Array.from({length: Number(process.env.BENCHMARK_CLIENTS ?? 4)}, (_, i) => worker(i))); }
finally { await browser.close(); await server.close(); }
console.log(JSON.stringify({finishedThisRun:completed.length, stopped:stop}));
