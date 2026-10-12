# Vendored libraries

Unmodified copies. Update by downloading the same path with a new version number.

| File | Library | Version | Source |
|---|---|---|---|
| `chart.umd.js` | Chart.js | 4.4.4 | https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js |
| `pdf.min.mjs` | pdf.js (legacy build) | 4.10.38 | https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs |
| `pdf.worker.min.mjs` | pdf.js worker (legacy build) | 4.10.38 | https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs |

## How pdf.js is loaded

- In Node (tests, CLI): `GlobalWorkerOptions.workerSrc` is set to the `file://` URL of
  `pdf.worker.min.mjs`; pdf.js then runs its "fake worker" on the main thread.
- In the browser bundle: the worker source is inlined in a `<script type="text/plain">` element,
  turned into a Blob URL and used as `workerSrc`. That works from `file://` (origin `null`) in
  Chrome and Edge. Firefox is untested (not installed on the development machine).
- pdf.js transfers (detaches) the `ArrayBuffer` it is given. Always pass it a copy if the bytes
  are needed afterwards.
