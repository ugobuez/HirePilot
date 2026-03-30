import axios from "axios";

// 🔐 Add your API keys here
const ADZUNA_APP_ID = "YOUR_ADZUNA_APP_ID";
const ADZUNA_APP_KEY = "YOUR_ADZUNA_APP_KEY";
const JOOBLE_API_KEY = "YOUR_JOOBLE_API_KEY";

// 🔍 Common filter
const isRelevantJob = (title = "") => {
  return /frontend|backend|fullstack|software|engineer|developer|react|node/i.test(
    title
  );
};

// ✅ RemoteOK
const scrapeRemoteOK = async () => {
  const { data } = await axios.get("https://remoteok.com/api");

  return data.slice(1)
    .filter(job => isRelevantJob(job.position))
    .map(job => ({
      id: `remoteok-${job.id}`,
      title: job.position,
      company: job.company,
      location: job.location || "Remote",
      description: job.description,
      skills: job.tags || [],
      datePosted: job.date,
      salary: job.salary_min && job.salary_max
        ? `$${job.salary_min} - $${job.salary_max}`
        : "Not specified",
      applyLink: job.url,
      source: "RemoteOK",
    }));
};

// ✅ Remotive
const scrapeRemotive = async () => {
  const { data } = await axios.get("https://remotive.com/api/remote-jobs");

  return data.jobs
    .filter(job => isRelevantJob(job.title))
    .map(job => ({
      id: `remotive-${job.id}`,
      title: job.title,
      company: job.company_name,
      location: job.candidate_required_location || "Remote",
      description: job.description,
      skills: job.tags || [],
      datePosted: job.publication_date,
      salary: job.salary || "Not specified",
      applyLink: job.url,
      source: "Remotive",
    }));
};

// ✅ Arbeitnow
const scrapeArbeitnow = async () => {
  const { data } = await axios.get(
    "https://www.arbeitnow.com/api/job-board-api"
  );

  return data.data
    .filter(job => isRelevantJob(job.title))
    .map(job => ({
      id: `arbeitnow-${job.slug}`,
      title: job.title,
      company: job.company_name,
      location: job.location || "Remote",
      description: job.description,
      skills: job.tags || [],
      datePosted: job.created_at,
      salary: "Not specified",
      applyLink: job.url,
      source: "Arbeitnow",
    }));
};

// ✅ The Muse (startup culture jobs 🔥)
const scrapeMuse = async () => {
  const { data } = await axios.get(
    "https://www.themuse.com/api/public/jobs?page=1"
  );

  return data.results
    .filter(job => isRelevantJob(job.name))
    .map(job => ({
      id: `muse-${job.id}`,
      title: job.name,
      company: job.company.name,
      location: job.locations?.[0]?.name || "Remote",
      description: job.contents,
      skills: job.categories?.map(c => c.name) || [],
      datePosted: job.publication_date,
      salary: "Not specified",
      applyLink: job.refs.landing_page,
      source: "TheMuse",
    }));
};

// ✅ Adzuna (HIGH VOLUME 🔥)
const scrapeAdzuna = async () => {
  try {
    const { data } = await axios.get(
      `https://api.adzuna.com/v1/api/jobs/us/search/1`,
      {
        params: {
          app_id: ADZUNA_APP_ID,
          app_key: ADZUNA_APP_KEY,
          what: "software developer",
        },
      }
    );

    return data.results
      .filter(job => isRelevantJob(job.title))
      .map(job => ({
        id: `adzuna-${job.id}`,
        title: job.title,
        company: job.company.display_name,
        location: job.location.display_name,
        description: job.description,
        skills: [],
        datePosted: job.created,
        salary: job.salary_min
          ? `$${job.salary_min} - ${job.salary_max}`
          : "Not specified",
        applyLink: job.redirect_url,
        source: "Adzuna",
      }));
  } catch {
    return [];
  }
};

// ✅ Jooble (global jobs 🌍)
const scrapeJooble = async () => {
  try {
    const { data } = await axios.post(
      `https://jooble.org/api/${JOOBLE_API_KEY}`,
      {
        keywords: "software developer",
        location: "Remote",
      }
    );

    return data.jobs
      .filter(job => isRelevantJob(job.title))
      .map(job => ({
        id: `jooble-${job.id || job.link}`,
        title: job.title,
        company: job.company || "Unknown",
        location: job.location || "Remote",
        description: job.snippet || "",
        skills: [],
        datePosted: job.updated,
        salary: job.salary || "Not specified",
        applyLink: job.link,
        source: "Jooble",
      }));
  } catch {
    return [];
  }
};

// 🚀 MAIN FUNCTION
export const scrapeJobs = async () => {
  try {
    const results = await Promise.allSettled([
      scrapeRemoteOK(),
      scrapeRemotive(),
      scrapeArbeitnow(),
      scrapeMuse(),
      scrapeAdzuna(),
      scrapeJooble(),
    ]);

    // ✅ Extract successful results only
    let jobs = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value);

    // ✅ Remove duplicates
    jobs = jobs.filter(
      (job, index, self) =>
        index ===
        self.findIndex(
          j =>
            j.title.toLowerCase() === job.title.toLowerCase() &&
            j.company.toLowerCase() === job.company.toLowerCase()
        )
    );

    // ✅ Sort latest first
    jobs.sort(
      (a, b) => new Date(b.datePosted) - new Date(a.datePosted)
    );

    return jobs;
  } catch (error) {
    console.error("Scraping error:", error);
    return [];
  }
};