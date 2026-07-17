import { useEffect, useState } from "react";
import {
  applicationService,
} from "../services/api";
import {
  Briefcase,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  Info,
  Zap,
  FileText,
  Send,
  Trash2,
  RefreshCw,
} from "lucide-react";

const STATUS_CONFIG = {
  Scraped: { bg: "#f3f4f6", text: "#6b7280", icon: <Info size={14} />, label: "Scraped" },
  Tailored: { bg: "#dbeafe", text: "#2563eb", icon: <FileText size={14} />, label: "Tailored" },
  Applied: { bg: "#dcfce7", text: "#15803d", icon: <Send size={14} />, label: "Applied" },
  Interviewing: { bg: "#fef3c7", text: "#d97706", icon: <Zap size={14} />, label: "Interviewing" },
  Offered: { bg: "#d1fae5", text: "#059669", icon: <CheckCircle size={14} />, label: "Offered" },
  Rejected: { bg: "#fee2e2", text: "#dc2626", icon: <XCircle size={14} />, label: "Rejected" },
};

const ApplicationList = () => {
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const [appsData, statsData] = await Promise.all([
        applicationService.getAll(statusFilter),
        applicationService.getStats(),
      ]);
      setApplications(appsData);
      setStats(statsData);
    } catch (err) {
      console.error("Error fetching applications:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const updateStatus = async (id, newStatus) => {
    try {
      await applicationService.updateStatus(
        id,
        newStatus,
        `Status updated to ${newStatus}`
      );
      fetchApplications();
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const deleteApplication = async (id) => {
    if (!window.confirm("Delete this application?")) return;
    try {
      await applicationService.delete(id);
      fetchApplications();
    } catch (err) {
      console.error("Error deleting application:", err);
    }
  };

  const handleTailor = async (id) => {
    try {
      await applicationService.tailor(id);
      fetchApplications();
    } catch (err) {
      console.error("Error tailoring:", err);
    }
  };

  const getStatusStyle = (status) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.Scraped;
  };

  if (loading && applications.length === 0) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    );
  }

  return (
    <div className="container py-5">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-3">
          <div className="bg-dark p-3 rounded-4 shadow-sm text-white">
            <Briefcase size={28} />
          </div>
          <div>
            <h2 className="fw-bold mb-0">Pipeline Tracker</h2>
            <p className="text-muted mb-0">
              Track your job applications from scrape to offer
            </p>
          </div>
        </div>
        <button
          className="btn btn-outline-primary rounded-pill px-3"
          onClick={fetchApplications}
        >
          <RefreshCw size={16} className="me-1" /> Refresh
        </button>
      </div>

      {/* Pipeline Stats */}
      {stats && (
        <div className="row g-2 mb-4">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} className="col-4 col-md-2">
              <div
                className="card border-0 rounded-3 text-center p-2"
                style={{ backgroundColor: cfg.bg }}
              >
                <div className="fw-bold fs-5" style={{ color: cfg.text }}>
                  {stats[key] || 0}
                </div>
                <small className="text-muted">{cfg.label}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="alert alert-danger py-2 small">{error}</div>
      )}

      {/* Filter Tabs */}
      <div className="d-flex gap-2 mb-4 flex-wrap">
        <button
          className={`btn btn-sm rounded-pill ${
            statusFilter === "" ? "btn-dark" : "btn-outline-dark"
          }`}
          onClick={() => setStatusFilter("")}
        >
          All
        </button>
        {Object.keys(STATUS_CONFIG).map((key) => (
          <button
            key={key}
            className={`btn btn-sm rounded-pill ${
              statusFilter === key ? "btn-dark" : "btn-outline-dark"
            }`}
            onClick={() => setStatusFilter(key)}
          >
            {STATUS_CONFIG[key].label}
          </button>
        ))}
      </div>

      {/* Applications Grid */}
      <div className="row g-4">
        {applications.length === 0 ? (
          <div className="col-12 text-center py-5 bg-white rounded-4 border shadow-sm">
            <p className="text-muted fs-5">
              {statusFilter
                ? `No ${STATUS_CONFIG[statusFilter]?.label} applications yet.`
                : "No applications tracked yet. Start applying!"}
            </p>
          </div>
        ) : (
          applications.map((app) => {
            const style = getStatusStyle(app.status);
            return (
              <div key={app._id} className="col-md-6 col-lg-4">
                <div className="bg-white p-4 rounded-4 border shadow-sm h-100 d-flex flex-column transition-all hover-up overflow-hidden">
                  {/* Card Content */}
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start mb-3 gap-2">
                      <div className="min-width-0">
                        <h5 className="fw-bold text-dark mb-1 text-truncate">
                          {app.jobTitle}
                        </h5>
                        <p className="text-primary fw-semibold mb-2">
                          {app.company}
                        </p>
                      </div>
                      <div
                        className="badge rounded-pill px-3 py-2 d-flex align-items-center gap-1 flex-shrink-0"
                        style={{
                          backgroundColor: style.bg,
                          color: style.text,
                          fontSize: "11px",
                        }}
                      >
                        {style.icon} {style.label}
                      </div>
                    </div>

                    <div className="small text-muted mb-2">
                      <div className="d-flex align-items-center mb-1">
                        <MapPin size={14} className="me-2" />{" "}
                        {app.location || "Remote"}
                      </div>
                      <div className="d-flex align-items-center mb-1">
                        <Clock size={14} className="me-2" /> Source: {app.source}
                      </div>
                      {app.matchRate && (
                        <div className="d-flex align-items-center">
                          <Zap size={14} className="me-2" /> Match:{" "}
                          <span
                            className={`fw-bold ms-1 ${
                              app.matchRate >= 90
                                ? "text-success"
                                : app.matchRate >= 70
                                ? "text-warning"
                                : "text-danger"
                            }`}
                          >
                            {app.matchRate}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* History Summary */}
                    {app.history && app.history.length > 0 && (
                      <div className="small text-muted mt-2 pt-2 border-top">
                        <div className="fw-semibold mb-1">Timeline:</div>
                        {app.history.slice(-3).map((h, i) => (
                          <div key={i} className="d-flex align-items-center gap-1">
                            <div
                              className="rounded-circle"
                              style={{
                                width: 6,
                                height: 6,
                                backgroundColor:
                                  STATUS_CONFIG[h.status]?.text || "#6b7280",
                              }}
                            />
                            <span>
                              {STATUS_CONFIG[h.status]?.label || h.status}
                              {h.note && ` - ${h.note.substring(0, 40)}...`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-auto pt-3 border-top d-flex flex-wrap gap-2">
                    {app.status === "Scraped" && (
                      <button
                        onClick={() => handleTailor(app._id)}
                        className="btn btn-outline-primary btn-sm rounded-pill flex-grow-1 fw-bold"
                      >
                        <FileText size={12} className="me-1" /> Tailor
                      </button>
                    )}
                    {app.status === "Tailored" && (
                      <button
                        onClick={() => updateStatus(app._id, "Applied")}
                        className="btn btn-success btn-sm rounded-pill flex-grow-1 fw-bold"
                      >
                        <Send size={12} className="me-1" /> Mark Applied
                      </button>
                    )}
                    {(app.status === "Applied" ||
                      app.status === "Tailored") && (
                      <button
                        onClick={() => updateStatus(app._id, "Interviewing")}
                        className="btn btn-outline-warning btn-sm rounded-pill flex-grow-1 fw-bold"
                      >
                        <Zap size={12} className="me-1" /> Interview
                      </button>
                    )}
                    {app.status === "Interviewing" && (
                      <button
                        onClick={() => updateStatus(app._id, "Offered")}
                        className="btn btn-outline-success btn-sm rounded-pill flex-grow-1 fw-bold"
                      >
                        <CheckCircle size={12} className="me-1" /> Offer
                      </button>
                    )}
                    {app.status !== "Rejected" && app.status !== "Offered" && (
                      <button
                        onClick={() => updateStatus(app._id, "Rejected")}
                        className="btn btn-outline-danger btn-sm rounded-pill flex-grow-1 fw-bold"
                      >
                        <XCircle size={12} className="me-1" /> Reject
                      </button>
                    )}
                    <button
                      onClick={() => deleteApplication(app._id)}
                      className="btn btn-outline-secondary btn-sm rounded-pill"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .hover-up:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.05) !important;
          border-color: #4f46e5 !important;
        }
        .min-width-0 { min-width: 0; }
      `}</style>
    </div>
  );
};

export default ApplicationList;