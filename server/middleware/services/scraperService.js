/**
 * Job Aggregation Engine — orchestrator.
 *
 * Pulls from every source in SOURCE_REGISTRY (ordered by priority tier),
 * de-duplicates cross-source, applies user filters, and caches the result so
 * we avoid hammering external boards on every request.
 *
 * Public API:
 *   scrapeJobs(filters?)        -> normalized, deduped, filtered, sorted jobs
 *   getSourcesStatus()          -> registry metadata (for the dashboard)
 */
import { SOURCE_REGISTRY } from "./jobSources.js";
import { dedupeJobs } from "../../utils/dedupe.js";
import { getCached, setCached } from "../../utils/jobCache.js";
import { filterJobs, daysSincePosted, PRIORITY } from "./jobNormalize.js";
import config from "../../config/index.js";

const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

/**
 * Sources that should actually be scraped for this run.
 *
 * - Under test we never call the public internet: the config layer flips every
 *   FLAG_SOURCE_* to false for NODE_ENV=test, so we return an empty set and the
 *   aggregation pipeline still runs (dedupe/filter/sort) over zero sources.
 * - In production we honour each FLAG_SOURCE_* toggle; a source with no flag
 *   (unflagged) defaults to enabled so existing behaviour is preserved.
 */
const enabledSources = () => {
  if (config.isTest) return [];
  return SOURCE_REGISTRY.filter((s) => config.flags.sources[s.key] !== false);
};


const normalizeFilters = (opts = {}) => ({
  query: opts.query || opts.q || null,
  country: opts.country || null,
  company: opts.company || null,
  role: opts.role || null,
  remote: opts.remote === true || opts.remote === "true" ? true : null,
  salary: opts.salary != null && opts.salary !== "" ? Number(opts.salary) : null,
  techStack: opts.techStack
    ? Array.isArray(opts.techStack)
      ? opts.techStack
      : String(opts.techStack).split(",").map((s) => s.trim()).filter(Boolean)
    : [],
  experienceLevel: opts.experienceLevel || null,
  visaSponsorship: opts.visaSponsorship === true || opts.visaSponsorship === "true" ? true : null,
});

const cacheKeyFor = (filters) => `jobs:${Buffer.from(JSON.stringify(filters)).toString("base64")}`;

/**
 * Aggregate jobs across all registered sources.
 * @param {object} [opts] filter options (see normalizeFilters)
 * @returns {Promise<object[]>} normalized jobs
 */
export const scrapeJobs = async (opts = {}) => {
  const filters = normalizeFilters(opts);
  const cacheKey = cacheKeyFor(filters);

  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`♻️ Returning ${cached.length} cached jobs (key=${cacheKey.slice(0, 24)}…)`);
    return cached;
  }

  const registry = enabledSources();
  if (!registry.length) {
    // No sources enabled (tests, or every FLAG_SOURCE_* off): skip network
    // entirely and cache the empty result like any other response.
    setCached(cacheKey, [], CACHE_TTL);
    return [];
  }

  console.log("🚀 HirePilot aggregation engine — pulling from", registry.length, "sources…");

  const settled = await Promise.allSettled(
    registry.map(async (source) => {
      const jobs = await source.scrape();
      return { jobs: Array.isArray(jobs) ? jobs : [], source: source.name };
    })
  );

  let jobs = [];
  let successCount = 0;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      jobs.push(...r.value.jobs);
      if (r.value.jobs.length) successCount++;
    }
  }

  // De-duplicate across all sources (company/title/location + apply URL + similarity)
  jobs = dedupeJobs(jobs);

  // Apply user/section filters
  jobs = filterJobs(jobs, filters);

  // Best first: priority tier, then quality score, then recency
  jobs.sort(
    (a, b) =>
      (a.priority || PRIORITY.GLOBAL_BOARDS) - (b.priority || PRIORITY.GLOBAL_BOARDS) ||
      (b.qualityScore || 0) - (a.qualityScore || 0) ||
      daysSincePosted(a.postedDate) - daysSincePosted(b.postedDate)
  );

  console.log(
    `✅ Aggregated ${jobs.length} unique jobs from ${successCount}/${registry.length} active sources (deduped)`
  );

  setCached(cacheKey, jobs, CACHE_TTL);
  return jobs;
};

/**
 * Lightweight source registry metadata — no network calls. Each entry reports
 * whether its FLAG_SOURCE_* toggle is currently on, so the dashboard can show
 * disabled sources honestly instead of implying they all run.
 */
export const getSourcesStatus = () => {
  const registry = enabledSources();
  return {
    total: registry.length,
    sources: registry.map((s) => ({
      key: s.key,
      name: s.name,
      priority: s.priority,
      category: s.category,
      startup: !!s.startup,
      bigTech: !!s.bigTech,
      africa: !!s.africa,
    })),
  };
};

// ── Backwards-compatible helpers ──
export const filterNewGrad = (jobs) =>
  jobs.filter((j) => j.experienceLevel === "Graduate" || j.experienceLevel === "Internship" || /junior|graduate|intern|entry/i.test(j.title || ""));
export const filterVisa = (jobs) => jobs.filter((j) => j.visaSponsorship);
export const filterByCountry = (jobs, country) =>
  jobs.filter((j) => (j.location || "").toLowerCase().includes(String(country).toLowerCase()));

export default scrapeJobs;
