// services/api.js

export const uploadResume = async (file) => {
  const formData = new FormData();
  formData.append("resume", file);

  const res = await fetch("http://localhost:6900/api/resume/upload-resume", {
    method: "POST",
    body: formData,
  });

  return res.json();
};

export const matchJobs = async (resumeId) => {
  const res = await fetch("http://localhost:6900/api/match-jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resumeId }),
  });

  if (!res.ok) {
    throw new Error("Match jobs failed");
  }

  return res.json();
};


export const scrapeJobs = async (data) => {
  const res = await fetch("http://localhost:6900/api/scrape-jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error("Scraping failed");
  }

  return res.json();
};