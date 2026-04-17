import axios from "axios";

// ─────────────────────────────────────────────
// 🔐 API KEYS — fill these in your .env
// ─────────────────────────────────────────────
const ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;
const JOOBLE_API_KEY = process.env.JOOBLE_API_KEY;
const REED_API_KEY   = process.env.REED_API_KEY;      // reed.co.uk
const JSEARCH_KEY    = process.env.JSEARCH_KEY;        // RapidAPI JSearch (Google Jobs)
const FINDWORK_KEY   = process.env.FINDWORK_KEY;       // findwork.dev

// ─────────────────────────────────────────────
// 🔍 SHARED HELPERS
// ─────────────────────────────────────────────
const isRelevantJob = (title = "") =>
  /frontend|back.?end|full.?stack|software|engineer|developer|react|node|typescript|javascript/i.test(title);

const isNewGradFriendly = (text = "") =>
  /junior|entry.?level|graduate|new.?grad|0.?[-–]2|1.?[-–]3|intern|associate/i.test(text);

const isVisaFriendly = (text = "") =>
  /visa|sponsor|relocation|h.?1b|tier.?2|global.?talent|work.?authoriz/i.test(text);

const normalize = (job) => ({
  id:          job.id          || "",
  title:       job.title       || "",
  company:     job.company     || "Unknown",
  location:    job.location    || "Remote",
  description: job.description || "",
  skills:      job.skills      || [],
  datePosted:  job.datePosted  || new Date().toISOString(),
  salary:      job.salary      || "Not specified",
  applyLink:   job.applyLink   || "",
  source:      job.source      || "",
  newGrad:     isNewGradFriendly((job.title || "") + " " + (job.description || "")),
  visaFriendly:isVisaFriendly((job.title || "") + " " + (job.description || "")),
});

const safe = async (name, fn) => {
  try {
    const result = await fn();
    console.log(`✅ ${name}: ${result.length} jobs`);
    return result;
  } catch (e) {
    console.error(`❌ ${name} failed:`, e.message);
    return [];
  }
};

// ═══════════════════════════════════════════════════════════
// 🌍 SECTION 1 — FREE / NO-KEY SOURCES
// ═══════════════════════════════════════════════════════════

// ① RemoteOK — remote-first, many startups
const scrapeRemoteOK = () => safe("RemoteOK", async () => {
  const { data } = await axios.get("https://remoteok.com/api", {
    headers: { "User-Agent": "HirePilot/1.0" },
  });
  return data.slice(1)
    .filter(j => isRelevantJob(j.position))
    .map(j => normalize({
      id:          `remoteok-${j.id}`,
      title:       j.position,
      company:     j.company,
      location:    j.location || "Remote",
      description: j.description,
      skills:      j.tags || [],
      datePosted:  j.date,
      salary:      j.salary_min ? `$${j.salary_min} - $${j.salary_max}` : "Not specified",
      applyLink:   j.url,
      source:      "RemoteOK",
    }));
});

// ② Remotive — remote only
const scrapeRemotive = () => safe("Remotive", async () => {
  const { data } = await axios.get("https://remotive.com/api/remote-jobs");
  return data.jobs
    .filter(j => isRelevantJob(j.title))
    .map(j => normalize({
      id:          `remotive-${j.id}`,
      title:       j.title,
      company:     j.company_name,
      location:    j.candidate_required_location || "Remote",
      description: j.description,
      skills:      j.tags || [],
      datePosted:  j.publication_date,
      salary:      j.salary || "Not specified",
      applyLink:   j.url,
      source:      "Remotive",
    }));
});

// ③ Arbeitnow — EU + remote, visa sponsorship tags
const scrapeArbeitnow = () => safe("Arbeitnow", async () => {
  const { data } = await axios.get("https://www.arbeitnow.com/api/job-board-api");
  return data.data
    .filter(j => isRelevantJob(j.title))
    .map(j => normalize({
      id:          `arbeitnow-${j.slug}`,
      title:       j.title,
      company:     j.company_name,
      location:    j.location || "Remote",
      description: j.description,
      skills:      j.tags || [],
      datePosted:  j.created_at,
      applyLink:   j.url,
      source:      "Arbeitnow",
    }));
});

// ④ The Muse — startup culture, entry-level friendly
const scrapeMuse = () => safe("TheMuse", async () => {
  const { data } = await axios.get("https://www.themuse.com/api/public/jobs?page=1&level=Entry+Level&level=Mid+Level");
  return data.results
    .filter(j => isRelevantJob(j.name))
    .map(j => normalize({
      id:          `muse-${j.id}`,
      title:       j.name,
      company:     j.company.name,
      location:    j.locations?.[0]?.name || "Remote",
      description: j.contents,
      skills:      j.categories?.map(c => c.name) || [],
      datePosted:  j.publication_date,
      applyLink:   j.refs.landing_page,
      source:      "TheMuse",
    }));
});

// ⑤ GitHub Jobs (via proxy) — dev-focused, big + startup
const scrapeGitHubJobs = () => safe("HackerNews Who's Hiring", async () => {
  // Uses the Hacker News "Ask HN: Who is hiring?" posts via Algolia
  const { data } = await axios.get(
    "https://hn.algolia.com/api/v1/search_by_date?query=who+is+hiring&tags=story&hitsPerPage=1"
  );
  const storyId = data.hits[0]?.objectID;
  if (!storyId) return [];

  const { data: story } = await axios.get(
    `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&hitsPerPage=100`
  );

  return story.hits
    .filter(h => isRelevantJob(h.comment_text || ""))
    .slice(0, 30)
    .map((h, i) => normalize({
      id:          `hn-${h.objectID}`,
      title:       "Software Engineer (HN Hiring)",
      company:     h.author,
      location:    "Remote / Various",
      description: h.comment_text?.replace(/<[^>]*>/g, "") || "",
      datePosted:  h.created_at,
      applyLink:   `https://news.ycombinator.com/item?id=${h.objectID}`,
      source:      "HackerNews",
    }));
});

// ⑥ Findwork.dev — verified tech jobs, clean API
const scrapeFindwork = () => safe("Findwork", async () => {
  const { data } = await axios.get("https://findwork.dev/api/jobs/?role=software+engineer&sort_by=date", {
    headers: { Authorization: `Token ${FINDWORK_KEY}` },
  });
  return data.results
    .filter(j => isRelevantJob(j.role))
    .map(j => normalize({
      id:          `findwork-${j.id}`,
      title:       j.role,
      company:     j.company_name,
      location:    j.location || "Remote",
      description: `${j.text || ""} Keywords: ${j.keywords?.join(", ")}`,
      skills:      j.keywords || [],
      datePosted:  j.date_posted,
      applyLink:   j.url,
      source:      "Findwork",
    }));
});

// ⑦ USAJobs — US federal/gov tech roles (no key needed)
const scrapeUSAJobs = () => safe("USAJobs", async () => {
  const { data } = await axios.get(
    "https://data.usajobs.gov/api/search?Keyword=software+engineer&ResultsPerPage=25",
    { headers: { "User-Agent": "hirepilot@email.com", "Authorization-Key": "" } }
  );
  return (data.SearchResult?.SearchResultItems || [])
    .filter(j => isRelevantJob(j.MatchedObjectDescriptor?.PositionTitle || ""))
    .map(j => {
      const d = j.MatchedObjectDescriptor;
      return normalize({
        id:          `usa-${d.PositionID}`,
        title:       d.PositionTitle,
        company:     d.OrganizationName,
        location:    d.PositionLocationDisplay,
        description: d.UserArea?.Details?.JobSummary || "",
        datePosted:  d.PublicationStartDate,
        salary:      `${d.PositionRemuneration?.[0]?.MinimumRange} - ${d.PositionRemuneration?.[0]?.MaximumRange}`,
        applyLink:   d.PositionURI,
        source:      "USAJobs",
      });
    });
});

// ═══════════════════════════════════════════════════════════
// 🔑 SECTION 2 — API KEY SOURCES (high volume)
// ═══════════════════════════════════════════════════════════

// ⑧ Adzuna — 10M+ jobs, US / UK / CA / NG
const scrapeAdzuna = (country = "us") => safe(`Adzuna (${country.toUpperCase()})`, async () => {
  const { data } = await axios.get(
    `https://api.adzuna.com/v1/api/jobs/${country}/search/1`,
    { params: { app_id: ADZUNA_APP_ID, app_key: ADZUNA_APP_KEY, what: "software developer react node typescript", results_per_page: 50 } }
  );
  return (data.results || [])
    .filter(j => isRelevantJob(j.title))
    .map(j => normalize({
      id:          `adzuna-${country}-${j.id}`,
      title:       j.title,
      company:     j.company.display_name,
      location:    j.location.display_name,
      description: j.description,
      datePosted:  j.created,
      salary:      j.salary_min ? `${j.salary_min} - ${j.salary_max}` : "Not specified",
      applyLink:   j.redirect_url,
      source:      `Adzuna ${country.toUpperCase()}`,
    }));
});

// ⑨ Jooble — global aggregator 🌍
const scrapeJooble = (location = "Remote") => safe(`Jooble (${location})`, async () => {
  const { data } = await axios.post(`https://jooble.org/api/${JOOBLE_API_KEY}`, {
    keywords: "full stack developer react node typescript",
    location,
  });
  return (data.jobs || [])
    .filter(j => isRelevantJob(j.title))
    .map(j => normalize({
      id:          `jooble-${j.id || j.link}`,
      title:       j.title,
      company:     j.company || "Unknown",
      location:    j.location || location,
      description: j.snippet || "",
      datePosted:  j.updated,
      salary:      j.salary || "Not specified",
      applyLink:   j.link,
      source:      "Jooble",
    }));
});

// ⑩ Reed.co.uk — #1 UK job board (visa + grad friendly)
const scrapeReed = () => safe("Reed (UK)", async () => {
  const { data } = await axios.get("https://www.reed.co.uk/api/1.0/search", {
    params: { keywords: "junior software engineer react typescript node", resultsToTake: 50 },
    auth: { username: REED_API_KEY, password: "" },
  });
  return (data.results || [])
    .map(j => normalize({
      id:          `reed-${j.jobId}`,
      title:       j.jobTitle,
      company:     j.employerName,
      location:    j.locationName,
      description: j.jobDescription,
      datePosted:  j.date,
      salary:      j.minimumSalary ? `£${j.minimumSalary} - £${j.maximumSalary}` : "Not specified",
      applyLink:   j.jobUrl,
      source:      "Reed UK",
    }));
});

// ⑪ JSearch (RapidAPI) — powers Google Jobs, massive coverage
const scrapeJSearch = (query = "junior full stack developer react node", location = "United States") =>
  safe(`JSearch (${location})`, async () => {
    const { data } = await axios.get("https://jsearch.p.rapidapi.com/search", {
      params: { query: `${query} in ${location}`, num_pages: 2, date_posted: "today" },
      headers: {
        "X-RapidAPI-Key":  JSEARCH_KEY,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      },
    });
    return (data.data || [])
      .filter(j => isRelevantJob(j.job_title))
      .map(j => normalize({
        id:          `jsearch-${j.job_id}`,
        title:       j.job_title,
        company:     j.employer_name,
        location:    `${j.job_city || ""} ${j.job_country || ""}`.trim(),
        description: j.job_description,
        skills:      j.job_required_skills || [],
        datePosted:  j.job_posted_at_datetime_utc,
        salary:      j.job_min_salary ? `${j.job_min_salary} - ${j.job_max_salary}` : "Not specified",
        applyLink:   j.job_apply_link,
        source:      `JSearch (${location})`,
      }));
  });

// ═══════════════════════════════════════════════════════════
// 🇳🇬 SECTION 3 — NIGERIA LOCAL JOB BOARDS
// ═══════════════════════════════════════════════════════════

// ⑫ MyJobMag Nigeria
const scrapeMyJobMag = () => safe("MyJobMag (Nigeria)", async () => {
  const { data } = await axios.get(
    "https://www.myjobmag.com/feed/jobs.json?category=Technology&location=Nigeria",
    { headers: { "User-Agent": "HirePilot/1.0" } }
  );
  return (data.jobs || data || [])
    .filter(j => isRelevantJob(j.title || j.job_title || ""))
    .map(j => normalize({
      id:          `myjobmag-${j.id || j.slug}`,
      title:       j.title || j.job_title,
      company:     j.company || j.employer,
      location:    j.location || "Lagos, Nigeria",
      description: j.description || "",
      datePosted:  j.date || j.created_at,
      applyLink:   j.url || j.link,
      source:      "MyJobMag NG",
    }));
});

// ⑬ Jobberman Nigeria — #1 Nigerian job board
const scrapeJobberman = () => safe("Jobberman (Nigeria)", async () => {
  const { data } = await axios.get(
    "https://www.jobberman.com/api/v3/jobs?q=software+developer&page=1&per_page=50",
    { headers: { "User-Agent": "HirePilot/1.0", Accept: "application/json" } }
  );
  return (data.data || data.jobs || [])
    .filter(j => isRelevantJob(j.title || j.position || ""))
    .map(j => normalize({
      id:          `jobberman-${j.id}`,
      title:       j.title || j.position,
      company:     j.company?.name || j.employer_name,
      location:    j.location?.city || "Nigeria",
      description: j.description || j.summary || "",
      datePosted:  j.created_at || j.published_at,
      salary:      j.salary_range || "Not specified",
      applyLink:   `https://www.jobberman.com/jobs/${j.slug || j.id}`,
      source:      "Jobberman NG",
    }));
});

// ⑭ HotNigerianJobs RSS → JSON
const scrapeHotNigerianJobs = () => safe("HotNigerianJobs", async () => {
  const rssUrl = "https://api.rss2json.com/v1/api.json?rss_url=https://www.hotnigeriansjobs.com/feeds/posts/default";
  const { data } = await axios.get(rssUrl);
  return (data.items || [])
    .filter(j => isRelevantJob(j.title || ""))
    .map(j => normalize({
      id:          `hng-${j.guid}`,
      title:       j.title,
      company:     "See listing",
      location:    "Nigeria",
      description: j.description?.replace(/<[^>]*>/g, "") || "",
      datePosted:  j.pubDate,
      applyLink:   j.link,
      source:      "HotNigerianJobs",
    }));
});

// ═══════════════════════════════════════════════════════════
// 🚀 SECTION 4 — BIG TECH / STARTUP CAREER PAGES (Direct)
// ═══════════════════════════════════════════════════════════

// ⑮ Lever ATS — powers 1000s of startups (Notion, Figma etc.)
const scrapeLeverStartups = () => safe("Lever Startups", async () => {
  // Sample of high-signal startups on Lever — extend this list freely
  const companies = [
    { name: "Vercel",    slug: "vercel"    },
    { name: "Supabase",  slug: "supabase"  },
    { name: "Linear",    slug: "linear"    },
    { name: "Loom",      slug: "loom"      },
    { name: "Deel",      slug: "deel"      },
    { name: "Rippling",  slug: "rippling"  },
    { name: "Retool",    slug: "retool"    },
    { name: "Figma",     slug: "figma"     },
    { name: "Notion",    slug: "notion"    },
    { name: "Brex",      slug: "brex"      },
  ];

  const results = await Promise.allSettled(
    companies.map(c =>
      axios.get(`https://api.lever.co/v0/postings/${c.slug}?mode=json`)
        .then(res => res.data
          .filter(j => isRelevantJob(j.text))
          .map(j => normalize({
            id:          `lever-${c.slug}-${j.id}`,
            title:       j.text,
            company:     c.name,
            location:    j.categories?.location || "Remote",
            description: j.descriptionPlain || "",
            datePosted:  new Date(j.createdAt).toISOString(),
            applyLink:   j.hostedUrl,
            source:      "Lever (Startup)",
          }))
        )
    )
  );

  return results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value);
});

// ⑯ Greenhouse ATS — powers Airbnb, Coinbase, Stripe etc.
const scrapeGreenhouseBigTech = () => safe("Greenhouse (Big Tech)", async () => {
  const companies = [
    { name: "Stripe",    slug: "stripe"      },
    { name: "Airbnb",    slug: "airbnb"      },
    { name: "Coinbase",  slug: "coinbase"    },
    { name: "Shopify",   slug: "shopify"     },
    { name: "HubSpot",   slug: "hubspot"     },
    { name: "Twilio",    slug: "twilio"      },
    { name: "Zapier",    slug: "zapier"      },
    { name: "Intercom",  slug: "intercom"    },
    { name: "MongoDB",   slug: "mongodb"     },
    { name: "Cloudflare",slug: "cloudflare"  },
  ];

  const results = await Promise.allSettled(
    companies.map(c =>
      axios.get(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`)
        .then(res => (res.data.jobs || [])
          .filter(j => isRelevantJob(j.title))
          .map(j => normalize({
            id:          `gh-${c.slug}-${j.id}`,
            title:       j.title,
            company:     c.name,
            location:    j.location?.name || "Remote",
            description: j.content?.replace(/<[^>]*>/g, "") || "",
            datePosted:  j.updated_at,
            applyLink:   j.absolute_url,
            source:      "Greenhouse (Big Tech)",
          }))
        )
    )
  );

  return results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value);
});

// ⑰ YC Work at a Startup — YC-backed companies only 🔥
const scrapeYCStartups = () => safe("YC Work at a Startup", async () => {
  const { data } = await axios.get(
    "https://api.workatastartup.com/companies/fetch?query=software+engineer&eng_org_size[]=1&eng_org_size[]=2&remote=true",
    { headers: { "User-Agent": "HirePilot/1.0", Accept: "application/json" } }
  );
  return (data.startups || []).flatMap(company =>
    (company.jobs || [])
      .filter(j => isRelevantJob(j.title))
      .map(j => normalize({
        id:          `yc-${company.id}-${j.id}`,
        title:       j.title,
        company:     company.name,
        location:    j.location || "Remote",
        description: j.description || company.long_description || "",
        skills:      j.skills || [],
        datePosted:  j.created_at,
        applyLink:   `https://www.workatastartup.com/jobs/${j.id}`,
        source:      "YC Startup",
      }))
  );
});

// ═══════════════════════════════════════════════════════════
// 🎯 MAIN EXPORT
// ═══════════════════════════════════════════════════════════
export const scrapeJobs = async () => {
  console.log("🚀 HirePilot job scraper starting...\n");

  const allResults = await Promise.allSettled([
    // Free / no-key
    scrapeRemoteOK(),
    scrapeRemotive(),
    scrapeArbeitnow(),
    scrapeMuse(),
    scrapeGitHubJobs(),
    scrapeUSAJobs(),

    // API key required
    ...(FINDWORK_KEY   ? [scrapeFindwork()]                          : []),
    ...(ADZUNA_APP_ID  ? [scrapeAdzuna("us"), scrapeAdzuna("gb"), scrapeAdzuna("ca")] : []),
    ...(JOOBLE_API_KEY ? [scrapeJooble("Remote"), scrapeJooble("Nigeria"), scrapeJooble("United Kingdom")] : []),
    ...(REED_API_KEY   ? [scrapeReed()]                              : []),
    ...(JSEARCH_KEY    ? [
        scrapeJSearch("junior full stack developer react node", "United States"),
        scrapeJSearch("junior software engineer typescript node", "United Kingdom"),
        scrapeJSearch("software developer react node entry level",  "Canada"),
        scrapeJSearch("software engineer react node", "Nigeria"),
      ] : []),

    // Nigeria local
    scrapeMyJobMag(),
    scrapeJobberman(),
    scrapeHotNigerianJobs(),

    // Direct ATS — startups & big tech
    scrapeLeverStartups(),
    scrapeGreenhouseBigTech(),
    scrapeYCStartups(),
  ]);

  // ✅ Flatten successful results only
  let jobs = allResults
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .filter(j => j.title && j.applyLink);

  // ✅ De-duplicate by title + company
  const seen = new Set();
  jobs = jobs.filter(j => {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ✅ Sort: newest first
  jobs.sort((a, b) => new Date(b.datePosted) - new Date(a.datePosted));

  console.log(`\n✅ Total unique jobs scraped: ${jobs.length}`);
  console.log(`🎓 New-grad friendly: ${jobs.filter(j => j.newGrad).length}`);
  console.log(`🌍 Visa-friendly:     ${jobs.filter(j => j.visaFriendly).length}`);

  return jobs;
};

// ─────────────────────────────────────────────
// 📊 FILTER HELPERS — use in your controller
// ─────────────────────────────────────────────

/** Filter jobs to new-grad / entry level only */
export const filterNewGrad   = (jobs) => jobs.filter(j => j.newGrad);

/** Filter jobs that mention visa sponsorship */
export const filterVisa      = (jobs) => jobs.filter(j => j.visaFriendly);

/** Filter jobs by country keyword */
export const filterByCountry = (jobs, country) =>
  jobs.filter(j => j.location?.toLowerCase().includes(country.toLowerCase()));