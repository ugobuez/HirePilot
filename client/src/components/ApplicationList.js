import { useEffect, useState } from "react";
import axios from "axios";
import { Briefcase, MapPin, Clock, CheckCircle, XCircle, Info } from "lucide-react";

const ApplicationList = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchApplications = async () => {
    try {
      const res = await axios.get("https://hirepilot-qskd.onrender.com/api/applications");
      setApplications(res.data);
    } catch (err) {
      console.error("Error fetching applications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApplications(); }, []);

  const updateStatus = async (id, status) => {
    try {
      await axios.put(`https://hirepilot-qskd.onrender.com/api/applications/${id}`, { status });
      fetchApplications();
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case "Interview": return { bg: "#dbeafe", text: "#2563eb", icon: <Info size={14}/> };
      case "Rejected": return { bg: "#fee2e2", text: "#dc2626", icon: <XCircle size={14}/> };
      default: return { bg: "#dcfce7", text: "#15803d", icon: <CheckCircle size={14}/> };
    }
  };

  if (loading) return (
    <div className="container py-5 text-center">
      <div className="spinner-border text-primary" role="status"></div>
    </div>
  );

  return (
    <div className="container py-5">
      <div className="d-flex align-items-center mb-5 gap-3">
        <div className="bg-dark p-3 rounded-4 shadow-sm text-white">
          <Briefcase size={28} />
        </div>
        <div>
          <h2 className="fw-bold mb-0">Application Tracker</h2>
          <p className="text-muted mb-0">Manage and update your active job pursuits</p>
        </div>
      </div>

      <div className="row g-4">
        {applications.length === 0 ? (
          <div className="col-12 text-center py-5 bg-white rounded-4 border shadow-sm">
            <p className="text-muted fs-5">No applications tracked yet. Start applying!</p>
          </div>
        ) : (
          applications.map((app) => {
            const style = getStatusStyle(app.status);
            return (
              <div key={app._id} className="col-md-6 col-lg-4">
                {/* 1. Add "overflow-hidden" and ensure proper flex structure */}
                <div className="bg-white p-4 rounded-4 border shadow-sm h-100 d-flex flex-column transition-all hover-up overflow-hidden">
                  
                  {/* Card Content (grows to push footer down) */}
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start mb-3 gap-2">
                      <div>
                        <h5 className="fw-bold text-dark mb-1">{app.title}</h5>
                        <p className="text-primary fw-semibold mb-2">{app.company}</p>
                      </div>
                      <div 
                        className="badge rounded-pill px-3 py-2 d-flex align-items-center gap-1 flex-shrink-0"
                        style={{ backgroundColor: style.bg, color: style.text, fontSize: '11px' }}
                      >
                        {style.icon} {app.status}
                      </div>
                    </div>

                    <div className="small text-muted mb-4">
                      <div className="d-flex align-items-center mb-2">
                        <MapPin size={14} className="me-2" /> {app.location || "Remote"}
                      </div>
                      <div className="d-flex align-items-center">
                        <Clock size={14} className="me-2" /> Applied on {new Date(app.appliedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* 2. Modified Footer/Button section */}
                  <div className="mt-auto pt-3 border-top d-flex gap-2">
                    <button 
                      onClick={() => updateStatus(app._id, "Interview")}
                      className="btn btn-outline-primary btn-sm rounded-pill flex-grow-1 fw-bold tracking-tight text-nowrap"
                    >
                      Interview
                    </button>
                    <button 
                      onClick={() => updateStatus(app._id, "Rejected")}
                      className="btn btn-outline-danger btn-sm rounded-pill flex-grow-1 fw-bold tracking-tight text-nowrap"
                    >
                      Reject
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
        
        /* 3. Helper classes for tight buttons */
        .tracking-tight { letter-spacing: -0.02em; }
        .text-nowrap { white-space: nowrap; }
      `}</style>
    </div>
  );
};

export default ApplicationList;