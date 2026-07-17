/**
 * Shared job normalization, detection, quality scoring and sectioning helpers.
 *
 * This module contains the pure logic used by both the source scrapers
 * (jobSources.js) and the aggregation orchestrator (scraperService.js) so the
 * two can share detection rules without a circular import.
 *
 * Priority tiers (used to sort sources that hire Nigerian developers first):
 *   1  Remote / global platforms (RemoteOK, WWR, Wellfound, YC, …)
 *   2  Global software job boards (LinkedIn, Indeed, Dice, Greenhouse, …)
 *   3  Africa / Nigeria focused sites (Jobberman, MyJobMag, Andela, …)
 *   4  Developer communities (HN, GitHub, Dev.to, Reddit, …)
 *   5  Graduate & internship programs / Big Tech (Google, Paystack, …)
 */

export const PRIORITY = {
  REMOTE_GLOBAL: 1,
  GLOBAL_BOARDS: 2,
  AFRICA: 3,
  COMMUNITIES: 4,
  GRAD_BIGTECH: 5,
};

export const CAT = {
  REMOTE_GLOBAL: "Remote & Global",
  GLOBAL_BOARDS: "Global Boards",
  AFRICA: "Africa & Nigeria",
  COMMUNITIES: "Developer Communities",
  GRAD_BIGTECH: "Grad & Big Tech",
};

// ─────────────────────────────────────────────
// DETECTION HELPERS
// ─────────────────────────────────────────────
const lower = (s = "") => String(s).toLowerCase();

export const isDevJob = (text = "") =>
  /frontend|back\s?end|full\s?stack|software|engineer|developer|react|node|typescript|javascript|python|devops|data|machine learning|ai engineer|web|swe|sde|cloud|platform|infrastructure|mobile/i.test(
    text
  );

export const isJuniorFriendly = (text = "") =>
  /junior|entry[\s-]?level|graduate|grad program|new grad|early career|associate|trainee|intern|internship|0[\s-–]*2|1[\s-–]*3|no experience|early talent/i.test(
    text
  );

// Relevance: dev role OR clearly junior/grad/remote-friendly
export const isRelevantJob = (title = "", description = "") =>
  isDevJob(`${title} ${description}`) || isJuniorFriendly(`${title} ${description}`);

export const detectRemote = (title = "", location = "", text = "") => {
  const t = lower(`${title} ${location} ${text}`);
  return /remote|anywhere|worldwide|work from home|wfh|global/.test(t) || /remote/i.test(t);
};

export const detectVisa = (text = "") =>
  /visa|sponsorship|sponsor|relocation|h-?1b|tier[\s-]?2|global talent|work authorization|right to work|ead|opt|stem opt/i.test(
    lower(text)
  );

export const detectEasyApply = (text = "", source = "") =>
  /easy apply|quick apply|1[\s-]?click apply|apply now|one click/i.test(lower(text)) ||
  [
    "RemoteOK",
    "WeWorkRemotely",
    "Remotive",
    "Wellfound",
    "Himalayas",
    "YC Startups",
    "Jobgether",
    "Arc.dev",
    "Lemon.io",
    "Braintrust",
  ].includes(source);

export const experienceLevelFrom = (title = "", text = "") => {
  const t = lower(`${title} ${text}`);
  if (/intern|internship/.test(t)) return "Internship";
  if (/graduate|grad program|early career|early talent|trainee|apprentice|new grad/.test(t)) return "Graduate";
  if (/entry[\s-]?level|associate|junior[\s-]?level/.test(t)) return "Entry";
  if (/junior/.test(t)) return "Junior";
  if (/senior|staff|principal|lead|head of/.test(t)) return "Senior";
  if (/mid[\s-]?level|middle/.test(t)) return "Mid";
  return "Any";
};

// Reputation tier 3 = household-name tech, 2 = well-known startups, 1 = other.
export const REPUTATION = {
  google: 3, microsoft: 3, amazon: 3, meta: 3, facebook: 3, apple: 3, netflix: 3,
  stripe: 3, cloudflare: 3, shopify: 3, uber: 3, spotify: 3, airbnb: 3, coinbase: 3,
  twitch: 3, salesforce: 3, nvidia: 3, adobe: 3, github: 3, gitlab: 3,
  paystack: 3, flutterwave: 3, moniepoint: 3, interswitch: 3, kuda: 3, opay: 3,
  palmpay: 3, piggyvest: 3, andela: 3, mongodb: 3, datadog: 3, snowflake: 3,
  vercel: 2, supabase: 2, linear: 2, notion: 2, figma: 2, remoteok: 2, toptal: 2,
  turing: 2, arc: 2, lemon: 2, gun: 2, braintrust: 2, jobgether: 2, wellfound: 2,
  ycombinator: 2, otta: 2, flexjobs: 2, remotive: 2, jobberman: 2, talentql: 2,
};

export const companyReputation = (company = "") => {
  const c = lower(company);
  for (const k of Object.keys(REPUTATION)) if (c.includes(k)) return REPUTATION[k];
  return 1;
};

// Companies headquartered in / strongly hiring from Africa or Nigeria.
export const AFRICA_COMPANIES = [
  "paystack", "flutterwave", "moniepoint", "interswitch", "kuda", "opay", "palmpay",
  "piggyvest", "andela", "talentql", "gebeya", "decagon", "semicolon", "techcabal",
  "cowrywise", "teamapt", "reliance health", "seamlesshr", "termii", "monieworld",
  "helium health", "fairmoney", "autochek", "carbon", "jobberman", "myjobmag",
  "hot nigerian", "jobzilla", "afri", "venture garden", "bridgetech",
];

export const isAfricaFriendly = (job = {}) => {
  const loc = lower(`${job.location || ""}`);
  const company = lower(`${job.company || ""}`);
  const text = lower(`${job.title || ""} ${job.description || ""}`);
  if (/(nigeria|lagos|abuja|africa|ghana|kenya|south africa|remote.*africa|africa.*remote)/.test(`${loc} ${text}`)) return true;
  if (AFRICA_COMPANIES.some((c) => company.includes(c))) return true;
  if (job.category === CAT.AFRICA) return true;
  return false;
};

const daysSince = (dateStr) => {
  const d = new Date(dateStr);
  if (isNaN(d)) return 999;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

export const daysSincePosted = daysSince;

export const qualityScore = (j) => {
  let s = 0;
  if (j.remote) s += 25;
  if (j.salary && j.salary !== "Not specified" && j.salary !== "Competitive") s += 18;
  if (j.visaSponsorship) s += 12;
  if (j.easyApply) s += 10;
  if (daysSince(j.postedDate) <= 21) s += 15;
  s += j.companyReputation === 3 ? 10 : j.companyReputation === 2 ? 5 : 0;
  if (["Internship", "Graduate", "Entry", "Junior"].includes(j.experienceLevel)) s += 5;
  if (j.priority === PRIORITY.REMOTE_GLOBAL) s += 5; // preferred platforms for Nigerian devs
  return Math.max(0, Math.min(100, s));
};

/**
 * Normalize a raw job into the standard shape with derived quality metadata.
 */
export const normalize = (job, opts = {}) => {
  const {
    source = "",
    category = CAT.GLOBAL_BOARDS,
    priority = PRIORITY.GLOBAL_BOARDS,
    startup = false,
    bigTech = false,
    africa = false,
  } = opts;

  const title = String(job.title || job.position || job.role || "");
  const company = String(job.company || job.company_name || job.companyName || "Unknown");
  const location = String(job.location || "Remote");
  const description = String(job.description || job.text || job.snippet || job.summary || "");
  const salary = String(job.salary || "Not specified");
  const applyLink = job.applyLink || job.url || job.link || job.apply_url || job.hostedUrl || "";

  const remote = detectRemote(title, location, description);
  const visaSponsorship = detectVisa(description);
  const easyApply = detectEasyApply(description, source);
  const experienceLevel = experienceLevelFrom(title, description);
  const rep = companyReputation(company);
  const postedDate =
    job.postedDate || job.date || job.datePosted || job.created_at || job.publication_date || job.updated_at || new Date().toISOString();

  const base = {
    id: job.id || `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    company,
    location,
    description,
    skills: job.skills || job.tags || job.keywords || [],
    salary,
    applyLink,
    source,
    category,
    priority,
    startup: startup || ["Wellfound", "YC Startups", "Arc.dev", "Lemon.io", "Gun.io", "Braintrust", "Jobgether", "Himalayas"].includes(source),
    bigTech: bigTech || rep === 3,
    africa: africa || isAfricaFriendly({ location, company, description, title, category }),
    remote,
    visaSponsorship,
    easyApply,
    experienceLevel,
    companyReputation: rep,
    postedDate,
    hiringNow: daysSince(postedDate) <= 7,
  };
  base.qualityScore = qualityScore(base);
  return base;
};

/**
 * Compute which dashboard sections a (possibly user-scored) job belongs to.
 * Returns an object of booleans keyed by section id.
 */
export const classifySections = (job = {}) => {
  const matchScore = job.atsScore != null ? job.atsScore : job.qualityScore || 0;
  return {
    "top-remote": !!job.remote,
    "nigeria-friendly": !!job.africa,
    "graduate": job.experienceLevel === "Graduate" || job.category === CAT.GRAD_BIGTECH,
    "internships": job.experienceLevel === "Internship",
    "startup": !!job.startup && job.companyReputation < 3,
    "big-tech": !!job.bigTech || job.companyReputation === 3,
    "highest-paying": !!(job.salary && job.salary !== "Not specified" && job.salary !== "Competitive"),
    "easy-apply": !!job.easyApply,
    "hiring-now": !!job.hiringNow,
    "top-match": matchScore >= 90,
  };
};

/**
 * Apply hard filters requested by the user / dashboard.
 * All filters are optional; nullish values are ignored.
 */
export const filterJobs = (jobs = [], filters = {}) => {
  const {
    query,
    country,
    company,
    role,
    remote,
    salary, // minimum salary number (best-effort)
    techStack, // array of strings
    experienceLevel,
    visaSponsorship,
  } = filters;

  const q = query ? lower(query) : null;
  const roleQ = role ? lower(role) : null;
  const compQ = company ? lower(company) : null;
  const countryQ = country ? lower(country) : null;
  const tech = Array.isArray(techStack)
    ? techStack.map((t) => lower(t)).filter(Boolean)
    : techStack
    ? [lower(techStack)]
    : [];

  return jobs.filter((j) => {
    const hay = lower(`${j.title} ${j.company} ${j.description} ${j.location}`);
    const skills = (j.skills || []).map((s) => lower(s));

    if (q && !hay.includes(q) && !skills.some((s) => s.includes(q))) return false;
    if (roleQ && !lower(`${j.title} ${j.description}`).includes(roleQ)) return false;
    if (compQ && !lower(j.company).includes(compQ)) return false;
    if (countryQ && !lower(String(j.location || "")).includes(countryQ)) return false;
    if (remote === true && !j.remote) return false;
    if (visaSponsorship === true && !j.visaSponsorship) return false;
    if (experienceLevel && j.experienceLevel !== experienceLevel) return false;
    if (tech.length) {
      const ok = tech.every((t) => hay.includes(t) || skills.some((s) => s.includes(t)));
      if (!ok) return false;
    }
    if (salary != null && salary !== "") {
      const nums = String(j.salary || "").replace(/[^0-9]/g, " ");
      const max = Math.max(0, ...nums.split(/\s+/).filter(Boolean).map(Number));
      if (max && max < Number(salary)) return false;
    }
    return true;
  });
};
