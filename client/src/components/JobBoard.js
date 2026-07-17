import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MapPin, Briefcase, Zap, ArrowUpRight, X, Building2,
  Sparkles, DollarSign, CheckCircle2, Clock,
  Filter, ShieldCheck, Flame, ChevronRight,
} from "lucide-react";
import { jobService, automationService } from "../services/api";

const EXPERIENCE_LEVELS = ["Any", "Internship", "Graduate", "Entry", "Junior", "Mid", "Senior"];

// ─────────────────────────────────────────────
// JOB CARD
// ─────────────────────────────────────────────
const JobCard = ({ job, onOpen, selected, onToggle }) => {
  const match = job.atsScore != null ? job.atsScore : job.matchScore != null ? job.matchScore : job.qualityScore || 0;
  const matchLabel = job.atsScore != null ? "Match" : job.matchScore != null ? "Match" : "Quality";
  const matchColor = match >= 90 ? "#16a34a" : match >= 70 ? "#f97316" : match >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className={`jb-card ${selected ? "jb-card-selected" : ""}`}>
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div className="d-flex gap-2 align-items-center">
          <button
            className="jb-select-btn"
            onClick={() => onToggle && onToggle(job)}
            aria-label="Select job"
          >
            {selected ? <CheckCircle2 size={20} className="text-indigo" /> : <span className="jb-select-circle" />}
          </button>
          <div className="jb-logo">{String(job.company || "?").charAt(0).toUpperCase()}</div>
          <div>
            <div className="jb-title">{job.title}</div>
            <div className="jb-company">{job.company}</div>
          </div>
        </div>
        <div className="jb-match" style={{ color: matchColor, borderColor: matchColor }}>
          <Zap size={11} className="me-1" />
          {match}% {matchLabel}
        </div>
      </div>

      <div className="jb-meta mb-2">
        <span className="jb-chip"><MapPin size={11} className="me-1" />{job.location || "Remote"}</span>
        <span className="jb-chip"><Building2 size={11} className="me-1" />{job.source}</span>
        {job.salary && job.salary !== "Not specified" && (
          <span className="jb-chip jb-chip-salary"><DollarSign size={11} className="me-1" />{job.salary}</span>
        )}
      </div>

      <div className="jb-badges mb-3">
        {job.remote && <span className="jb-badge jb-badge-remote">🌐 Remote</span>}
        {job.visaSponsorship && <span className="jb-badge jb-badge-visa"><ShieldCheck size={11} className="me-1" />Visa</span>}
        {job.easyApply && <span className="jb-badge jb-badge-easy"><CheckCircle2 size={11} className="me-1" />Easy Apply</span>}
        {job.hiringNow && <span className="jb-badge jb-badge-now"><Clock size={11} className="me-1" />Hiring Now</span>}
        {job.experienceLevel && job.experienceLevel !== "Any" && (
          <span className="jb-badge jb-badge-exp">{job.experienceLevel}</span>
        )}
      </div>

      <div className="d-flex justify-content-between align-items-center pt-2 border-top">
        <button className="jb-details" onClick={() => onOpen(job)}>
          Details <ChevronRight size={13} className="ms-1" />
        </button>
        <a href={job.applyLink} target="_blank" rel="noreferrer" className="jb-apply">
          Apply <ArrowUpRight size={13} className="ms-1" />
        </a>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// SECTION CAROUSEL
// ─────────────────────────────────────────────
const SectionRow = ({ section, onOpen, selectedMap, onToggle }) => {
  const ref = useRef(null);
  const scroll = (dir) => {
    if (ref.current) ref.current.scrollBy({ left: dir * 320, behavior: "smooth" });
  };
  return (
    <div className="jb-section mb-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="jb-section-title mb-0">{section.title}</h4>
          <small className="text-muted">{section.subtitle} · {section.count} roles</small>
        </div>
        <div className="d-none d-md-flex gap-1">
          <button className="jb-carousel-btn" onClick={() => scroll(-1)}><ChevronRight size={16} style={{ transform: "rotate(180deg)" }} /></button>
          <button className="jb-carousel-btn" onClick={() => scroll(1)}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="jb-carousel" ref={ref}>
        {section.jobs.map((job, i) => (
          <div className="jb-carousel-item" key={`${job.id || job.externalId || job.applyLink}-${i}`}>
            <JobCard
              job={job}
              onOpen={onOpen}
              selected={!!selectedMap[job.id || job.externalId || job.applyLink]}
              onToggle={onToggle}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN BOARD
// ─────────────────────────────────────────────
const JobBoard = () => {
  const [sections, setSections] = useState(null);
  const [recommended, setRecommended] = useState([]);
  const [feed, setFeed] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sourcesCount, setSourcesCount] = useState(0);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState({});
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  const jobKey = (j) => j.id || j.externalId || j.applyLink;
  const toggleSelect = (job) =>
    setSelected((prev) => {
      const k = jobKey(job);
      const next = { ...prev };
      if (next[k]) delete next[k];
      else next[k] = job;
      return next;
    });

  const handleAutoApply = async (dryRun = false) => {
    const jobs = Object.values(selected);
    if (!jobs.length) return;
    setApplying(true);
    try {
      const summary = await automationService.applyToJobs(jobs, dryRun);
      setApplyResult(summary);
      setSelected({});
    } catch (e) {
      setApplyResult({ error: e.message, jobs: [] });
    } finally {
      setApplying(false);
    }
  };

  const [filters, setFilters] = useState({
    query: "", country: "", company: "", role: "", techStack: "",
    experienceLevel: "", remote: false, visaSponsorship: false, salary: "",
  });
  const [applied, setApplied] = useState({});

  const isFiltering = useCallback(
    () => Object.values(applied).some((v) => (Array.isArray(v) ? v.length : v)),
    [applied]
  );

  // Load curated sections (auth) + sources once
  useEffect(() => {
    jobService.getSources().then((d) => setSourcesCount(d.total || 0)).catch(() => {});
    jobService.getSections()
      .then((d) => { setSections(d.sections || []); setRecommended(d.recommended || []); })
      .catch(() => { setSections([]); setRecommended([]); });
  }, []);

  // Load / reload feed
  const loadFeed = useCallback(async (pageNum, currentFilters, replace) => {
    setLoading(true);
    try {
      const params = {
        page: pageNum,
        limit: 24,
        ...currentFilters,
        remote: currentFilters.remote || undefined,
        visaSponsorship: currentFilters.visaSponsorship || undefined,
      };
      const data = await jobService.searchJobs(params);
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];
      setFeed((prev) => (replace ? jobs : [...prev, ...jobs]));
      setHasMore(!!data.hasMore);
    } catch (e) {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    loadFeed(1, applied, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  const runSearch = (e) => {
    e.preventDefault();
    setApplied({ ...filters });
  };

  const resetFilters = () => {
    setFilters({ query: "", country: "", company: "", role: "", techStack: "", experienceLevel: "", remote: false, visaSponsorship: false, salary: "" });
    setApplied({});
  };

  // Infinite scroll
  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400 && hasMore && !loading) {
        const next = page + 1;
        setPage(next);
        loadFeed(next, applied, false);
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasMore, loading, page, applied, loadFeed]);

  const update = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setFilters((f) => ({ ...f, [k]: v }));
  };

  return (
    <div className="jb-wrap">
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h3 className="fw-bold mb-0 d-flex align-items-center gap-2">
            <Sparkles size={22} className="text-gradient-sunset" /> Job Discovery
          </h3>
          <small className="text-muted">
            Aggregating <strong>{sourcesCount}</strong> trusted sources · Remote &amp; entry-level first
          </small>
        </div>
        <button className="btn btn-outline-secondary btn-sm rounded-pill" onClick={() => setShowFilters((s) => !s)}>
          <Filter size={14} className="me-1" /> Filters
        </button>
      </div>

      {/* Filter bar */}
      <AnimatePresence>
        {showFilters && (
          <motion.form
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            onSubmit={runSearch} className="jb-filters glass-card p-3 mb-4"
          >
            <div className="row g-2">
              <div className="col-12 col-md-3">
                <input className="form-control jb-input" placeholder="Role / keyword" value={filters.query} onChange={update("query")} />
              </div>
              <div className="col-6 col-md-2">
                <input className="form-control jb-input" placeholder="Country" value={filters.country} onChange={update("country")} />
              </div>
              <div className="col-6 col-md-2">
                <input className="form-control jb-input" placeholder="Company" value={filters.company} onChange={update("company")} />
              </div>
              <div className="col-6 col-md-2">
                <input className="form-control jb-input" placeholder="Tech stack (React, Python)" value={filters.techStack} onChange={update("techStack")} />
              </div>
              <div className="col-6 col-md-2">
                <select className="form-select jb-input" value={filters.experienceLevel} onChange={update("experienceLevel")}>
                  {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l === "Any" ? "" : l}>{l}</option>)}
                </select>
              </div>
              <div className="col-12 col-md-1 d-flex align-items-end gap-3">
                <label className="jb-check"><input type="checkbox" checked={filters.remote} onChange={update("remote")} /> Remote</label>
                <label className="jb-check"><input type="checkbox" checked={filters.visaSponsorship} onChange={update("visaSponsorship")} /> Visa</label>
              </div>
            </div>
            <div className="d-flex gap-2 mt-2">
              <button type="submit" className="btn btn-gradient-orange btn-sm rounded-pill px-4 fw-bold">
                <Search size={14} className="me-1" /> Search
              </button>
              <button type="button" className="btn btn-light btn-sm rounded-pill" onClick={resetFilters}>Reset</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Recommended For You */}
      {!isFiltering() && recommended.length > 0 && (
        <div className="jb-section mb-4">
          <div className="d-flex align-items-center gap-2 mb-3">
            <Flame size={20} className="text-danger" />
            <h4 className="fw-bold mb-0">Recommended For You</h4>
            <span className="badge rounded-pill" style={{ background: "#fff7ed", color: "#c2410c" }}>
              ≥ {Math.min(...recommended.map((j) => j.atsScore ?? j.matchScore ?? j.qualityScore ?? 0))}% match
            </span>
          </div>
          <div className="row g-3">
            {recommended.slice(0, 8).map((job, i) => (
              <div className="col-12 col-xl-6" key={`rec-${job.id || job.externalId || job.applyLink}-${i}`}>
                <JobCard
                  job={job}
                  onOpen={setSelectedJob}
                  selected={!!selected[jobKey(job)]}
                  onToggle={toggleSelect}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Curated sections */}
      {!isFiltering() && sections && sections.map((s) => (
        <SectionRow key={s.id} section={s} onOpen={setSelectedJob} selectedMap={selected} onToggle={toggleSelect} />
      ))}

      {/* Filtered feed header */}
      {isFiltering() && (
        <div className="d-flex align-items-center gap-2 mb-3">
          <Search size={18} className="text-primary" />
          <h4 className="fw-bold mb-0">Search Results</h4>
          <span className="badge rounded-pill bg-light text-muted">{feed.length} found</span>
        </div>
      )}

      {/* Infinite feed */}
      <div className="row g-3">
        {feed.map((job, i) => (
          <div className="col-12 col-xl-6" key={`feed-${job.id || job.externalId || job.applyLink}-${i}`}>
            <JobCard
              job={job}
              onOpen={setSelectedJob}
              selected={!!selected[jobKey(job)]}
              onToggle={toggleSelect}
            />
          </div>
        ))}
        {loading && [...Array(4)].map((_, i) => (
          <div className="col-12 col-xl-6" key={`sk-${i}`}>
            <div className="jb-card jb-skeleton"><div className="jb-skeleton-line w-75" /><div className="jb-skeleton-line w-50" /></div>
          </div>
        ))}
        {!loading && feed.length === 0 && (
          <div className="col-12 text-center text-muted py-5">No jobs matched your filters yet. Try broadening your search.</div>
        )}
      </div>

      {/* Selection action bar */}
      <AnimatePresence>
        {Object.keys(selected).length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="jb-selection-bar shadow-lg"
          >
            <div className="container d-flex justify-content-between align-items-center py-3">
              <div className="d-flex align-items-center gap-3">
                <div className="jb-count-badge">{Object.keys(selected).length}</div>
                <span className="fw-bold text-white mb-0">jobs selected</span>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-light btn-sm px-3" onClick={() => setSelected({})}>Clear</button>
                <button className="btn btn-light btn-sm px-3 fw-bold" disabled={applying} onClick={() => handleAutoApply(true)}>
                  Dry Run
                </button>
                <button className="btn btn-indigo px-4 fw-bold" disabled={applying} onClick={() => handleAutoApply(false)}>
                  {applying ? "Applying…" : "Auto-Apply via HirePilot"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto-apply result modal */}
      <AnimatePresence>
        {applyResult && (
          <motion.div className="modal show d-block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="jb-result-overlay" onClick={() => setApplyResult(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="jb-result-modal glass-card p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="fw-bold mb-0">Auto-Apply Summary</h4>
                <button className="btn-close-pro" onClick={() => setApplyResult(null)}><X size={20} /></button>
              </div>
              {applyResult.error ? (
                <div className="alert alert-danger py-2 small">{applyResult.error}</div>
              ) : (
                <>
                  <div className="row g-2 mb-3">
                    <div className="col-4">
                      <div className="jb-stat"><div className="jb-stat-num text-success">{applyResult.applied || 0}</div><small>Applied</small></div>
                    </div>
                    <div className="col-4">
                      <div className="jb-stat"><div className="jb-stat-num text-warning">{applyResult.skipped || 0}</div><small>Skipped</small></div>
                    </div>
                    <div className="col-4">
                      <div className="jb-stat"><div className="jb-stat-num">{applyResult.eligible || 0}</div><small>Eligible</small></div>
                    </div>
                  </div>
                  {applyResult.jobs?.length > 0 && (
                    <div className="jb-result-list">
                      {applyResult.jobs.map((j, i) => (
                        <div key={i} className="d-flex justify-content-between align-items-center py-2 border-top small">
                          <span className="fw-semibold text-truncate me-2">{j.title} · {j.company}</span>
                          <span className={j.status === "Applied" ? "text-success" : (j.status || "").includes("Skipped") ? "text-warning" : "text-muted"}>
                            {j.status}{j.ats != null ? ` · ${j.ats}%` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="btn btn-gradient-orange w-100 mt-3 rounded-pill fw-bold" onClick={() => setApplyResult(null)}>
                    Done
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side panel */}
      <AnimatePresence>
        {selectedJob && (
          <div className="modal show d-block overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="panel-overlay" onClick={() => setSelectedJob(null)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="jb-panel bg-white shadow-2xl">
              <div className="p-4 border-bottom d-flex justify-content-between align-items-center bg-light-subtle">
                <div className="d-flex align-items-center gap-2">
                  <Briefcase size={18} className="text-indigo" />
                  <span className="fw-bold text-uppercase small tracking-widest text-muted">Role Details</span>
                </div>
                <button className="btn-close-pro" onClick={() => setSelectedJob(null)}><X size={20} /></button>
              </div>
              <div className="p-5 overflow-auto custom-scroll" style={{ height: "calc(100vh - 160px)" }}>
                <h2 className="display-6 fw-bold">{selectedJob.title}</h2>
                <p className="fs-5" style={{ color: "#4f46e5", fontWeight: 600 }}>{selectedJob.company}</p>
                <div className="d-flex gap-4 mt-3 text-muted small flex-wrap">
                  <span className="d-flex align-items-center"><MapPin size={14} className="me-1" /> {selectedJob.location || "Remote"}</span>
                  <span className="d-flex align-items-center"><Building2 size={14} className="me-1" /> {selectedJob.source}</span>
                  {selectedJob.salary && selectedJob.salary !== "Not specified" && (
                    <span className="d-flex align-items-center fw-bold text-success"><DollarSign size={14} className="me-1" /> {selectedJob.salary}</span>
                  )}
                </div>
                <div className="jb-badges my-3">
                  {selectedJob.remote && <span className="jb-badge jb-badge-remote">🌐 Remote</span>}
                  {selectedJob.visaSponsorship && <span className="jb-badge jb-badge-visa">Visa Sponsorship</span>}
                  {selectedJob.easyApply && <span className="jb-badge jb-badge-easy">Easy Apply</span>}
                  {selectedJob.hiringNow && <span className="jb-badge jb-badge-now">Hiring Now</span>}
                </div>
                <div className="jb-desc" dangerouslySetInnerHTML={{ __html: selectedJob.description || "" }} />
              </div>
              <div className="p-4 border-top bg-white d-flex gap-2">
                <a href={selectedJob.applyLink} target="_blank" rel="noreferrer" className="btn btn-gradient-orange w-100 py-3 fw-bold shadow">
                  Apply via {selectedJob.source} <ArrowUpRight size={18} className="ms-2" />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .jb-wrap { font-family: 'Inter', sans-serif; }
        .text-indigo { color:#4f46e5; }
        .btn-indigo { background:#4f46e5; color:#fff; border:none; transition:.3s; }
        .btn-indigo:hover { background:#4338ca; color:#fff; }
        .btn-indigo:disabled { opacity:.6; }
        .jb-card.jb-card-selected { border-color:#4f46e5; background:#f5f3ff; }
        .jb-select-btn { background:none; border:none; padding:0; display:flex; align-items:center; }
        .jb-select-circle { width:20px; height:20px; border:2px solid #cbd5e1; border-radius:50%; display:inline-block; }
        .jb-selection-bar { position:fixed; bottom:0; left:0; width:100%; background:#0f172a; z-index:1200; }
        .jb-count-badge { background:#4f46e5; color:#fff; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-weight:bold; font-size:14px; }
        .jb-result-overlay { position:fixed; inset:0; background:rgba(15,23,42,.5); backdrop-filter:blur(4px); z-index:1290; }
        .jb-result-modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:480px; max-width:94vw; z-index:1300; max-height:86vh; overflow:auto; }
        .jb-stat { background:#f8fafc; border:1px solid #f1f5f9; border-radius:12px; padding:.75rem; text-align:center; }
        .jb-stat-num { font-size:1.5rem; font-weight:800; color:#0f172a; }
        .jb-result-list { max-height:40vh; overflow:auto; }
        .jb-card {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 1rem;
          padding: 1.1rem 1.25rem; height: 100%; display: flex; flex-direction: column;
          transition: all .2s ease;
        }
        .jb-card:hover { border-color: #f97316; box-shadow: 0 12px 25px -8px rgba(249,115,22,.18); transform: translateY(-3px); }
        .jb-logo {
          width: 40px; height: 40px; border-radius: 10px; flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg,#2563eb,#4f46e5); color:#fff; font-weight:800;
        }
        .jb-title { font-weight: 700; color:#0f172a; letter-spacing:-.02em; line-height:1.2; }
        .jb-company { color:#4f46e5; font-weight:600; font-size:.85rem; }
        .jb-match {
          display:flex; align-items:center; font-size:.72rem; font-weight:800;
          padding:3px 9px; border:1.5px solid; border-radius:20px; white-space:nowrap;
        }
        .jb-meta { display:flex; gap:.4rem; flex-wrap:wrap; }
        .jb-chip {
          display:flex; align-items:center; font-size:.72rem; color:#475569;
          background:#f8fafc; border:1px solid #f1f5f9; padding:3px 8px; border-radius:7px;
        }
        .jb-chip-salary { color:#15803d; font-weight:700; }
        .jb-badges { display:flex; gap:.35rem; flex-wrap:wrap; }
        .jb-badge {
          display:flex; align-items:center; font-size:.68rem; font-weight:700;
          padding:2px 8px; border-radius:6px; background:#f1f5f9; color:#475569;
        }
        .jb-badge-remote { background:#eff6ff; color:#1d4ed8; }
        .jb-badge-visa { background:#f0fdf4; color:#15803d; }
        .jb-badge-easy { background:#fff7ed; color:#c2410c; }
        .jb-badge-now { background:#ecfeff; color:#0e7490; }
        .jb-badge-exp { background:#faf5ff; color:#7e22ce; }
        .jb-details { background:none; border:none; color:#64748b; font-weight:600; font-size:.82rem; padding:0; }
        .jb-details:hover { color:#4f46e5; }
        .jb-apply {
          display:flex; align-items:center; background:#0f172a; color:#fff; border:none;
          border-radius:999px; padding:.35rem 1rem; font-size:.82rem; font-weight:600; text-decoration:none;
        }
        .jb-apply:hover { background:#1e293b; color:#fff; }
        .jb-section-title { font-weight:800; letter-spacing:-.02em; color:#0f172a; }
        .jb-carousel {
          display:flex; gap:1rem; overflow-x:auto; padding-bottom:.5rem; scroll-snap-type:x mandatory;
        }
        .jb-carousel::-webkit-scrollbar { height:6px; }
        .jb-carousel::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:6px; }
        .jb-carousel-item { flex:0 0 340px; max-width:340px; scroll-snap-align:start; }
        .jb-carousel-btn {
          width:34px; height:34px; border-radius:50%; border:1px solid #e2e8f0;
          background:#fff; color:#475569; display:flex; align-items:center; justify-content:center;
        }
        .jb-carousel-btn:hover { border-color:#f97316; color:#f97316; }
        .jb-filters { border-radius:1rem; }
        .jb-input { border:1px solid #e2e8f0 !important; border-radius:10px; font-size:.85rem; }
        .jb-input:focus { border-color:#f97316 !important; box-shadow:0 0 0 3px rgba(249,115,22,.12) !important; }
        .jb-check { font-size:.75rem; color:#475569; display:flex; align-items:center; gap:.25rem; margin:0; }
        .jb-panel { position:fixed; right:0; top:0; width:520px; max-width:100%; height:100%; z-index:1100; }
        .panel-overlay { position:fixed; inset:0; background:rgba(15,23,42,.4); backdrop-filter:blur(4px); z-index:1090; }
        .btn-close-pro { background:none; border:none; color:#94a3b8; }
        .btn-close-pro:hover { color:#0f172a; }
        .jb-desc { color:#334155; line-height:1.8; font-size:.9rem; }
        .jb-desc h3,.jb-desc h4 { font-weight:700; margin-top:1.5rem; color:#0f172a; }
        .jb-skeleton { min-height:150px; position:relative; overflow:hidden; }
        .jb-skeleton-line { height:12px; background:#f1f5f9; border-radius:4px; margin-bottom:10px; }
        @media (max-width:768px){ .jb-carousel-item { flex-basis:85vw; max-width:85vw; } .jb-panel{ width:100%; } }
      `}</style>
    </div>
  );
};

export default JobBoard;
