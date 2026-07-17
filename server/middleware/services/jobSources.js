/**
 * Job Source Registry — the multi-source aggregation catalogue.
 *
 * Every source a Nigerian software engineer should be able to discover jobs
 * from is registered here, grouped by the priority tiers defined in the
 * product spec (Priority 1 = remote/global platforms first … Priority 5 =
 * grad programs & big tech).
 *
 * Each registry entry has the shape:
 *   { key, name, priority, category, startup?, bigTech?, africa?, scrape }
 *
 * `scrape()` returns an array of *normalized* jobs (see jobNormalize.normalize)
 * or [] on any failure. Every scraper is wrapped so a single dead source never
 * breaks the whole aggregation.
 *
 * Sources without a stable public (no-auth) JSON contract are wired as
 * best-effort scrapers: they are still *attempted first* (priority ordering is
 * preserved) but degrade to [] instead of fabricating listings.
 */
import axios from "axios";

import {
  normalize,
  isRelevantJob,
  CAT,
  PRIORITY,
} from "./jobNormalize.js";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; HirePilot/2.0; +https://hirepilot.app)" };

const GET = (url, opts = {}) =>
  axios.get(url, { timeout: 7000, maxRedirects: 3, headers: UA, ...opts });

const safe = async (name, fn) => {
  try {
    const result = await fn();
    return Array.isArray(result) ? result : [];
  } catch (e) {
    return [];
  }
};

// ─────────────────────────────────────────────
// SHARED ATS SCRAPERS
// ─────────────────────────────────────────────

// Greenhouse public board API (used by Stripe, Shopify, Paystack, …)
const scrapeGreenhouse = ({ slug, name, priority, bigTech, africa }) =>
  safe(name, async () => {
    const { data } = await GET(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    return (data.jobs || [])
      .filter((j) => isRelevantJob(j.title))
      .map((j) =>
        normalize(
          {
            id: `gh-${slug}-${j.id}`,
            title: j.title,
            company: name,
            location: j.location?.name || "Remote",
            description: j.content ? j.content.replace(/<[^>]*>/g, " ") : "",
            applyLink: j.absolute_url,
            postedDate: j.updated_at,
          },
          {
            source: name,
            category: africa ? CAT.AFRICA : CAT.GRAD_BIGTECH,
            priority,
            bigTech: !!bigTech,
            africa: !!africa,
          }
        )
      );
  });

// Lever public postings API (used by many startups)
const scrapeLever = ({ slug, name, priority, startup, bigTech, africa }) =>
  safe(name, async () => {
    const { data } = await GET(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    const jobs = Array.isArray(data) ? data : [];
    return jobs
      .filter((j) => isRelevantJob(j.text || j.headline || ""))
      .map((j) =>
        normalize(
          {
            id: `lever-${slug}-${j.id}`,
            title: j.text,
            company: name,
            location: j.categories?.location || "Remote",
            description: j.descriptionPlain || j.description || "",
            applyLink: j.hostedUrl,
            postedDate: j.createdAt,
          },
          {
            source: name,
            category: africa ? CAT.AFRICA : CAT.GLOBAL_BOARDS,
            priority,
            startup: !!startup,
            bigTech: !!bigTech,
            africa: !!africa,
          }
        )
      );
  });

// Ashby public posting API (used by newer startups/scale-ups)
const scrapeAshby = ({ slug, name, priority, startup, bigTech }) =>
  safe(name, async () => {
    const { data } = await GET(`https://api.ashbyhq.com/posting-api/jobs?organizationId=${slug}`);
    return (data.jobs || [])
      .filter((j) => isRelevantJob(j.title))
      .map((j) =>
        normalize(
          {
            id: `ashby-${slug}-${j.id}`,
            title: j.title,
            company: name,
            location: (j.locationNames || []).join(", ") || "Remote",
            description: j.descriptionPlaintext || j.description || "",
            applyLink: j.applicationUrl || j.jobUrl,
            postedDate: j.postedAt,
          },
          { source: name, category: CAT.GLOBAL_BOARDS, priority, startup: !!startup, bigTech: !!bigTech }
        )
      );
  });

// Workable public v3 API (best-effort)
const scrapeWorkable = ({ slug, name, priority, startup }) =>
  safe(name, async () => {
    const { data } = await GET(`https://${slug}.workable.com/api/v3/jobs?state=published`);
    return (data.jobs || [])
      .filter((j) => isRelevantJob(j.title))
      .map((j) =>
        normalize(
          {
            id: `workable-${slug}-${j.id}`,
            title: j.title,
            company: name,
            location: j.location || "Remote",
            description: j.description || "",
            applyLink: j.url || j.applyUrl,
            postedDate: j.publishedAt || j.createdAt,
          },
          { source: name, category: CAT.GLOBAL_BOARDS, priority, startup: !!startup }
        )
      );
  });

// Generic best-effort board scraper for sites without a guaranteed contract.
const bestEffort = (name, url, builder) =>
  safe(name, async () => {
    const { data } = await GET(url);
    const jobs = Array.isArray(data) ? data : data?.jobs || data?.results || data?.data || [];
    if (!Array.isArray(jobs)) return [];
    return jobs
      .filter((j) => isRelevantJob(j.title || j.position || "", j.description || j.text || ""))
      .map((j) =>
        normalize(
          {
            id: `${name}-${j.id || j.slug || Math.random().toString(36).slice(2, 8)}`,
            title: j.title || j.position || j.role || "",
            company: j.company || j.company_name || j.companyName || name,
            location: j.location || j.locationName || "Remote",
            description: j.description || j.text || j.snippet || "",
            salary: j.salary || j.salaryRange || "Not specified",
            applyLink: j.url || j.link || j.applyUrl || j.apply_link,
            postedDate: j.date || j.postedAt || j.created_at || j.publication_date,
          },
          builder
        )
      );
  });

// ─────────────────────────────────────────────
// KEY-GATED GLOBAL BOARDS (optional env keys)
// ─────────────────────────────────────────────
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;
const JOOBLE_API_KEY = process.env.JOOBLE_API_KEY;
const REED_API_KEY = process.env.REED_API_KEY;
const FINDWORK_KEY = process.env.FINDWORK_KEY;
const JSEARCH_KEY = process.env.JSEARCH_KEY;

const scrapeAdzuna = (country) =>
  ADZUNA_APP_ID
    ? safe(`Adzuna ${country.toUpperCase()}`, async () => {
        const { data } = await GET(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`, {
          params: { app_id: ADZUNA_APP_ID, app_key: ADZUNA_APP_KEY, what: "junior software developer react node", results_per_page: 40 },
        });
        return (data.results || [])
          .filter((j) => isRelevantJob(j.title))
          .map((j) =>
            normalize(
              {
                id: `adzuna-${country}-${j.id}`,
                title: j.title,
                company: j.company?.display_name || "Unknown",
                location: j.location?.display_name || "Remote",
                description: j.description || "",
                salary: j.salary_min ? `${j.salary_min}-${j.salary_max}` : "Not specified",
                applyLink: j.redirect_url,
                postedDate: j.created,
              },
              { source: `Adzuna ${country.toUpperCase()}`, category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }
            )
          );
      })
    : Promise.resolve([]);

const scrapeJooble = (location) =>
  JOOBLE_API_KEY
    ? safe(`Jooble ${location}`, async () => {
        const { data } = await axios.post(`https://jooble.org/api/${JOOBLE_API_KEY}`, { keywords: "junior full stack developer react node", location }, { timeout: 9000, headers: UA });
        return (data.jobs || [])
          .filter((j) => isRelevantJob(j.title))
          .map((j) =>
            normalize(
              {
                id: `jooble-${j.id || j.link}`,
                title: j.title,
                company: j.company || "Unknown",
                location: j.location || location,
                description: j.snippet || "",
                salary: j.salary || "Not specified",
                applyLink: j.link,
                postedDate: j.updated,
              },
              { source: "Jooble", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }
            )
          );
      })
    : Promise.resolve([]);

const scrapeReed = () =>
  REED_API_KEY
    ? safe("Reed UK", async () => {
        const { data } = await GET("https://www.reed.co.uk/api/1.0/search", {
          params: { keywords: "junior software engineer react typescript", resultsToTake: 40 },
          auth: { username: REED_API_KEY, password: "" },
        });
        return (data.results || []).map((j) =>
          normalize(
            {
              id: `reed-${j.jobId}`,
              title: j.jobTitle,
              company: j.employerName,
              location: j.locationName,
              description: j.jobDescription,
              salary: j.minimumSalary ? `£${j.minimumSalary}-£${j.maximumSalary}` : "Not specified",
              applyLink: j.jobUrl,
              postedDate: j.date,
            },
            { source: "Reed UK", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }
          )
        );
      })
    : Promise.resolve([]);

const scrapeFindwork = () =>
  FINDWORK_KEY
    ? safe("Findwork", async () => {
        const { data } = await GET("https://findwork.dev/api/jobs/?role=software+engineer&sort_by=date", {
          headers: { Authorization: `Token ${FINDWORK_KEY}` },
        });
        return (data.results || [])
          .filter((j) => isRelevantJob(j.role, j.text))
          .map((j) =>
            normalize(
              {
                id: `findwork-${j.id}`,
                title: j.role,
                company: j.company_name,
                location: j.location || "Remote",
                description: `${j.text || ""} Keywords: ${(j.keywords || []).join(", ")}`,
                skills: j.keywords || [],
                applyLink: j.url,
                postedDate: j.date_posted,
              },
              { source: "Findwork", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }
            )
          );
      })
    : Promise.resolve([]);

const scrapeJSearch = (query, location) =>
  JSEARCH_KEY
    ? safe(`JSearch ${location}`, async () => {
        const { data } = await GET("https://jsearch.p.rapidapi.com/search", {
          params: { query: `${query} in ${location}`, num_pages: 1, date_posted: "week" },
          headers: { "X-RapidAPI-Key": JSEARCH_KEY, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
        });
        return (data.data || [])
          .filter((j) => isRelevantJob(j.job_title))
          .map((j) =>
            normalize(
              {
                id: `jsearch-${j.job_id}`,
                title: j.job_title,
                company: j.employer_name,
                location: `${j.job_city || ""} ${j.job_country || ""}`.trim(),
                description: j.job_description,
                skills: j.job_required_skills || [],
                salary: j.job_min_salary ? `${j.job_min_salary}-${j.job_max_salary}` : "Not specified",
                applyLink: j.job_apply_link,
                postedDate: j.job_posted_at_datetime_utc,
              },
              { source: `JSearch ${location}`, category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }
            )
          );
      })
    : Promise.resolve([]);

// ─────────────────────────────────────────────
// PRIORITY 1 — REMOTE / GLOBAL PLATFORMS
// ─────────────────────────────────────────────
const scrapeRemoteOK = () =>
  safe("RemoteOK", async () => {
    const { data } = await GET("https://remoteok.com/api");
    return (data.slice(1) || [])
      .filter((j) => isRelevantJob(j.position, j.description))
      .map((j) =>
        normalize(
          {
            id: `remoteok-${j.id}`,
            title: j.position,
            company: j.company,
            location: j.location || "Remote",
            description: j.description,
            skills: j.tags || [],
            salary: j.salary_min ? `$${j.salary_min}-$${j.salary_max}` : "Not specified",
            applyLink: j.url,
            postedDate: j.date,
          },
          { source: "RemoteOK", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL, startup: true }
        )
      );
  });

const scrapeWeWorkRemotely = () =>
  safe("WeWorkRemotely", async () => {
    const { data } = await GET("https://weworkremotely.com/remote-jobs.json");
    return (data?.jobs || [])
      .filter((j) => isRelevantJob(j.title, j.description))
      .map((j) =>
        normalize(
          {
            id: `wwr-${j.id}`,
            title: j.title,
            company: j.company_name,
            location: j.location,
            description: j.description,
            salary: j.salary || "Not specified",
            applyLink: j.url,
            postedDate: j.date,
          },
          { source: "WeWorkRemotely", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL, startup: true }
        )
      );
  });

const scrapeRemotive = () =>
  safe("Remotive", async () => {
    const { data } = await GET("https://remotive.com/api/remote-jobs");
    return (data.jobs || [])
      .filter((j) => isRelevantJob(j.title, j.description))
      .map((j) =>
        normalize(
          {
            id: `remotive-${j.id}`,
            title: j.title,
            company: j.company_name,
            location: j.candidate_required_location || "Remote",
            description: j.description,
            skills: j.tags || [],
            salary: j.salary || "Not specified",
            applyLink: j.url,
            postedDate: j.publication_date,
          },
          { source: "Remotive", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL, startup: true }
        )
      );
  });

const scrapeWellfound = () =>
  bestEffort(
    "Wellfound",
    "https://api.wellfound.com/companies/jobs",
    { source: "Wellfound", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL, startup: true }
  );

const scrapeYC = () =>
  safe("YC Startups", async () => {
    const { data } = await GET("https://api.workatastartup.com/companies/fetch?query=software+engineer&remote=true", {
      headers: { Accept: "application/json" },
    });
    return (data.startups || [])
      .flatMap((c) =>
        (c.jobs || [])
          .filter((j) => isRelevantJob(j.title))
          .map((j) =>
            normalize(
              {
                id: `yc-${c.id}-${j.id}`,
                title: j.title,
                company: c.name,
                location: j.location || "Remote",
                description: j.description || c.long_description || "",
                skills: j.skills || [],
                applyLink: `https://www.workatastartup.com/jobs/${j.id}`,
                postedDate: j.created_at,
              },
              { source: "YC Startups", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL, startup: true }
            )
          )
      );
  });

const scrapeHimalayas = () =>
  bestEffort(
    "Himalayas",
    "https://himalayas.app/api/jobs?remote=true&page=1",
    { source: "Himalayas", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL, startup: true }
  );

// Best-effort remote platforms (no guaranteed public API) — still searched first.
const remoteBestEffort = (name, url) =>
  bestEffort(name, url, { source: name, category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL, startup: true });

// ─────────────────────────────────────────────
// PRIORITY 2 — GLOBAL SOFTWARE JOB BOARDS
// ─────────────────────────────────────────────
const scrapeArbeitnow = () =>
  safe("Arbeitnow", async () => {
    const { data } = await GET("https://www.arbeitnow.com/api/job-board-api");
    return (data.data || [])
      .filter((j) => isRelevantJob(j.title, j.description))
      .map((j) =>
        normalize(
          {
            id: `arbeitnow-${j.slug}`,
            title: j.title,
            company: j.company_name,
            location: j.location || "Remote",
            description: j.description,
            skills: j.tags || [],
            applyLink: j.url,
            postedDate: j.created_at,
          },
          { source: "Arbeitnow", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }
        )
      );
  });

const boardBestEffort = (name, url) =>
  bestEffort(name, url, { source: name, category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS });

// ─────────────────────────────────────────────
// PRIORITY 4 — DEVELOPER COMMUNITIES
// ─────────────────────────────────────────────
const scrapeHN = () =>
  safe("Hacker News Who's Hiring", async () => {
    const { data } = await GET("https://hn.algolia.com/api/v1/search_by_date?query=who+is+hiring&tags=story&hitsPerPage=1");
    const storyId = data.hits[0]?.objectID;
    if (!storyId) return [];
    const { data: story } = await GET(`https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&hitsPerPage=100`);
    return story.hits
      .filter((h) => isRelevantJob(h.comment_text || ""))
      .slice(0, 30)
      .map((h) =>
        normalize(
          {
            id: `hn-${h.objectID}`,
            title: "Software Engineer (HN Hiring)",
            company: h.author,
            location: "Remote / Various",
            description: (h.comment_text || "").replace(/<[^>]*>/g, ""),
            applyLink: `https://news.ycombinator.com/item?id=${h.objectID}`,
            postedDate: h.created_at,
          },
          { source: "Hacker News", category: CAT.COMMUNITIES, priority: PRIORITY.COMMUNITIES }
        )
      );
  });

const communityEntry = (key, name, url) => ({
  key,
  name,
  priority: PRIORITY.COMMUNITIES,
  category: CAT.COMMUNITIES,
  scrape: () => bestEffort(name, url, { source: name, category: CAT.COMMUNITIES, priority: PRIORITY.COMMUNITIES }),
});

// ─────────────────────────────────────────────
// PRIORITY 5 — GRAD PROGRAMS & BIG TECH (ATS)
// ─────────────────────────────────────────────
const greenhouseCompanies = [
  { slug: "stripe", name: "Stripe", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "cloudflare", name: "Cloudflare", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "shopify", name: "Shopify", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "mongodb", name: "MongoDB", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "netflix", name: "Netflix", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "spotify", name: "Spotify", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "uber", name: "Uber", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "airbnb", name: "Airbnb", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "coinbase", name: "Coinbase", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "twitch", name: "Twitch", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "datadog", name: "Datadog", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "snowflake", name: "Snowflake", priority: PRIORITY.GRAD_BIGTECH, bigTech: true },
  { slug: "notion", name: "Notion", priority: PRIORITY.GLOBAL_BOARDS },
  { slug: "figma", name: "Figma", priority: PRIORITY.GLOBAL_BOARDS },
  { slug: "linear", name: "Linear", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "vercel", name: "Vercel", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "supabase", name: "Supabase", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "paystack", name: "Paystack", priority: PRIORITY.AFRICA, bigTech: true, africa: true },
  { slug: "flutterwave", name: "Flutterwave", priority: PRIORITY.AFRICA, bigTech: true, africa: true },
  { slug: "andela", name: "Andela", priority: PRIORITY.AFRICA, bigTech: true, africa: true },
];

const leverCompanies = [
  { slug: "vercel", name: "Vercel", priority: PRIORITY.REMOTE_GLOBAL, startup: true },
  { slug: "supabase", name: "Supabase", priority: PRIORITY.REMOTE_GLOBAL, startup: true },
  { slug: "linear", name: "Linear", priority: PRIORITY.REMOTE_GLOBAL, startup: true },
  { slug: "loom", name: "Loom", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "deel", name: "Deel", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "retool", name: "Retool", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "figma", name: "Figma", priority: PRIORITY.GLOBAL_BOARDS },
  { slug: "notion", name: "Notion", priority: PRIORITY.GLOBAL_BOARDS },
  { slug: "brex", name: "Brex", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "rippling", name: "Rippling", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
];

const ashbyCompanies = [
  { slug: "deel", name: "Deel", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "ramp", name: "Ramp", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "retool", name: "Retool", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
  { slug: "remote", name: "Remote.com", priority: PRIORITY.GLOBAL_BOARDS, startup: true },
];

const greenhouseEntries = greenhouseCompanies.map((c) => ({
  key: `greenhouse-${c.slug}`,
  name: c.name,
  priority: c.priority,
  category: c.africa ? CAT.AFRICA : CAT.GRAD_BIGTECH,
  bigTech: !!c.bigTech,
  africa: !!c.africa,
  scrape: () => scrapeGreenhouse(c),
}));

const leverEntries = leverCompanies.map((c) => ({
  key: `lever-${c.slug}`,
  name: c.name,
  priority: c.priority,
  category: CAT.GLOBAL_BOARDS,
  startup: !!c.startup,
  scrape: () => scrapeLever(c),
}));

const ashbyEntries = ashbyCompanies.map((c) => ({
  key: `ashby-${c.slug}`,
  name: c.name,
  priority: c.priority,
  category: CAT.GLOBAL_BOARDS,
  startup: !!c.startup,
  scrape: () => scrapeAshby(c),
}));

const africaCompanyEntry = (name, url) => ({
  key: `p5-${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
  name,
  priority: PRIORITY.GRAD_BIGTECH,
  category: CAT.AFRICA,
  africa: true,
  bigTech: true,
  scrape: () => bestEffort(name, url, { source: name, category: CAT.AFRICA, priority: PRIORITY.GRAD_BIGTECH, africa: true, bigTech: true }),
});

const p5Africa = [
  africaCompanyEntry("Moniepoint", "https://www.moniepoint.com/careers/api/jobs"),
  africaCompanyEntry("Interswitch", "https://www.interswitch.com/careers/api/jobs"),
  africaCompanyEntry("Cowrywise", "https://cowrywise.com/careers/api/jobs"),
  africaCompanyEntry("Kuda", "https://www.kuda.com/careers/api/jobs"),
  africaCompanyEntry("Opay", "https://www.opay.com/careers/api/jobs"),
  africaCompanyEntry("PalmPay", "https://www.palmpay.com/careers/api/jobs"),
  africaCompanyEntry("PiggyVest", "https://www.piggyvest.com/careers/api/jobs"),
  africaCompanyEntry("Carbon", "https://www.getcarbon.co/careers/api/jobs"),
  africaCompanyEntry("TeamApt", "https://www.teamapt.com/careers/api/jobs"),
  africaCompanyEntry("Reliance Health", "https://reliancehealthcareers.com/api/jobs"),
  africaCompanyEntry("SeamlessHR", "https://www.seamlesshr.com/careers/api/jobs"),
  africaCompanyEntry("Termii", "https://termii.com/careers/api/jobs"),
  africaCompanyEntry("MonieWorld", "https://monieworld.com/careers/api/jobs"),
  africaCompanyEntry("Helium Health", "https://www.heliumhealth.com/careers/api/jobs"),
  africaCompanyEntry("FairMoney", "https://fairmoney.io/careers/api/jobs"),
  africaCompanyEntry("Autochek", "https://www.myautochek.com/careers/api/jobs"),
];

const bestEffortP5 = (key, name, url) => ({
  key,
  name,
  priority: PRIORITY.GRAD_BIGTECH,
  category: CAT.GRAD_BIGTECH,
  bigTech: true,
  scrape: () => bestEffort(name, url, { source: name, category: CAT.GRAD_BIGTECH, priority: PRIORITY.GRAD_BIGTECH, bigTech: true }),
});

// ─────────────────────────────────────────────
// MASTER SOURCE REGISTRY (ordered by priority)
// ─────────────────────────────────────────────
export const SOURCE_REGISTRY = [
  // ── PRIORITY 1 — Remote / global platforms ──
  { key: "remoteok", name: "RemoteOK", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: scrapeRemoteOK },
  { key: "wwr", name: "We Work Remotely", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: scrapeWeWorkRemotely },
  { key: "wellfound", name: "Wellfound (AngelList)", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: scrapeWellfound },
  { key: "yc", name: "Y Combinator Jobs", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: scrapeYC },
  { key: "himalayas", name: "Himalayas", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: scrapeHimalayas },
  { key: "remotive", name: "Remotive", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: scrapeRemotive },
  { key: "flexjobs", name: "FlexJobs", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("FlexJobs", "https://www.flexjobs.com/api/jobs?search=software+developer&remote=true", { source: "FlexJobs", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },
  { key: "turing", name: "Turing", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("Turing", "https://www.turing.com/api/jobs?role=software+engineer", { source: "Turing", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },
  { key: "toptal", name: "Toptal", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("Toptal", "https://www.toptal.com/api/jobs?category=software-engineering", { source: "Toptal", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },
  { key: "crossover", name: "Crossover", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("Crossover", "https://www.crossover.com/api/jobs?q=software+engineer", { source: "Crossover", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },
  { key: "arc", name: "Arc.dev", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("Arc.dev", "https://arc.dev/api/v1/jobs?role=backend&remote=true", { source: "Arc.dev", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },
  { key: "gun", name: "Gun.io", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("Gun.io", "https://gun.io/api/jobs?role=software+engineer", { source: "Gun.io", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },
  { key: "lemon", name: "Lemon.io", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("Lemon.io", "https://lemon.io/api/jobs?stack=react", { source: "Lemon.io", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },
  { key: "braintrust", name: "Braintrust", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("Braintrust", "https://www.usebraintrust.com/api/jobs?q=software+engineer", { source: "Braintrust", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },
  { key: "jobgether", name: "Jobgether", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("Jobgether", "https://jobgether.com/api/jobs?q=software+engineer", { source: "Jobgether", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },
  { key: "otta", name: "Otta (Welcome to the Jungle)", priority: PRIORITY.REMOTE_GLOBAL, category: CAT.REMOTE_GLOBAL, scrape: () => bestEffort("Otta", "https://api.welcometothejungle.co/v1/companies/jobs?page=1&per_page=50", { source: "Otta", category: CAT.REMOTE_GLOBAL, priority: PRIORITY.REMOTE_GLOBAL }) },

  // ── PRIORITY 2 — Global software job boards ──
  { key: "arbeitnow", name: "Arbeitnow", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: scrapeArbeitnow },
  { key: "linkedin", name: "LinkedIn Jobs", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => bestEffort("LinkedIn Jobs", "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=junior%20software%20engineer&location=Remote", { source: "LinkedIn Jobs", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }) },
  { key: "indeed", name: "Indeed", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => bestEffort("Indeed", "https://www.indeed.com/jobs?q=junior+software+engineer&l=Remote&remotejob=032b3046-06a3-4876-8dfd-474eb5e7a74a", { source: "Indeed", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }) },
  { key: "glassdoor", name: "Glassdoor", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => bestEffort("Glassdoor", "https://www.glassdoor.com/Job/remote-software-engineer-jobs-SRCH_KO0,25.htm", { source: "Glassdoor", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }) },
  { key: "dice", name: "Dice", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => bestEffort("Dice", "https://www.dice.com/api/jobs?q=junior+software+engineer&location=Remote", { source: "Dice", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }) },
  { key: "ziprecruiter", name: "ZipRecruiter", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => bestEffort("ZipRecruiter", "https://www.ziprecruiter.com/jobs-search?search=junior+software+engineer&location=Remote", { source: "ZipRecruiter", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }) },
  { key: "simplyhired", name: "SimplyHired", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => bestEffort("SimplyHired", "https://www.simplyhired.com/search?q=junior+software+engineer&l=Remote", { source: "SimplyHired", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }) },
  { key: "monster", name: "Monster", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => bestEffort("Monster", "https://www.monster.com/jobs/search?q=junior+software+engineer&where=Remote", { source: "Monster", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }) },
  { key: "builtin", name: "Built In", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => bestEffort("Built In", "https://builtin.com/jobs/remote", { source: "Built In", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }) },
  { key: "smartrecruiters", name: "SmartRecruiters", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => bestEffort("SmartRecruiters", "https://api.smartrecruiters.com/v1/companies/jobs?q=software+engineer", { source: "SmartRecruiters", category: CAT.GLOBAL_BOARDS, priority: PRIORITY.GLOBAL_BOARDS }) },
  { key: "adzuna-us", name: "Adzuna US", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => scrapeAdzuna("us") },
  { key: "adzuna-gb", name: "Adzuna UK", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => scrapeAdzuna("gb") },
  { key: "adzuna-ng", name: "Adzuna NG", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => scrapeAdzuna("ng") },
  { key: "jooble-remote", name: "Jooble Remote", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => scrapeJooble("Remote") },
  { key: "jooble-ng", name: "Jooble Nigeria", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => scrapeJooble("Nigeria") },
  { key: "reed", name: "Reed UK", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: scrapeReed },
  { key: "findwork", name: "Findwork", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: scrapeFindwork },
  { key: "jsearch-us", name: "JSearch US", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => scrapeJSearch("junior full stack developer react node", "United States") },
  { key: "jsearch-uk", name: "JSearch UK", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => scrapeJSearch("junior software engineer typescript node", "United Kingdom") },
  { key: "jsearch-ca", name: "JSearch Canada", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => scrapeJSearch("software developer react node entry level", "Canada") },
  { key: "jsearch-ng", name: "JSearch Nigeria", priority: PRIORITY.GLOBAL_BOARDS, category: CAT.GLOBAL_BOARDS, scrape: () => scrapeJSearch("software engineer react node", "Nigeria") },
  ...leverEntries,
  ...ashbyEntries,

  // ── PRIORITY 3 — Africa / Nigeria ──
  { key: "jobberman", name: "Jobberman Nigeria", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("Jobberman NG", "https://www.jobberman.com/api/v3/jobs?q=software+developer&page=1&per_page=50", { source: "Jobberman NG", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "myjobmag", name: "MyJobMag", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("MyJobMag NG", "https://www.myjobmag.com/feed/jobs.json?category=Technology&location=Nigeria", { source: "MyJobMag NG", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "hotnigeria", name: "Hot Nigerian Jobs", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("HotNigerianJobs", "https://api.rss2json.com/v1/api.json?rss_url=https://www.hotnigeriansjobs.com/feeds/posts/default", { source: "HotNigerianJobs", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "jobzilla", name: "Jobzilla", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("Jobzilla NG", "https://jobzilla.ng/api/v1/jobs?category=technology&limit=50", { source: "Jobzilla NG", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "talentql", name: "TalentQL", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("TalentQL", "https://api.talentql.com/jobs?limit=50", { source: "TalentQL", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "talentvg", name: "Talent by Venture Garden", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("Talent VG", "https://talent.venturegarden.com/api/jobs", { source: "Talent VG", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "gebeya", name: "Gebeya", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("Gebeya", "https://www.gebeya.com/api/jobs", { source: "Gebeya", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "altschool", name: "AltSchool Career Network", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("AltSchool", "https://altschoolafrica.com/api/careers", { source: "AltSchool", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "decagon", name: "Decagon Opportunities", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("Decagon", "https://www.decagon.institute/api/jobs", { source: "Decagon", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "semicolon", name: "Semicolon Career Board", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("Semicolon", "https://www.semicolon.africa/api/jobs", { source: "Semicolon", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "techcabal", name: "TechCabal Jobs", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("TechCabal Jobs", "https://techcabal.com/jobs/api", { source: "TechCabal Jobs", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "africaworks", name: "AfricaWorks", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("AfricaWorks", "https://africaworks.com/api/jobs", { source: "AfricaWorks", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "remoteafrica", name: "Remote Africa", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("Remote Africa", "https://remoteafrica.com/api/jobs", { source: "Remote Africa", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },
  { key: "afrisplash", name: "AfriSplash Jobs", priority: PRIORITY.AFRICA, category: CAT.AFRICA, africa: true, scrape: () => bestEffort("AfriSplash Jobs", "https://jobs.afrisplash.xyz/api/jobs", { source: "AfriSplash Jobs", category: CAT.AFRICA, priority: PRIORITY.AFRICA, africa: true }) },

  // ── PRIORITY 4 — Developer communities ──
  { key: "github", name: "GitHub Careers", priority: PRIORITY.COMMUNITIES, category: CAT.COMMUNITIES, scrape: () => bestEffort("GitHub Careers", "https://github.com/about/careers/api/jobs", { source: "GitHub Careers", category: CAT.COMMUNITIES, priority: PRIORITY.COMMUNITIES, bigTech: true }) },
  { key: "gitlab", name: "GitLab Careers", priority: PRIORITY.COMMUNITIES, category: CAT.COMMUNITIES, scrape: () => bestEffort("GitLab Careers", "https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true", { source: "GitLab Careers", category: CAT.COMMUNITIES, priority: PRIORITY.COMMUNITIES, bigTech: true }) },
  { key: "stackoverflow", name: "Stack Overflow Jobs", priority: PRIORITY.COMMUNITIES, category: CAT.COMMUNITIES, scrape: communityEntry("stackoverflow", "Stack Overflow Jobs", "https://stackoverflow.com/jobs?r=true&q=react").scrape },
  { key: "hashnode", name: "Hashnode Opportunities", priority: PRIORITY.COMMUNITIES, category: CAT.COMMUNITIES, scrape: communityEntry("hashnode", "Hashnode Opportunities", "https://hashnode.com/api/jobs").scrape },
  { key: "devto", name: "Dev.to Job Board", priority: PRIORITY.COMMUNITIES, category: CAT.COMMUNITIES, scrape: communityEntry("devto", "Dev.to Job Board", "https://dev.to/api/jobs").scrape },
  { key: "hn", name: "Hacker News Who's Hiring", priority: PRIORITY.COMMUNITIES, category: CAT.COMMUNITIES, scrape: scrapeHN },
  { key: "reddit", name: "Reddit Hiring Threads", priority: PRIORITY.COMMUNITIES, category: CAT.COMMUNITIES, scrape: communityEntry("reddit", "Reddit Hiring", "https://www.reddit.com/r/forhire/search.json?q=hiring&restrict_sr=1&sort=new").scrape },

  // ── PRIORITY 5 — Grad programs & big tech ──
  ...greenhouseEntries,
  bestEffortP5("google", "Google Careers", "https://careers.google.com/api/jobs/search?q=software+engineer&location=remote"),
  bestEffortP5("microsoft", "Microsoft Careers", "https://jobs.careers.microsoft.com/global/en/search?q=software+engineer&l=remote"),
  bestEffortP5("amazon", "Amazon Jobs", "https://www.amazon.jobs/en/search.json?base_query=software+engineer&loc_query=remote"),
  bestEffortP5("meta", "Meta Careers", "https://www.meta.com/careers/jobs/?q=software+engineer&location=remote"),
  ...p5Africa,
];

export default SOURCE_REGISTRY;

