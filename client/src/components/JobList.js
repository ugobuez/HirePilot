import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  Code, 
  ChevronRight, 
  Briefcase, 
  Layers, 
  Zap, 
  ArrowUpRight,
  CheckCircle2,
  X
} from "lucide-react";

// ✨ Refined Loader
const SkeletonCard = () => (
  <div className="col-12 col-xl-6">
    <div className="skeleton-pro p-4 rounded-4 border bg-white mb-3">
      <div className="d-flex gap-3 mb-3">
        <div className="skeleton-circle"></div>
        <div className="w-100">
          <div className="skeleton-line w-75"></div>
          <div className="skeleton-line w-50"></div>
        </div>
      </div>
      <div className="skeleton-line w-100 mt-4"></div>
    </div>
  </div>
);

const JobList = () => {
  const [jobs, setJobs] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [search, setSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [selectedJobs, setSelectedJobs] = useState([]);

  // ✅ Uses the configured API base (local by default, overridable via REACT_APP_API_URL)
  const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:6900";
  const fetchJobs = async (pageNum) => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/jobs?page=${pageNum}`, {
        withCredentials: true
      });
      const fetchedJobs = Array.isArray(res.data.jobs) ? res.data.jobs : [];
      setJobs((prev) => (pageNum === 1 ? fetchedJobs : [...prev, ...fetchedJobs]));
      setHasMore(!!res.data.hasMore);
    } catch (err) {
      console.error("Fetch Error:", err);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(page); }, [page]);

  const handleScroll = useCallback(() => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200 && hasMore && !loading) {
      setPage((prev) => prev + 1);
    }
  }, [hasMore, loading]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const toggleSelectJob = (job) => {
    setSelectedJobs((prev) =>
      prev.find((j) => j.id === job.id) ? prev.filter((j) => j.id !== job.id) : [...prev, job]
    );
  };

  const filteredJobs = (jobs || []).filter((job) =>
    (job?.title?.toLowerCase().includes(search.toLowerCase()) || job?.company?.toLowerCase().includes(search.toLowerCase())) &&
    (skillFilter === "" || job?.skills?.some((s) => s.toLowerCase().includes(skillFilter.toLowerCase())))
  );

  return (
    <div className="job-explorer-v4 pb-5">
      {/* 🚀 AI ACTION BAR (Floats when selection exists) */}
      <AnimatePresence>
        {selectedJobs.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="selection-bar shadow-lg border-top"
          >
            <div className="container d-flex justify-content-between align-items-center py-3">
              <div className="d-flex align-items-center gap-3">
                <div className="count-badge">{selectedJobs.length}</div>
                <span className="fw-bold text-white mb-0">Opportunities Selected</span>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-light btn-sm px-3" onClick={() => setSelectedJobs([])}>Clear</button>
                <button className="btn btn-indigo px-4 fw-bold">Apply via HirePilot AI</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🔍 PREMIUM SEARCH HEADER */}
      <div className="search-container mb-5 p-4 rounded-5 shadow-sm border bg-white">
        <div className="row g-3">
          <div className="col-md-6 position-relative">
            <Search className="search-icon-left text-muted" size={18} />
            <input
              className="form-control pro-input ps-5"
              placeholder="Job title, keywords, or company"
              value={search}
            onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-6 position-relative">
            <Code className="search-icon-left text-muted" size={18} />
            <input
              className="form-control pro-input ps-5"
              placeholder="Filter by technology (e.g. React, Python)"
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 💼 JOB GRID */}
      <div className="row g-4">
        {filteredJobs.map((job) => (
          <motion.div key={job.id || job._id} className="col-12 col-xl-6" layout>
            <div className={`pro-job-card p-4 rounded-4 transition-all ${selectedJobs.some(j => (j.id || j._id) === (job.id || job._id)) ? 'selected' : ''}`}>
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div className="d-flex gap-3 align-items-center">
                  <div className="selection-wrapper" onClick={() => toggleSelectJob(job)}>
                    {selectedJobs.some(j => (j.id || j._id) === (job.id || job._id)) ? 
                      <CheckCircle2 className="text-indigo" size={24} /> : 
                      <div className="unselected-circle"></div>
                    }
                  </div>
                  <div>
                    <h5 className="job-title mb-0">{job.title}</h5>
                    <p className="company-subtitle mb-0">{job.company}</p>
                  </div>
                </div>
                <div className={`match-pill ${job.matchScore >= 80 ? 'match-high' : 'match-med'}`}>
                  <Zap size={12} className="me-1 fill-current" />
                  {job.matchScore || 0}% Match
                </div>
              </div>

              <div className="d-flex gap-2 mb-4 flex-wrap">
                {job.skills?.slice(0, 4).map((skill, i) => (
                  <span key={i} className="skill-chip-pro">{skill}</span>
                ))}
              </div>

              <div className="d-flex justify-content-between align-items-center pt-3 border-top mt-auto">
                <button className="btn-details" onClick={() => setSelectedJob(job)}>
                  Job Details <ChevronRight size={14} className="ms-1" />
                </button>
                <a href={job.applyLink} target="_blank" rel="noreferrer" className="btn btn-dark-pro btn-sm rounded-pill px-4">
                  Direct Apply <ArrowUpRight size={14} className="ms-1" />
                </a>
              </div>
            </div>
          </motion.div>
        ))}

        {loading && [...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>

      {/* 📄 SIDE PANEL DETAIL (SLIDING) */}
      <AnimatePresence>
        {selectedJob && (
          <div className="modal show d-block overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="panel-overlay" onClick={() => setSelectedJob(null)} 
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="side-panel-pro bg-white shadow-2xl"
            >
              <div className="p-4 border-bottom d-flex justify-content-between align-items-center bg-light-subtle">
                <div className="d-flex align-items-center gap-2">
                    <Briefcase size={18} className="text-indigo" />
                    <span className="fw-bold text-uppercase small tracking-widest text-muted">Role Specifications</span>
                </div>
                <button className="btn-close-pro" onClick={() => setSelectedJob(null)}><X size={20}/></button>
              </div>

              <div className="p-5 overflow-auto custom-scroll" style={{ height: 'calc(100vh - 160px)' }}>
                <div className="mb-5">
                    <h2 className="display-6 fw-bold text-slate">{selectedJob.title}</h2>
                    <p className="fs-5 text-indigo fw-medium">{selectedJob.company}</p>
                    <div className="d-flex gap-4 mt-4 text-muted small">
                        <span className="d-flex align-items-center"><Layers size={14} className="me-2"/> {selectedJob.location || 'Remote'}</span>
                        <span className="d-flex align-items-center fw-bold text-success">💰 {selectedJob.salary || 'Competitive'}</span>
                    </div>
                </div>

                <div className="description-content-pro" dangerouslySetInnerHTML={{ __html: selectedJob.description || "" }} />
              </div>

              <div className="p-4 border-top bg-white d-flex gap-2">
                <a href={selectedJob.applyLink} target="_blank" rel="noreferrer" className="btn btn-indigo w-100 py-3 fw-bold shadow">
                  Submit via Company Website <ArrowUpRight size={18} className="ms-2"/>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        :root {
          --indigo: #4f46e5;
          --slate: #0f172a;
          --gray-light: #f8fafc;
        }

        .job-explorer-v4 { font-family: 'Inter', sans-serif; }

        /* Search Bar */
        .pro-input {
          border: 1px solid #e2e8f0 !important;
          border-radius: 12px;
          padding: 12px 15px;
          transition: 0.2s;
        }
        .pro-input:focus {
          border-color: var(--indigo) !important;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1) !important;
        }
        .search-icon-left {
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-50%);
          z-index: 10;
        }

        /* Selection Bar */
        .selection-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 100%;
          background: var(--slate);
          z-index: 1000;
        }
        .count-badge {
          background: var(--indigo);
          color: white;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-weight: bold;
          font-size: 14px;
        }

        /* Pro Cards */
        .pro-job-card {
          background: white;
          border: 1px solid #e2e8f0;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .pro-job-card:hover {
          border-color: var(--indigo);
          box-shadow: 0 12px 25px -5px rgba(0, 0, 0, 0.05);
          transform: translateY(-4px);
        }
        .pro-job-card.selected {
          border-color: var(--indigo);
          background-color: #f5f3ff;
        }

        .job-title { color: var(--slate); font-weight: 700; letter-spacing: -0.02em; }
        .company-subtitle { color: var(--indigo); font-weight: 600; font-size: 0.9rem; }

        .match-pill {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
        }
        .match-high { background: #dcfce7; color: #15803d; }
        .match-med { background: #fef9c3; color: #854d0e; }

        .skill-chip-pro {
          background: var(--gray-light);
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid #f1f5f9;
        }

        /* Buttons */
        .btn-indigo { background: var(--indigo); color: white; border: none; transition: 0.3s; }
        .btn-indigo:hover { background: #4338ca; transform: translateY(-1px); color: white; }
        .btn-dark-pro { background: var(--slate); color: white; border: none; }
        .btn-details { background: none; border: none; color: #64748b; font-weight: 600; font-size: 0.85rem; padding: 0; }
        .btn-details:hover { color: var(--indigo); }

        /* Checkbox Replacement */
        .unselected-circle {
          width: 22px;
          height: 22px;
          border: 2px solid #cbd5e1;
          border-radius: 50%;
        }

        /* Side Panel */
        .side-panel-pro {
          position: fixed;
          right: 0;
          top: 0;
          width: 500px;
          height: 100%;
          z-index: 1100;
        }
        .panel-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          z-index: 1090;
        }
        .btn-close-pro {
          background: none;
          border: none;
          color: #94a3b8;
          transition: 0.2s;
        }
        .btn-close-pro:hover { color: var(--slate); }

        .description-content-pro {
          color: #334155;
          line-height: 1.8;
        }
        .description-content-pro h3, .description-content-pro h4 { font-weight: 700; margin-top: 2rem; color: var(--slate); }

        /* Skeleton */
        .skeleton-pro { overflow: hidden; position: relative; }
        .skeleton-line { height: 12px; background: #f1f5f9; border-radius: 4px; margin-bottom: 10px; }
        .skeleton-circle { width: 40px; height: 40px; background: #f1f5f9; border-radius: 8px; }
      `}</style>
    </div>
  );
};

export default JobList;