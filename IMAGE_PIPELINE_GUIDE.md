# ShilpSetu Backend — Image Pipeline Check & Issue Fixes

This guide explains how to manually verify the image-processing pipeline end-to-end, and how to fix the issues found during the feature check (2026-09-03).

---

## Part 1 — How to check the image processing pipeline

### Prerequisites
- **PostgreSQL** running on port `5433` (db: `shilpsetu`)
- **Redis** running on port `6380`
- Backend started. ⚠️ The default `.env` port is `5000`, which is currently occupied by another app (`omniroute`) — see **Issue #4** below. For testing, start on a free port:

```powershell
$env:PORT = "5001"
npm start
```

You should see the startup banner and `[Worker] 🚀 Image processing worker started.`

### Step 1 — Health check
```powershell
Invoke-RestMethod -Uri "http://localhost:5001/health" -TimeoutSec 10
```
Expected: `{ status = ok, timestamp = ... }`

### Step 2 — Sign up / sign in (auth is phone-based, not email)
```powershell
# Sign up
$body = @{ name = "Test User"; phone = "9899990000"; password = "TestPass123!" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5001/api/auth/signup" -Method Post -Body $body -ContentType "application/json"
```
Capture the `token` from the response. (If the phone is already registered, sign in instead.)

### Step 3 — Upload an image and queue processing
Use `curl` (multipart — PowerShell 5.1 has no `-Form`):

```bash
TOKEN="<paste token>"
curl -X POST http://localhost:5001/api/image-batches/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@scratch_cleaned.png" \
  -F "style=white_studio"
```
Expected: HTTP `201` with `batchId`, `imageId`, and `status: "PROCESSING"`.

Valid `style` values: `white_studio`, `wooden_surface`, `marble_surface`, `luxury`.

### Step 4 — Poll the batch until it completes
```bash
curl -X GET "http://localhost:5001/api/image-batches/<batchId>" -H "Authorization: Bearer $TOKEN"
```
Watch `status` go `PROCESSING` → `COMPLETED`. The pipeline runs these stages (each is stored as a version):
`ORIGINAL → CUTOUT (bg removal) → CLEANED → STUDIO → LIGHTING → SHADOW → COMPOSITION → FINAL_1X1 / FINAL_4X5 / FINAL_16X9`

On success the image shows `progress: 100`, `validationScore` (e.g. `0.95`), `error: null`, and `outputs` with signed R2 URLs for `square` / `portrait` / `landscape`.

### Step 5 — Verify the outputs are actually downloadable
```bash
# Get the signed download URLs
curl -X GET "http://localhost:5001/api/image-batches/<batchId>/images/<imageId>/download" -H "Authorization: Bearer $TOKEN"
# Then fetch one of them (square) and confirm it's a real JPEG
curl -o /tmp/out.jpg "<square_url>"
file /tmp/out.jpg   # → JPEG image data, 2000x2000
```

### Step 6 — Check the full analysis & version history
```bash
curl -X GET "http://localhost:5001/api/image-batches/<batchId>/images/<imageId>" -H "Authorization: Bearer $TOKEN"
```
Expected: rich `analysis` (product type, materials, colors, preservation rules), `boundingBox`, and the full `versions[]` array.

### Negative checks (should fail cleanly)
```bash
# No token → 401
curl -X GET "http://localhost:5001/api/image-batches/whatever"
# Invalid token → 401
curl -X GET "http://localhost:5001/api/image-batches/whatever" -H "Authorization: Bearer bad.token"
# Unknown style → 404
curl -X GET "http://localhost:5001/api/studio-styles/nope/preview"
```

### Watching the worker logs
While a batch processes, the server log prints the stages, e.g.:
- `[Segmentation] Calling Poof.bg AI background removal API...` → `✅ ... succeeded`
- `[Lighting] AI analysis → brightness=..., contrast=..., saturation=...`
- `[Worker] ✅ Job <id> completed.`
- `{"event":"ai_usage_log",...}` — per-provider AI calls; `success:false` here is your first sign of a provider problem (see below).

---

## Part 2 — Issue-by-issue: root cause & fixes

### Issue #1 — Groq AI fallback is broken (decommissioned model)
**Root cause:** `src/modules/image/ai/groq.provider.ts:23` hard-codes
`llama-3.2-90b-vision-preview`, which the Groq API now rejects:

```
The model `llama-3.2-90b-vision-preview` has been decommissioned and is no longer supported.
```

So when Gemini fails (see #2), the pipeline tries Groq → it also fails → it falls through to the generic in-memory "fallback" provider, which returns **canned placeholder data** instead of real AI analysis.

**Why it can't be trivially patched right now:** I queried `https://api.groq.com/openai/v1/models` with the key in `.env`, and **no vision-capable model is available** on this key. So simply swapping the model string won't help unless/until Groq exposes a vision model to this account.

**Recommended fix — add OpenAI as the paid backup (already wired in `ai.service.ts`):**
1. Get an OpenAI key and set it in `.env`:
   ```
   OPENAI_API_KEY="sk-..."
   ```
2. `AIService` already registers the `openai` provider (priority `gemini → groq → openai`), so no code change is needed — OpenAI automatically becomes the next fallback after Groq fails.
3. If you want Groq to *actually* work (free), find a vision model your key has access to:
   ```bash
   curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
   ```
   Update `visionModel` in `groq.provider.ts` to a model from that list that accepts `image_url` content, and re-run a detection to confirm.

**Note:** there is also a `meta-llama/llama-prompt-guard-2-*` model available, but that's a prompt-injection guard, **not** a vision analyzer — do not use it here.

---

### Issue #2 — Gemini free-tier rate limits make processing flaky
**Root cause:** `GEMINI_API_KEY` is on the free tier, capped at **20 requests/day** for `gemini-2.5-flash`. The log shows repeated `429 Quota exceeded ... limit: 20`. The pipeline only completed because the quota freed up on retry; under real load this will fail frequently.

**Fixes (pick what fits):**
1. **Add `OPENAI_API_KEY`** (paid) so OpenAI absorbs the load when Gemini is rate-limited — this is the highest-leverage fix and doubles as Issue #1's fix.
2. **Upgrade the Gemini key** to a paid plan to raise the per-day cap.
3. **Add a short retry/backoff** for transient `429`s. The current code does try providers in sequence but doesn't honor Groq's/`RetryInfo` backoff; consider sleeping briefly before trying the next provider on `RESOURCE_EXHAUSTED`.
4. **Reduce per-day burn:** the pipeline calls the vision model for *analysis, detection, lighting, and validation*. If any of these can be skipped or cached per image in dev, you'll stretch the quota further.

---

### Issue #3 — Catalog / marketplace / admin features are not wired in
**Root cause:** The route files exist but are **0-byte stubs** and are not imported in `src/app.ts` (only `auth`, `style`, and `image` routes are mounted). The backing services exist on disk (`catalog.service.ts`, `marketplace.service.ts`, `pricing.service.ts`, `analytics.service.ts`, `voice.service.ts`) but are unreachable — dead code, not working endpoints.

**To wire a module up:**
1. Implement the routes in the matching `src/routes/*.routes.ts` (they're currently empty).
2. Import it in `src/app.ts` and mount it, e.g.:
   ```ts
   import catalogRoutes from './routes/catalog.routes';
   app.use('/api', catalogRoutes);
   ```
3. Ensure the controller calls the existing service.
4. Only do this for modules that are actually ready — if a service is incomplete, finish it first so you don't expose half-working endpoints.

---

### Issue #4 — Can't run the backend on the configured port (EADDRINUSE)
**Root cause:** `.env` sets `PORT=5000`, but port `5000` is currently taken by another app — `omniroute` (PID `13976`) — not by the ShilpSetu backend (which isn't running). Starting `npm run dev` therefore fails with `EADDRINUSE`.

**Fixes (pick one):**
1. **Free port 5000** (if `omniroute` isn't needed right now): stop PID `13976`:
   ```powershell
   Stop-Process -Id 13976 -Force
   ```
   Then `npm run dev` works on the default `5000`.
2. **Use a different port** without touching `.env`:
   ```powershell
   $env:PORT = "5001"; npm run dev
   ```
3. **Change the default port** in `.env` (e.g. `PORT=5001`) if `5000` is permanently owned by another tool.
4. Check what's actually holding the port first, in case it changed since this was written:
   ```powershell
   Get-NetTCPConnection -State Listen -LocalPort 5000 | Select-Object LocalPort, OwningProcess
   Get-Process -Id <pid> | Select-Object ProcessName, Path
   ```

---

### Issue #5 — Minor: `tsc --noEmit` fails; unauthenticated unknown `/api/*` returns 401
**Root cause A (typecheck):** the installed `typescript@7.0.2` is missing its platform binary package (`@typescript/typescript-win32-x64`). The `tsx` runtime uses esbuild and doesn't typecheck, so **the app runs fine** — but any `tsc`-based tooling / CI fails.

**Fix A:**
```powershell
npm install --save-dev @typescript/typescript-win32-x64
```
(or reinstall TypeScript / align it with the `@types/node` version). Verify with `npx tsc --noEmit`.

**Root cause B (401 vs 404):** `imageRoutes` is mounted at `/api` and starts with `router.use(authenticate)`, so *every* unmatched `/api/*` request hits auth first and returns `401` before reaching the app's 404 handler. Harmless but misleading when probing routes.

**Fix B (optional):** move the `authenticate` middleware from the router-level `router.use(authenticate)` onto the individual protected routes (or scope the image router mount more narrowly), so unknown paths fall through to the 404 handler. Or accept the current behavior.

---

## Quick reference — endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | no | Liveness |
| POST | `/api/auth/signup` | no | Register (name, phone, password) |
| POST | `/api/auth/signin` | no | Login (phone, password) → JWT |
| GET | `/api/studio-styles` | no | List styles + base64 previews |
| GET | `/api/studio-styles/:id/preview` | no | Single style JPEG preview |
| POST | `/api/image-batches/upload` | yes | Direct multipart upload (1–4 files) |
| POST | `/api/image-batches` | yes | Create batch + presigned URLs |
| POST | `/api/image-batches/:id/complete` | yes | Finalize + enqueue |
| GET | `/api/image-batches/:id` | yes | Batch status + outputs |
| POST | `/api/image-batches/:id/cancel` | yes | Cancel batch |
| POST | `/api/image-batches/:id/images/:img/retry` | yes | Retry a failed image |
| GET | `/api/image-batches/:id/images/:img` | yes | Image analysis + versions |
| GET | `/api/image-batches/:id/images/:img/download` | yes | Signed download URLs |
