import { ApifyClient } from "apify-client";

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

export const scrapeJobsFromApify = async (locations = [], keyword = "developer") => {
  let allJobs = [];

  if (!Array.isArray(locations)) return [];

  const map = {
    "United States": { code: "us" },
    "United Kingdom": { code: "gb" },
    "Canada": { code: "ca" },
    "Nigeria": { code: "ng" },
    "France": { code: "fr" },
    "Germany": { code: "de" },
    "Netherlands": { code: "nl" },
    "Spain": { code: "es" },
    "Italy": { code: "it" },
    "India": { code: "in" },
    "Australia": { code: "au" },
    "South Africa": { code: "za" },
    "UAE": { code: "ae" },
    "Singapore": { code: "sg" },
  };

  for (const loc of locations.slice(0, 3)) {
    const country = map[loc];
    if (!country) continue;

    try {
      // 🔥 GOOGLE JOBS
      const googleRun = await client.actor("eneiromatos/google-jobs-scraper").call({
        keyword: keyword?.trim() || "software engineer",
        countryCode: country.code,
        maxPagesPerQuery: 1,
      });

      const googleData = await client.dataset(googleRun.defaultDatasetId).listItems();

      const googleJobs = (googleData?.items || []).map((j) => ({
        title: j.title || "N/A",
        company: j.companyName || "N/A",
        location: loc,
        applyLink: j.applyLink || j.jobUrl || "#",
        datePosted: j.postedAt || "N/A",
        source: "Google",
      }));

      // 🔥 LINKEDIN JOBS (SAFE MODE)
      const linkedinRun = await client.actor("bebity/linkedin-jobs-scraper").call({
        title: keyword,
        location: loc,
        rows: 10,
      });

      const linkedinData = await client.dataset(linkedinRun.defaultDatasetId).listItems();

      const linkedinJobs = (linkedinData?.items || []).map((j) => ({
        title: j.title || "N/A",
        company: j.companyName || "N/A",
        location: loc,
        applyLink: j.applyUrl || j.jobUrl || "#",
        datePosted: j.postedAt || "N/A",
        source: "LinkedIn",
      }));

      allJobs.push(...googleJobs, ...linkedinJobs);
    } catch (err) {
      console.error(`❌ ${loc}:`, err.message);
    }
  }

  return allJobs;
};