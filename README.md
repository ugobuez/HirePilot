# 🚀 HirePilot — Autonomous Job Application & Tailoring Agent

A fully automated, AI-powered job application platform that helps software developers secure multiple interview callbacks within 1 week. Uses OpenRouter's free model tier for zero operational cost.

## 🌟 Features

- **JWT Authentication** — Secure signup/login with bcrypt password hashing
- **Dynamic Role Expansion** — Analyzes your skills and automatically generates 8-12 job search terms (direct matches, adjacent roles, cross-functional opportunities)
- **ATS JobScan Engine** — Enterprise-grade 8-category weighted scoring (Keyword 35%, Title 10%, Experience 15%, Education 5%, Formatting 10%, Hard Skills 15%, Soft Skills 5%, Critical 5%) with hybrid OpenRouter + local fallback
- **Hallucination-Safe Resume Tailoring** — AI rewrites your resume with strict anti-hallucination directives; never invents skills or experience
- **Cover Letter Generation** — Professional 3-paragraph cover letters tailored to each role
- **SCAN → UPGRADE → RE-SCAN → APPLY Pipeline** — Recursive self-improvement: initial scan, tailor if 50-89%, re-scan to verify ≥90%, then apply
- **Playwright Stealth Evasion** — Anti-bot protection bypass (Cloudflare, Akamai, Datadome) with humanized typing, scrolling, and delays
- **Rate-Limit Safe Queues** — 15-second delays between jobs to respect OpenRouter's free-tier RPM limits
- **Pipeline Tracker** — 6-stage funnel (Scraped → Tailored → Applied → Interviewing → Offered → Rejected) with history timeline
- **Daily Limits** — 50/day for premium user, 20/day for standard users
- **Pre-Flight Verification** — Validates OpenRouter connectivity, onboarding completeness, and Playwright binaries before automation
- **Multi-Source Job Discovery Engine** — Aggregates **100+ trusted sources** across 5 priority tiers (Remote/Global → Global Boards → Africa/Nigeria → Developer Communities → Grad & Big Tech), optimized for Nigerian software engineers, juniors, and entry-level candidates
- **Smart Job Sections** — `🔥 Recommended For You` (above your min ATS), `🔥 Top Remote Jobs`, `🇳🇬 Nigeria Friendly`, `🎓 Graduate Programs`, `💼 Internships`, `🚀 Startup Jobs`, `🏢 Big Tech`, `💰 Highest Paying`, `⚡ Easy Apply`, `🟢 Hiring Now`, `⭐ 90%+ Match`
- **Cross-Source Deduplication** — Merges duplicates by company/title/location, apply URL, and description similarity (never shows the same job twice)
- **Job Quality Score** — Ranks by remote availability, visa sponsorship, salary, easy apply, recency, company reputation, and experience fit
- **Realtime Resume Matching** — Scores every job against your resume/ATS profile; filters by country, company, role, remote, salary, tech stack, experience level, and visa sponsorship
- **Performance** — In-memory TTL cache (3h), priority-ordered fetching, pagination + infinite scroll, no needless re-scraping

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ LoginForm │  │ Onboarding   │  │ ApplicationList  │  │
│  │          │  │ Form (4-step)│  │ (Pipeline View)  │  │
│  └──────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API (JWT Auth)
┌──────────────────────▼──────────────────────────────────┐
│                   Backend (Express)                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Controllers                          │   │
│  │  Auth │ Applications │ Automation │ Resume │ Jobs │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Services                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │   │
│  │  │ OpenRouter│ │ JobScan  │ │ RoleExpansion   │ │   │
│  │  │ Service  │ │ Engine   │ │ Service         │ │   │
│  │  └──────────┘ └──────────┘ └─────────────────┘ │   │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │   │
│  │  │ Tailor   │ │ Preflight│ │ Automation      │ │   │
│  │  │ Service  │ │ Check    │ │ Runner (Stealth) │ │   │
│  │  └──────────┘ └──────────┘ └─────────────────┘ │   │
│  │  ┌──────────────────────────────────────────┐ │   │
│  │  │ Job Discovery Engine                      │ │   │
│  │  │  jobSources → scraperService → dedupe →   │ │   │
│  │  │  jobScoreService → jobSectionService      │ │   │
│  │  │  100+ sources · 5 priority tiers · cache  │ │   │
│  │  └──────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Database (MongoDB)                    │   │
│  │  Users │ Applications │ Jobs │ Resumes             │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## 📋 Prerequisites

- **Node.js** v18+ (LTS recommended)
- **MongoDB** — Local installation or [MongoDB Atlas](https://www.mongodb.com/atlas) free tier
- **Playwright** — For browser automation (install separately, see below)

## 🛠️ Installation

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/ugobuez/HirePilot.git
cd HirePilot

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Install Playwright for browser automation
cd ../server
npx playwright install chromium

# Go back to root
cd ..
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# MongoDB Connection String
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/hirepilot?retryWrites=true&w=majority

# OpenRouter API Key (optional - has free fallback built-in)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Server Port (optional - defaults to 6900)
PORT=6900

# JWT Secret (optional - has built-in fallback)
JWT_SECRET=your-super-secret-jwt-key-change-me
```

### 3. Start the Application

```bash
# Terminal 1: Start the backend server
cd server
npm run dev

# Terminal 2: Start the frontend
cd client
npm start
```

The server runs on `http://localhost:6900` and the client on `http://localhost:3000`.

## 🧪 Testing the Automation

### Test 1: Health Check

```bash
curl http://localhost:6900/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-07-15T14:00:00.000Z",
  "version": "1.0.0",
  "services": {
    "auth": true,
    "applications": true,
    "automation": true,
    "jobscan": true,
    "tailor": true
  }
}
```

### Test 2: User Signup & Login

```bash
# Signup
curl -X POST http://localhost:6900/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User",
    "phone": "+2348000000000"
  }'

# Login (save the token)
curl -X POST http://localhost:6900/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
```

### Test 3: Complete Onboarding

```bash
# Set the token from login response
TOKEN="your-jwt-token-here"

# Update onboarding with skills and resume
curl -X PUT http://localhost:6900/api/v1/auth/onboarding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "onboardingDetails": {
      "fullName": "Test User",
      "phone": "+2348000000000",
      "location": "Nigeria",
      "isAuthorizedToWorkInUS": false,
      "requiresSponsorship": true,
      "employmentTypePref": "Full-Time",
      "skillsList": ["React", "Node.js", "TypeScript", "Python", "AWS"],
      "yearsOfExperience": 5
    },
    "baseResumeText": "Experienced full-stack developer with 5 years building web applications using React, Node.js, TypeScript, and AWS. Led a team of 3 developers to build a cloud-native SaaS platform serving 10,000+ users."
  }'
```

### Test 4: Test the JobScan Engine Directly

```bash
curl -X GET http://localhost:6900/api/v1/automation/preflight \
  -H "Authorization: Bearer $TOKEN"
```

### Test 5: Run Scan-Only Mode (No Actual Applying)

```bash
# This expands roles, scrapes (placeholder), and scores matches
# without submitting any applications
curl -X POST http://localhost:6900/api/v1/automation/scan \
  -H "Authorization: Bearer $TOKEN"
```

### Test 6: Run Full Automation (Dry Run)

```bash
# Dry run - processes jobs through the full pipeline but doesn't
# actually submit applications. Tests SCAN→UPGRADE→RE-SCAN flow.
curl -X POST http://localhost:6900/api/v1/automation/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"dryRun": true, "maxApplications": 5}'
```

### Test 7: Create & Manage Applications

```bash
# Add a manual application
curl -X POST http://localhost:6900/api/v1/applications/manual-apply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jobTitle": "Senior React Developer",
    "company": "Tech Corp",
    "location": "Remote",
    "jobDescription": "We are looking for a Senior React Developer with 5+ years experience in React, TypeScript, and Node.js. Must have experience with AWS and CI/CD pipelines.",
    "source": "Manual"
  }'

# Get all applications with pipeline stats
curl http://localhost:6900/api/v1/applications \
  -H "Authorization: Bearer $TOKEN"

# Get pipeline statistics
curl http://localhost:6900/api/v1/applications/stats \
  -H "Authorization: Bearer $TOKEN"

# Tailor an application (replace APP_ID)
curl -X POST http://localhost:6900/api/v1/applications/APP_ID/tailor \
  -H "Authorization: Bearer $TOKEN"

# Update status
curl -X PUT http://localhost:6900/api/v1/applications/APP_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "Interviewing", "note": "Got interview invite!"}'
```

## 🔄 Automation Pipeline Flow

```
Job Found
    │
    ▼
┌──────────────────────────────────────────────┐
│        1. Pre-Flight Checks                  │
│  • OpenRouter connectivity                   │
│  • Onboarding completeness                   │
│  • Playwright binaries                       │
└──────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────┐
│        2. Role Expansion                     │
│  Skills: React, Node.js, TypeScript           │
│  → Frontend Engineer, Full-Stack Developer,  │
│    TypeScript Developer, Web Engineer, etc.  │
└──────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────┐
│        3. Scrape Jobs (LinkedIn, Indeed,     │
│           Jobberman)                         │
└──────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────┐
│        4. SCAN (Base JobScan Engine)         │
│                                              │
│  Score < 50% ──────────► SKIP                │
│  Score 50-89% ─────────► Step 5 (Upgrade)   │
│  Score ≥ 90% ──────────► Step 7 (Apply)     │
└──────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────┐
│        5. UPGRADE (TailorService)            │
│  • Hallucination-safe rewrite               │
│  • Dynamic title alignment                   │
│  • Missing keyword integration               │
└──────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────┐
│        6. RE-SCAN (Re-verify Tailored        │
│           Resume)                            │
│                                              │
│  Score < 90% ──────────► SKIP                │
│  Score ≥ 90% ──────────► Step 7 (Apply)     │
└──────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────┐
│        7. APPLY (Stealth Playwright)         │
│  • Anti-bot evasion                          │
│  • Humanized typing/scrolling                │
│  • Form filling & submission                 │
└──────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────┐
│        8. Database Logging                   │
│  • Create Application record                 │
│  • Update daily counter                      │
│  • Log history timeline                      │
└──────────────────────────────────────────────┘
```

## 📊 API Reference

### Authentication (`/api/v1/auth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/signup` | Create account | No |
| POST | `/login` | Sign in | No |
| GET | `/me` | Get current user | Yes |
| PUT | `/onboarding` | Update profile/resume | Yes |

### Jobs (`/api/jobs`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Paginated jobs (filters: query, country, company, role, remote, salary, techStack, experienceLevel, visaSponsorship) | No |
| GET | `/search` | Filtered search with pagination + `filters` echo | No |
| GET | `/sources` | Source registry metadata (count + per-source priority/category) | No |
| GET | `/for-user` | Jobs scored for the current user (ATS) | Yes |
| GET | `/sections` | Curated dashboard sections + `🔥 Recommended For You` (above user's min ATS) | Yes |

Example — dashboard sections:

```bash
curl http://localhost:6900/api/jobs/sections \
  -H "Authorization: Bearer $TOKEN"
```

 Example — filtered search (remote React jobs in Nigeria):

```bash
curl "http://localhost:6900/api/jobs/search?remote=true&techStack=React&country=Nigeria&page=1"
```

### Automation / Auto-Apply (`/api/v1/automation`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/auto-apply` | Current auto-apply settings + remaining daily limit | Yes |
| PUT | `/auto-apply` | Toggle + configure (enabled, minAts, interval, remoteOnly, keywords) | Yes |
| POST | `/auto-apply/run` | Manual run now across the full pool (dryRun supported) | Yes |
| POST | `/auto-apply/jobs` | Auto-apply to user-selected jobs (resume-tailored + logged) | Yes |
| POST | `/run` | Full SCAN → TAILOR → APPLY pipeline | Yes |
| POST | `/scan` | Scan-only dry run | Yes |
| GET | `/preflight` | Preflight checks | Yes |

The dashboard has a top navigation (Discovery · Analyzer · Applications · Automation) for moving between areas. From **Discovery** you can multi-select jobs and hit **Auto-Apply via HirePilot**; from **Automation** you configure and run auto-apply and see the last-run summary.

### Applications (`/api/v1/applications`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List all applications | Yes |
| GET | `/stats` | Pipeline statistics | Yes |
| POST | `/` | Create application | Yes |
| POST | `/manual-apply` | Add manual application | Yes |
| POST | `/:id/tailor` | Run tailoring | Yes |
| PUT | `/:id/status` | Update status | Yes |
| PUT | `/:id` | Update application | Yes |
| DELETE | `/:id` | Delete application | Yes |

### Automation (`/api/v1/automation`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/run` | Full automation pipeline | Yes |
| POST | `/scan` | Scan-only (dry run) | Yes |
| GET | `/preflight` | Pre-flight checks | Yes |

## 💰 Cost Structure

HirePilot uses **OpenRouter's free model tier** (`openrouter/free`) which includes:
- **Llama 3.1 70B** — High-quality resume tailoring and job analysis
- **Mistral 7B** — Fast, lightweight tasks
- **Mixtral 8x7B** — Balanced performance

**Zero operational cost** — The hardcoded fallback API key ensures connectivity even without setting up your own key.

## 🔒 Security

- **Passwords** — Hashed with bcrypt (10 salt rounds)
- **JWT Tokens** — 7-day expiration, stored in localStorage
- **Rate Limiting** — 20 applications/day standard, 50/day premium
- **Anti-Hallucination** — Strict prompt directives prevent AI from fabricating resume content
- **Stealth Evasion** — Playwright plugins bypass anti-bot detection

## 🚨 Troubleshooting

### OpenRouter Rate Limits
If you encounter rate limit errors, the automation includes 15-second delays between requests. For faster processing, set your own `OPENROUTER_API_KEY` with higher rate limits.

### MongoDB Connection
```bash
# Ensure MongoDB is running
mongosh
# Test connection from server
```

### Playwright Issues
```bash
# Reinstall Playwright browsers
npx playwright install --force chromium
```

## 📝 License

MIT License — See LICENSE file for details.

## 🙏 Acknowledgments

- [OpenRouter](https://openrouter.ai) for free AI model access
- [Playwright](https://playwright.dev) for browser automation
- [MongoDB](https://mongodb.com) for database
- [React](https://reactjs.org) for the frontend framework