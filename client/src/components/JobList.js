import React, { useEffect, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Spinner } from "react-bootstrap";
import { Search, Briefcase, Code, ExternalLink, ChevronRight } from "lucide-react";

const JobList = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [search, setSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState("");

  const fetchJobs = async () => {
    try {
      const res = await axios.get("http://localhost:6900/api/jobs");
      setJobs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  const filteredJobs = jobs.filter(job => 
    (job.title.toLowerCase().includes(search.toLowerCase()) || job.company.toLowerCase().includes(search.toLowerCase())) &&
    (skillFilter === "" || job.skills?.some(s => s.toLowerCase().includes(skillFilter.toLowerCase())))
  );

  if (loading) return (
    <div className="d-flex justify-content-center p-5">
      <Spinner animation="border" variant="dark" size="sm" />
    </div>
  );

  return (
    <div className="job-explorer-v3">
      {/* --- GLASS SEARCH PANEL --- */}
      <div className="mb-5 glass-card p-2 rounded-4 shadow-sm border border-white">
        <div className="row g-0">
          <div className="col-md-6 border-end border-white-50">
            <div className="input-group p-2">
              <span className="input-group-text bg-transparent border-0"><Search size={18} className="text-primary"/></span>
              <input 
                type="text" 
                className="form-control border-0 shadow-none bg-transparent" 
                placeholder="Search roles..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
              />
            </div>
          </div>
          <div className="col-md-6">
            <div className="input-group p-2">
              <span className="input-group-text bg-transparent border-0"><Code size={18} className="text-primary"/></span>
              <input 
                type="text" 
                className="form-control border-0 shadow-none bg-transparent" 
                placeholder="Filter by skill..." 
                value={skillFilter} 
                onChange={(e) => setSkillFilter(e.target.value)} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* --- GRID --- */}
      <div className="row g-4">
        {filteredJobs.map((job) => (
          <motion.div layout key={job.id} className="col-12 col-xl-6">
            <div className="glass-job-card p-4 rounded-4 shadow-sm border border-white transition-all">
              <div className="d-flex justify-content-between align-items-start">
                <div className="d-flex gap-3">
                  <div className="bg-white rounded-3 shadow-sm d-flex align-items-center justify-content-center" style={{ width: '50px', height: '50px' }}>
                    <Briefcase size={22} className="text-primary" />
                  </div>
                  <div>
                    <h5 className="fw-bold text-dark mb-0">{job.title}</h5>
                    <p className="text-muted small mb-3">{job.company} • {job.location}</p>
                    <div className="d-flex flex-wrap gap-2">
                      {job.skills?.slice(0, 3).map((skill, i) => (
                        <span key={i} className="pro-pill">{skill}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="text-end">
                  <span className="badge bg-white text-dark border rounded-pill px-2 py-1 mb-2 d-inline-block small fw-bold">
                    {job.source}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-top border-white-50 d-flex justify-content-between align-items-center">
                <button className="btn btn-link text-primary fw-bold text-decoration-none p-0 small" onClick={() => setSelectedJob(job)}>
                  View Description <ChevronRight size={14} />
                </button>
                <button className="btn btn-primary rounded-3 px-4 fw-bold shadow-sm">
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* --- MODAL --- */}
      <AnimatePresence>
        {selectedJob && (
          <div className="modal show d-block" style={{ zIndex: 1060 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="panel-overlay" onClick={() => setSelectedJob(null)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="side-panel bg-white shadow-2xl">
              <div className="p-4 border-bottom d-flex justify-content-between align-items-center">
                <h5 className="fw-bold mb-0">Opportunity Details</h5>
                <button className="btn-close" onClick={() => setSelectedJob(null)}></button>
              </div>
              <div className="p-4 overflow-auto" style={{ height: 'calc(100vh - 160px)' }}>
                <h2 className="fw-bold">{selectedJob.title}</h2>
                <p className="text-primary fw-semibold fs-5 mb-4">{selectedJob.company}</p>
                <div className="description-content" dangerouslySetInnerHTML={{ __html: selectedJob.description }} />
              </div>
              <div className="p-4 border-top bg-light">
                <a href={selectedJob.applyLink} target="_blank" rel="noreferrer" className="btn btn-primary w-100 py-3 fw-bold">
                  Start Application <ExternalLink size={16} className="ms-2"/>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .glass-job-card {
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .glass-job-card:hover {
          background: rgba(255, 255, 255, 0.9);
          transform: translateY(-3px);
        }
        .pro-pill {
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(0,0,0,0.05);
          font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px;
        }
        .side-panel { position: fixed; top: 0; right: 0; width: 100%; max-width: 500px; height: 100vh; z-index: 1070; }
        .panel-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.3); backdrop-filter: blur(4px); }
        .text-primary { color: #4f46e5 !important; }
        .btn-primary { background: #4f46e5; border: none; }
      `}</style>
    </div>
  );
};

export default JobList;