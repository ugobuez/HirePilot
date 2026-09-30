# HirePilot — Audit (Phase 0)

> Snapshot audited at commit `b6799d1` on branch `main`.

## 1. What is real vs stubbed

| Area | Status | Notes |
|---|---|---|
| `server/server.js` | Real but fragile | Hardcoded CORS origins, no helmet, no rate limit, no zod validation, `mongoose.connect` fire-and-forget (server starts even if DB is down), DNS override hack, unauthenticated background cron in server boot. |
| `auth` (authController/routes) | Real | bcrypt + JWT, but JWT returned in body (localStorage) instead of httpOnly cookie; no rate limiting; no password rules; no zod validation. |
| `onboarding` (User.onboardingDetails) | Partial | Collects name/phone/location/skills/years + work-auth booleans only. No visa-sponsorship-per-country, relocation, timezone, answerBank, EO fields, notice period, blacklist, references, certifications. |
| `scraperService` + `jobSources` | Real network code, wrong targets | Relies on Apify client; no per-source allowlist/feature flags, weak error isolation. |
| `automationRunner` / `autoApplyService` | Stub-ish | 60s timer with no queue persistence, no idempotency, no resume-after-restart, no per-job status, no "needs action" states. Auto-apply runs silently at boot. |
| `jobscanService` (scoring) | Real but flawed (see §3) | LLM-dependent for the "good" score; local fallback returns a flat fake score (72) or naive `includes()` matching. |
| `jobScoreService` | Thin wrapper | Double-counts keywords, no per-category explanation for the local path, `salaryMatch/locationMatch` are constants not matches. |
| `tailorService` | Prompt-only | Good anti-hallucination prompt, but no post-check that output is grounded in the base resume; missing keywords passed straight to the LLM (encourages inserting unsupported skills). |
| PDF generation | Missing entirely | No pdfkit/Playwright rendering anywhere. Applications only store text. |
| Answer provenance / screening questions | Missing | No answer bank, no question classification, no "questions for you" inbox. |
| Follow-ups / funnel analytics / interview prep | Missing | No models, no endpoints, no UI. |
| Client `App.js` | Marketing fiction | Fake log lines ("[STEALTH] Bypassing Cloudflare protection... OK", "[SUBMIT] Application submitted to LinkedIn") that never happen; landing page advertises "Stealth Evasion". Removed (safety + honesty). |
| `client/.env` | Tracked in git | Contains only a public API URL today, but env files should never be tracked. Untracked. |
| `server/node_modules` | Tracked in git | ~100+ MB of vendored deps in history. Untracked. |

## 2. Security problems found

1. Hardcoded OpenRouter API key in `server/middleware/services/openRouterService.js` (`FALLBACK_KEY`). Removed; config now comes from env only.
2. `client/.env` tracked in git (no secrets today, but a footgun). Untracked and ignored.
3. `server/node_modules` tracked in git. Untracked and ignored.
4. No helmet, no rate limiting, no input validation, no request IDs, no structured logging.
5. JWT in JSON body; no httpOnly cookie; no refresh story.
6. CORS list includes a hardcoded Render URL; the `!origin` short-circuit allows any non-browser client.
7. Health endpoint reports `jobscan/tailor` as `true` unconditionally — misleading.
8. Mongoose connection errors are logged but the server keeps serving — no fail-fast.

## 3. Scoring engine bugs (Addendum H §3 input)

- Local fallback score is a constant (72) when the profile has no skills — every job looks identical and passes the 70 gate.
- Matching is raw `String.includes()`: no word boundaries, no stemming, no synonyms.
- `keywordMatch` and `hardSkills` are both fed from the same skill list — double counting (35% + 15% of the same signal).
- `salaryMatch`/`locationMatch` are constants (100/80-85), not derived from anything.
- Hard-requirement mismatch zeroes the whole score (0) instead of a justified skip with partial signal.
- LLM path can return arbitrary unnormalized scores; failures silently fall back to a different scale.
- No must-have vs nice-to-have weighting, no required-years extraction, no keyword-stuffing penalty, no explainability for the local path.

## 4. Stealth / anti-bot code present (to be removed)

- Dependencies: `playwright-extra`, `puppeteer-extra-plugin-stealth`, `apify-client` in `server/package.json`. All removed.
- Client copy: "Stealth Evasion" feature, "[STEALTH] Bypassing Cloudflare protection... OK" log line, FAQ answer describing fingerprint randomization and bypassing Cloudflare/DataDome. All removed.
- LinkedIn/Indeed removed as targets (policy); fake "submitted to LinkedIn" logs removed.

## 5. Broken / dead code

- Root `package.json` is a stub with 2 server-side deps.
- `Resume` model is a 3-field shell; resume logic actually lives on `User.baseResumeText`.
- Duplicate scraping paths: `scrapeRoutes`/`scrapeController` vs `jobRoutes`/`jobController` both aggregate jobs.
- `pdf-parse` AND `pdf-parse-fixed` both installed; only one needed.

## 6. What stays manual (by design)

- Solving CAPTCHAs / logging into employer sites (no bypass code exists or will exist).
- Clicking Submit on sites that require it (review-before-submit is the default mode).
- Supplying answers to factual/legal screening questions HirePilot cannot truthfully answer.
- Any messaging on LinkedIn (drafts only, never sent automatically).
