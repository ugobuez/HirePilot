import { useState } from "react";
import { uploadResume, matchJobs, scrapeJobs } from "../services/api";

export default function JobMatcher() {
  const [file, setFile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");
  const [locations, setLocations] = useState([]);
  const [keyword, setKeyword] = useState("");

  const countriesList = [
    "United States",
    "United Kingdom",
    "Canada",
    "Nigeria",
    "France",
    "Germany",
    "Netherlands",
    "Spain",
    "Italy",
    "India",
    "Australia",
    "South Africa",
    "UAE",
    "Singapore",
  ];

  const handleLocationChange = (e) => {
    const value = e.target.value;

    if (locations.includes(value)) {
      setLocations(locations.filter((l) => l !== value));
    } else {
      if (locations.length >= 5) {
        return alert("You can select up to 5 locations only");
      }
      setLocations([...locations, value]);
    }
  };

  const handleUpload = async () => {
    if (!file) return alert("Upload resume");
    if (!keyword) return alert("Enter job keyword");
    if (locations.length === 0) return alert("Select at least one location");

    setLoading(true);
    setJobs([]);

    try {
      setStep("🔄 Scraping jobs...");
      await scrapeJobs({ locations, keyword });

      setStep("📄 Uploading resume...");
      const { resumeId } = await uploadResume(file);

      setStep("🤖 Matching jobs...");
      const matchedJobs = await matchJobs(resumeId);

      setJobs(matchedJobs);
      setStep("✅ Done!");
    } catch (err) {
      console.error(err);
      alert("❌ Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">

      <h2 className="text-center mb-4">AI Job Matcher 🚀</h2>

      <div className="card p-4">

        {/* KEYWORD */}
        <input
          type="text"
          placeholder="Enter job keyword (e.g. React Developer)"
          className="form-control mb-3"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        {/* LOCATIONS - FIXED GRID LAYOUT */}
        <p className="fw-bold">Select up to 5 locations:</p>

        <div className="row">
          {countriesList.map((loc) => (
            <div key={loc} className="col-6 mb-2">
              <div className="form-check">
                <input
                  type="checkbox"
                  value={loc}
                  className="form-check-input"
                  onChange={handleLocationChange}
                  checked={locations.includes(loc)}
                />
                <label className="form-check-label">{loc}</label>
              </div>
            </div>
          ))}
        </div>

        {/* FILE */}
        <input
          type="file"
          className="form-control my-3"
          onChange={(e) => setFile(e.target.files[0])}
        />

        <button
          className="btn btn-dark w-100"
          onClick={handleUpload}
          disabled={loading}
        >
          {loading ? "Processing..." : "Find Jobs"}
        </button>

        {loading && (
          <p className="mt-3 text-center text-muted">{step}</p>
        )}
      </div>

      {/* RESULTS */}
      {jobs.length > 0 && (
        <div className="card mt-4 p-4">
          <h4>Top Matches</h4>

          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Company</th>
                <th>Location</th>
                <th>Date</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {jobs.map((job, i) => (
                <tr key={i}>
                  <td>{job.title}</td>
                  <td>{job.company}</td>
                  <td>{job.location}</td>
                  <td>{job.datePosted}</td>
                  <td>{job.score}</td>
                  <td>
                    <a
                      href={job.applyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apply
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        </div>
      )}
    </div>
  );
}