import { useState } from "react";
import JobForm from "./components/JobForm";
import ResultCard from "./components/ResultCard";
import JobList from "./components/JobList";
import { Layout, Globe, Zap } from "lucide-react";
import "bootstrap/dist/css/bootstrap.min.css";
import ApplicationList from "./components/ApplicationList";
// import JobMatcher from "./components/JobMatcher";
function App() {
  const [result, setResult] = useState(null);

  return (
    // 1. App Container with animated gradient background
    <div className="app-main-container" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* --- NAVBAR --- */}
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom sticky-top py-3 shadow-sm">
        <div className="container">
          <a className="navbar-brand fw-bold fs-4 d-flex align-items-center" href="/">
            <Zap className="me-2 text-primary" fill="currentColor" size={24} />
            Hire<span className="text-dark">Pilot</span>
          </a>
          <div className="ms-auto d-flex align-items-center gap-3">
            <p className="text-muted">AI Powered Job Search</p>
            <button className="btn btn-dark btn-sm rounded-pill px-4 fw-semibold shadow-sm btn-gradient-dark">Dashboard</button>
          </div>
        </div>
      </nav>

   

      {/* --- MAIN CONTENT --- */}
      <main className="container py-5">
        {/* <JobMatcher/> */}
    
        {/* Analysis Results */}
        {result && (
          <div className="mb-5 animate__animated animate__fadeIn">
            <div className="d-flex align-items-center mb-4 p-3 bg-white rounded-4 shadow-sm">
              <div className="bg-primary p-2 rounded-3 me-3 text-white shadow">
                <Layout size={20} />
              </div>
              <h3 className="fw-bold mb-0">Analysis Result</h3>
            </div>
            <ResultCard result={result} />
          </div>
        )}

        {/* Live Job Feed */}
        <section>
          <div className="d-flex align-items-center justify-content-between mb-4 p-3 bg-white rounded-4 shadow-sm">
            <div className="d-flex align-items-center">
              <Globe className="text-primary me-2" size={20} />
              <h3 className="fw-bold mb-0">Active Opportunities</h3>
            </div>
            <div className="badge bg-blue-100 text-primary rounded-pill px-3 py-2 small fw-bold">
              Updated Live
            </div>
          </div>
          
          <JobList />
             {/* --- HERO / ANALYZER SECTION with static gradient --- */}
      <header className="py-5 hero-gradient border-bottom shadow-inner">
        <div className="container text-center">
          <h1 className="display-5 fw-bold text-dark mb-2">
            Optimize Your <span className="text-gradient">Match</span>
          </h1>
          <p className="text-muted fs-5 mb-5 mx-auto" style={{ maxWidth: "600px" }}>
            Upload your resume and target a job description to see your compatibility score instantly.
          </p>
          
          <JobForm setResult={setResult} />
        </div>
      </header>
        </section>
      </main>
    <ApplicationList/>
      <style>{`
        /* 1. Body animated gradient background */
        .app-main-container {
          background: linear-gradient(-45deg, #f8fafc, #eff6ff, #f1f5f9, #f8fafc);
          background-size: 400% 400%;
          animation: gradientBG 15s ease infinite;
          min-height: 100vh;
        }

        @keyframes gradientBG {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        /* 2. Hero static colorful gradient */
        .hero-gradient {
          background: linear-gradient(135deg, #ffffff 0%, #e0f2fe 50%, #ffffff 100%);
        }

        /* 3. Accent text gradient */
        .text-gradient {
          background: linear-gradient(135deg, #2563eb 0%, #a855f7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* Navbar link coloring */
        .text-primary { color: #2563eb !important; }
        .bg-blue-100 { background-color: #dbeafe; }
        
        /* Inner shadow for hero separating navbar */
        .shadow-inner { box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.05); }

        /* Button gradient */
        .btn-gradient-dark {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          border: none;
        }
        .btn-gradient-dark:hover {
          background: linear-gradient(135deg, #0f172a 0%, #000000 100%);
        }
      `}</style>
    </div>
  );
}

export default App;