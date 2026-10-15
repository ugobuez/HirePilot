# HirePilot Endpoint Inventory

Complete inventory of every HTTP route registered by `server/server.js`, derived
from the actual Express mounts (not hand-maintained from memory). Use this as the
contract between frontend and backend.

- **Base URL (production):** `https://hirepilot-jber.onrender.com` (Render)
- **Frontend (production):** `https://hire-pilot-job.vercel.app` (Vercel)
- **Auth:** `Authorization: Bearer <JWT>` — issued by `POST /api/v1/auth/signup`
  and `POST /api/v1/auth/login`, valid 7 days.
- **Rate limits:** global 240 req/min per IP; the LLM endpoint bucket is
  30 req/min (`llmLimiter`, mounted on `/api` → `/api/analyze`).
- **Content type:** JSON bodies (`application/json`, 1 MB cap) unless noted as
  `multipart/form-data` for uploads.

## Verification status

Automated coverage lives in `server/tests/`:

| Suite | File | Covers |
| --- | --- | --- |
| Endpoint inventory | `server/tests/endpoints.test.js` | Every route below: success, 401, 400, 404, CORS, CRUD persistence |
| Health/hardening | `server/tests/api.test.js` | `/api/health`, security headers, request ids, 404, oversized bodies |
| Resume extraction | `server/tests/extractResumeApi.test.js` | `/api/v1/auth/extract-resume` incl. provider failure fallback |
| LLM routing | `server/tests/llmRouting.test.js` | Provider chain, retries, local fallback, JSON repair |

Routes whose success path launches a browser (Playwright → live site) are
covered by their **auth guard** only; the browser path is exercised manually —
called out per-route below.

---

## Root and health

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/` | none | Service banner: `{name, status, health}` |
| GET | `/api/health` | none | Combined readiness (DB + LLM mode + feature flags). Render `healthCheckPath`. 503 when DB down. |
| GET | `/api/health/live` | none | **Liveness**: 200 always while the process runs. No DB/provider calls → no restart loops on Mongo blips. |
| GET | `/api/health/ready` | none | **Readiness**: 200 only when `mongoose.connection.readyState === "connected"`, else 503. Returns `database` state only — never the URI, secrets, or stack. |

Unknown paths return `404 {error: "Not found", path, id}`. Every response
carries an `x-request-id` header (echoes caller-supplied `x-request-id`).

## Auth — `/api/v1/auth`

| Method | Path | Auth | Inputs | Success | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/signup` | none | `email`, `password` (+ optional onboarding fields) | 201 `{token, user}` | 400 missing/duplicate |
| POST | `/login` | none | `email`, `password` | 200 `{token, user}` | 400 missing, 401 bad credentials |
| POST | `/forgot-password` | none | `email` | 200 generic message (never reveals existence) | 400 missing |
| GET | `/me` | Bearer | — | 200 `{user}` (no password field) | 401 missing/invalid token |
| PUT | `/onboarding` | Bearer | `onboardingDetails{}`, `baseResumeText`, `dailyApplicationsCount` | 200 `{user}` (persists) | 401 |
| POST | `/extract-resume` | Bearer | multipart `resume` file; `?fastParse=false` opts into one LLM call | 200 `{resumeText, profile, parsing}` | 401, 400 missing file/undecodable, 500 |
| GET | `/profile` | Bearer | — | 200 `{onboardingDetails, settings, baseResumeText, metrics}` | 401 |

## Applications — `/api/v1/applications`

All routes require Bearer auth and are **scoped to the owning user** (queries
filter by `userId`; another user's id yields 404, never data).

| Method | Path | Inputs | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/` | `?status=` optional | 200 `[application]` newest-first | 401 |
| POST | `/` | `jobTitle`, `company`, optional `status/location/jobDescription/source` | 201 application with `history[0]` | 401, 500 |
| GET | `/stats` | — | 200 `{total, applicationsToday/Week, applied, interviews, offers, ..., byStatus, bySource, topCompanies, timeline}` | 401 |
| POST | `/manual-apply` | `jobTitle`, `company`, optional `location/jobDescription/source` | 201 with `status:"Scraped"` | 401 |
| PUT | `/:id` | partial application fields | 200 updated | 401, 404 unknown/foreign id |
| PUT | `/:id/status` | `status` (whitelisted: Scraped…Ghosted/Archived), optional `note` | 200 updated + pushed `history`; `appliedAt` set when Applied | 401, 400 invalid status, 404 |
| DELETE | `/:id` | — | 200 `{message}` | 401, 404 |
| POST | `/:id/tailor` | — | 200 `{application, scanResult}` | 401, 404 unknown id, 400 no master resume, 500 |

`/:id/tailor` success runs the LLM scan+tailor chain (local fallback without
keys) — covered hermetically by its 404/400 guards in the automated suite.

## Jobs — `/api/jobs`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | none | `{jobs[], total, page, limit, hasMore}`; sources behind `FLAG_SOURCE_*` toggles |
| GET | `/search` | none | Same envelope + `filters` echo (`query, country, company, role, remote, salary, techStack, experienceLevel, visaSponsorship`) |
| GET | `/sources` | none | `{total, sources[]}` registry metadata — **no network** |
| GET | `/for-user` | Bearer | AI-scored for the caller: `{jobs[], total, page, limit, hasMore, dedupedFrom}` |
| GET | `/sections` | Bearer | Dashboard: `{recommended[], sections[], total, minAts, sources}` |

## Automation — `/api/v1/automation`

All routes require Bearer auth.

| Method | Path | Inputs | Success | Notes |
| --- | --- | --- | --- | --- |
| GET | `/preflight` | — | `{passed, checks{onboarding,openRouter,playwright}, onboardingErrors[]}` | **Success launches Chromium** (Playwright warm-up). Automated suite asserts 401 only. |
| POST | `/run` | `dryRun?`, `maxApplications?` | run report `{preflight, jobsFound, jobsProcessed, applicationsSubmitted, errors[]}` | Browser + scraping pipeline; automated suite asserts 401 only. |
| POST | `/scan` | — | dry-run report (`dryRun:true`, no submissions) | Same browser dependency; 401 asserted. |
| GET | `/auto-apply` | — | `{settings, dailyLimit, remaining, lastAutoApplyAt}` | Fully covered (GET + persistence) |
| PUT | `/auto-apply` | `enabled, interval, minAts, dailyLimit, countries, remoteOnly, keywords, ...` | `{settings}` persisted | Covered incl. fresh-read persistence |
| POST | `/auto-apply/run` | `dryRun?`, `maxPerRun?` | run summary | Browser-dependent; 401 asserted |
| POST | `/auto-apply/jobs` | `jobs[]`, `dryRun?` | per-job summary | Browser-dependent; 401 asserted |

## AI — `/api/analyze`

| Method | Path | Auth | Inputs | Success | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/analyze` | none (rate-limited 30/min) | multipart `resume` + field `jobDesc` | 200 `{resumeText, parsedResume, coverLetter, matchScore, missingSkills}` | 400 missing file/jobDesc, 400 undecodable text, 500 |

No LLM key → local scoring + template cover letter (never a hard failure).

## Scraping and resume upload

| Method | Path | Auth | Inputs | Success | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/scrape-jobs` | none | optional query filters | 200 `{message, total, saved}` | 500 |
| POST | `/api/resume/upload-resume` | none | multipart `resume` (PDF, ≤10 MB; types: pdf/docx/doc/rtf/txt) | 200 `{message, resumeId, extractor}` | 400 missing file, 422 unparseable PDF, 500 |

## Cross-cutting behavior

- **CORS:** explicit allow-list (`corsOrigins`), never `*`. Defaults:
  `http://localhost:3000`, `https://hire-pilot-job.vercel.app`. Override via
  `CORS_ORIGINS` (comma-separated) for previews. Disallowed origins receive no
  `Access-Control-Allow-Origin` header.
- **Security headers:** `helmet` (CSP `default-src 'none'` for API responses,
  `x-content-type-options: nosniff`), `x-powered-by` removed.
- **Error shape:** `{error: string, id?}` — production 5xx bodies are
  `"Internal server error"` (never internals); 4xx echo the reason.
- **Secrets:** JWT/encryption/Mongo/LLM keys live only in backend env vars
  (Render). Frontend needs only `REACT_APP_API_URL` (public by design).

