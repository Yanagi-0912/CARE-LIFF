# Prescription image upload

Selecting a photo opens a Cropper.js preview. The initial selection includes the whole photo; the user can remove the background while retaining all bag text. Crop coordinates refer to the EXIF-oriented source, independently of preview CSS dimensions. Confirmation prepares the upload locally, then calls the existing prescription scan API. The recognition review and manual-entry paths remain available.

`src/utils/prescriptionImage.ts` contains the implementation shared by the dialog and benchmark:

| Strategy | Crop | Resize | JPEG quality |
| --- | --- | --- | --- |
| `original` | none | none | unchanged bytes |
| `general` | none | browser canvas, max edge 1280 | browser-image-compression, initial .75 |
| `crop` (dialog default) | normalized manual rectangle | same as general | same as general |
| `adaptive` | normalized manual rectangle | pica mks2013 when necessary, max edge 1800 | .84; increase to .92 when edge-weighted luma RMSE exceeds .025 |

Images are never upscaled. The adaptive error compares JPEG encoding with the resized reference; it **does not establish that resizing preserves OCR accuracy**. The 1800-pixel edge is a conservative starting point and must be assessed on real device photos with small print. This is a pixel-error heuristic, not a trained semantic/text compression model. No sharpening, generative restoration, perspective correction or device OCR is included.

The dialog explicitly selects `crop` after this synthetic comparison: all 100 reviewed cases returned and all eligible name/strength/frequency fields matched, while the other compressed settings had a name error on R038. This does not establish the best preset for real phone photos, particularly smaller print; deployment still needs device validation. The benchmark crop rectangles were manually annotated, so choosing the full image in the dialog does not reproduce those rectangles automatically.

The compression worker library is imported as a Vite asset and served from the app origin, avoiding its package's default third-party CDN. Cropper and the processing implementation load on demand. Canvas and decode errors stop processing; the user can retake or explicitly send the original. An unmounted dialog aborts pending preprocessing. The original is kept in memory for retry; it is not overwritten. Re-encoded output drops EXIF metadata; an unchanged original can retain its metadata.

## Verification

```sh
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
npx playwright test e2e/prescription-image.spec.ts --workers=2
npm run build
```

The browser tests exercise actual canvas/Worker/pica processing on Chromium and WebKit, EXIF rotation, normalized crop geometry, no upscaling, cancellation, and the actual file in the upload FormData after dragging the crop handle. They are browser-engine tests rather than a real LINE WebView or phone performance measurement.

## Full synthetic comparison

Experiment directory: `../output/prescription_compression_20261030/`. It contains 112 selected source cases (100 reviewed realistic synthetic PNGs and 12 generative degradations), fixed manual crop rectangles, first-attempt timings and actual uploaded images. Only this fictional dataset is authorized for these benchmark calls. A full run makes **448 OCR service invocations** that can incur API charges (the existing Gemini SDK can retry internally); `npm test` does not invoke it.

From the workspace root, start the local adapter using the existing CARE environment:

```sh
CARE/.venv/bin/python output/prescription_compression_20261030/serve_benchmark.py
```

In another terminal, from this frontend folder:

```sh
npm run benchmark:prescription-images
```

After the run, rebuild the report from saved results, without any API calls:

```sh
CARE/.venv/bin/python output/prescription_compression_20261030/finalize.py
```

The final command is run from the workspace root. The runner requires free local ports 5174 and 8766 and the Chromium Playwright browser. `COMPRESSION_OUT` can select an experiment directory with its own `cases.json`. Source hashes are checked. Existing client results are skipped; mismatched pipeline hashes or a server result without a corresponding client timing stop the runner for inspection instead of presenting cached timings as a fresh measurement.

Four isolated clients each use CDP upload 500,000 bits/s, download 2,000,000 bits/s and minimum response latency 150 ms. CDP latency is a lower bound to receiving response headers, not an added per-packet RTT. Measured server body-read time is checked against file bytes / 62,500 bytes/s. The shared host calls the unchanged CARE OCR service and catalog over its real Gemini network connection. The adapter excludes production authentication, database writes and draft creation; it never saves fake medication records to a user's account.

Total time runs from beginning browser preprocessing to receiving the response. XHR's upload-complete event and the server's body-read duration are both retained; neither is silently substituted for the other. Image bytes exclude HTTP/TLS headers, multipart overhead and server-to-Gemini traffic. Preview/crop interaction and first application downloads are excluded. Each strategy receives one first attempt per image; failures are retained, without retries replacing them.

The report separates API availability from correctness among successful responses and compares fields only on pairs where both requests returned. Name/strength/frequency labels come from the previous visual review, not from image generation prompts. Two ambiguous source drug items are excluded. The 12 degraded images have separate qualitative results: a clear reference is not ground truth for text that became obscured, missing or changed in a generative edit. PNG-to-JPEG savings do not directly predict savings from real phone JPEGs, and the limited medication vocabulary and large print can make synthetic accuracy optimistic.

Primary implementation references: [browser-image-compression](https://github.com/Donaldcwl/browser-image-compression), [pica](https://github.com/nodeca/pica), [Cropper.js](https://fengyuanchen.github.io/cropperjs/api/), [Chrome network emulation definitions](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Network.pdl).
