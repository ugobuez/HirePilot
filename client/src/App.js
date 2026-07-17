import React, { useState, useEffect, useCallback } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import {
  Search,
  FileText,
  Eye,
  PenTool,
  Sliders,
  Shield,
  CheckCircle,
  XCircle,
  ArrowRight,
  Zap,
  Globe,
  Clock,
  Target,
  Sparkles,
  ChevronRight,
  Play,
  Pause,
  Briefcase,
} from "lucide-react";
import BrandLogo from "./components/BrandLogo";
import LoginForm from "./components/LoginForm";
import OnboardingForm from "./components/OnboardingForm";
import ApplicationList from "./components/ApplicationList";
import JobForm from "./components/JobForm";
import ResultCard from "./components/ResultCard";
import JobBoard from "./components/JobBoard";
import AutomationPanel from "./components/AutomationPanel";
import ResumeIntelligence from "./components/ResumeIntelligence";
import { authService } from "./services/api";

// ============================================
// Progress Ring Component
// ============================================
function ProgressRing({ percentage, size = 120, strokeWidth = 8 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  const color =
    percentage >= 90
      ? "#22c55e"
      : percentage >= 70
      ? "#f97316"
      : percentage >= 50
      ? "#eab308"
      : "#ef4444";

  return (
    <div className="progress-ring-container" style={{ width: size, height: size }}>
      <svg className="progress-ring" width={size} height={size}>
        <circle
          stroke="#e2e8f0"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className="progress-ring-circle"
          stroke={color}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div
        className="position-absolute d-flex flex-column align-items-center"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        <span className="fw-bold" style={{ fontSize: "1.5rem", color }}>
          {percentage}%
        </span>
        <span className="text-muted" style={{ fontSize: "0.65rem" }}>
          Match
        </span>
      </div>
    </div>
  );
}

// ============================================
// Live Console Component
// ============================================
function LiveConsole() {
  const [lines, setLines] = useState([
    { text: "[SCAN] Analyzing job: Senior React Developer at TechCorp", type: "info" },
    { text: "[SCAN] Base match score: 48% — 5 missing keywords detected", type: "info" },
    { text: "[TAILOR] Rewriting resume summary for React/TypeScript alignment...", type: "tailor" },
    { text: "[RE-SCAN] Re-verifying tailored resume... Score: 94% ✅", type: "success" },
    { text: "[STEALTH] Bypassing Cloudflare protection... OK", type: "stealth" },
    { text: "[SUBMIT] Application submitted to LinkedIn successfully!", type: "success" },
  ]);

  return (
    <div className="console-card">
      <div className="console-header">
        <div className="console-dot" style={{ background: "#ef4444" }} />
        <div className="console-dot" style={{ background: "#eab308" }} />
        <div className="console-dot" style={{ background: "#22c55e" }} />
        <span className="ms-2 text-muted" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
          automation-console — live
        </span>
        <span
          className="ms-auto pulse-dot"
          style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }}
        />
      </div>
      <div className="console-body">
        {lines.map((line, i) => (
          <div key={i} className="console-line">
            <span
              style={{
                color:
                  line.type === "success"
                    ? "#16a34a"
                    : line.type === "stealth"
                    ? "#2563eb"
                    : line.type === "tailor"
                    ? "#f97316"
                    : "#64748b",
              }}
            >
              {line.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Honesty Filter Component
// ============================================
function HonestyFilter() {
  const [mode, setMode] = useState("safe");

  return (
    <div>
      <div className="d-flex justify-content-center gap-3 mb-4">
        <button
          className={`btn btn-sm rounded-pill px-4 fw-semibold ${
            mode === "lazy" ? "btn-danger" : "btn-outline-danger"
          }`}
          onClick={() => setMode("lazy")}
        >
          <XCircle size={14} className="me-1" /> Lazy AI
        </button>
        <button
          className={`btn btn-sm rounded-pill px-4 fw-semibold ${
            mode === "safe" ? "btn-success" : "btn-outline-success"
          }`}
          onClick={() => setMode("safe")}
        >
          <CheckCircle size={14} className="me-1" /> HirePilot Safe
        </button>
      </div>
      <div className="row g-3">
        <div className="col-md-6">
          <div
            className="honesty-box-lazy"
            style={{ opacity: mode === "lazy" ? 1 : 0.5 }}
          >
            <div className="d-flex align-items-center gap-2 mb-2">
              <XCircle size={20} className="text-danger" />
              <span className="fw-bold text-danger">Lazy AI</span>
            </div>
            <p className="mb-0 text-danger" style={{ fontSize: "0.9rem" }}>
              "Fakes 5 years of Python experience"<br />
              <span className="text-muted">— Fabricates entire skill history</span>
            </p>
          </div>
        </div>
        <div className="col-md-6">
          <div
            className="honesty-box-hirepilot"
            style={{ opacity: mode === "safe" ? 1 : 0.5 }}
          >
            <div className="d-flex align-items-center gap-2 mb-2">
              <CheckCircle size={20} className="text-success" />
              <span className="fw-bold text-success">HirePilot Safe Reframing</span>
            </div>
            <p className="mb-0 text-success" style={{ fontSize: "0.9rem" }}>
              "Translates your 5 years of C++ into equivalent<br />
              <span className="text-muted">object-oriented Python concepts"</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main App
// ============================================
function App() {
  const [result, setResult] = useState(null);
  const [view, setView] = useState("discovery");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDemo, setShowDemo] = useState(false);
  const [demoPercentage, setDemoPercentage] = useState(48);

  // Check for existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (token && storedUser) {
      authService
        .getMe()
        .then((data) => {
          setUser(data.user);
          localStorage.setItem("user", JSON.stringify(data.user));
        })
        .catch(() => {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  const handleOnboardingComplete = useCallback(async () => {
    try {
      const data = await authService.getMe();
      setUser(data.user);
      localStorage.setItem("user", JSON.stringify(data.user));
    } catch (err) {
      console.error("Failed to refresh user:", err);
    }
  }, []);

  const runDemo = () => {
    setShowDemo(true);
    setDemoPercentage(48);
    const interval = setInterval(() => {
      setDemoPercentage((prev) => {
        if (prev >= 94) {
          clearInterval(interval);
          return 94;
        }
        return prev + 2;
      });
    }, 80);
  };

  if (loading) {
    return (
      <div
        className="app-gradient-bg d-flex align-items-center justify-content-center"
        style={{ minHeight: "100vh" }}
      >
        <div className="spinner-border text-orange-500" role="status" />
      </div>
    );
  }

  // ============================================
  // LANDING PAGE (Unauthenticated)
  // ============================================
  if (!user) {
    return (
      <div className="app-gradient-bg">
        {/* Top Banner */}
        <div className="top-banner text-center">
          <div className="container">
            ⚡ Live Automation: Run{" "}
            <strong>100% Free</strong> tailored applications via OpenRouter without
            browser blocks.
          </div>
        </div>

        {/* Navigation */}
        <nav className="navbar navbar-expand-lg navbar-light bg-transparent py-3">
          <div className="container">
            <BrandLogo />
            <div className="d-none d-md-flex align-items-center gap-1">
              <a href="#features" className="nav-link-custom">
                Features
              </a>
              <a href="#stealth" className="nav-link-custom">
                Stealth Evasion
              </a>
              <a href="#honesty" className="nav-link-custom">
                Honesty Engine
              </a>
              <a href="#faq" className="nav-link-custom">
                FAQ
              </a>
            </div>
            <button
              className="btn btn-gradient-orange rounded-pill px-4 fw-bold"
              onClick={() => document.getElementById("login-section")?.scrollIntoView({ behavior: "smooth" })}
            >
              Launch Autopilot <ArrowRight size={16} className="ms-1" />
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="hero-section">
          <div className="container">
            <div className="row align-items-center g-5">
              <div className="col-lg-6">
                <div className="section-badge">
                  <Zap size={14} /> Fully Autonomous
                </div>
                <h1
                  className="display-4 fw-extrabold lh-1 mb-3"
                  style={{ letterSpacing: "-0.03em" }}
                >
                  Apply to 100 Jobs.
                  <br />
                  <span className="text-gradient-blue">Get 100 Perfect Resumes.</span>
                  <br />
                  <span className="text-gradient-sunset">On Autopilot.</span>
                </h1>
                <p
                  className="text-muted fs-5 mb-4"
                  style={{ maxWidth: "540px", lineHeight: 1.6 }}
                >
                  Stop sending generic PDFs. HirePilot scans target roles, dynamically
                  matches keywords safely, and runs hidden browsers to submit
                  applications while you sleep.
                </p>
                <div className="d-flex gap-3">
                  <button
                    className="btn btn-gradient-orange rounded-pill px-5 py-3 fw-bold fs-6"
                    onClick={() => document.getElementById("login-section")?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Start Free <ChevronRight size={18} className="ms-1" />
                  </button>
                  <button
                    className="btn btn-outline-secondary rounded-pill px-4 py-3 fw-semibold"
                    onClick={runDemo}
                  >
                    {showDemo ? <Pause size={18} className="me-1" /> : <Play size={18} className="me-1" />}
                    Watch Demo
                  </button>
                </div>
              </div>

              {/* Live Console Preview */}
              <div className="col-lg-6">
                {showDemo ? (
                  <div className="glass-card p-4">
                    <div className="row align-items-center g-4">
                      <div className="col-5">
                        <div className="small text-muted mb-2 fw-semibold">
                          Job: Senior React Developer
                        </div>
                        <div
                          className="p-3 rounded-3 mb-2"
                          style={{ background: "#f8fafc", fontSize: "0.75rem" }}
                        >
                          <div className="fw-bold mb-1">Required:</div>
                          <div>React, TypeScript, Node.js, AWS, GraphQL</div>
                        </div>
                        <div
                          className="p-3 rounded-3"
                          style={{ background: "#f8fafc", fontSize: "0.75rem" }}
                        >
                          <div className="fw-bold mb-1">Your Skills:</div>
                          <div>React, JavaScript, Node.js, CSS, HTML</div>
                        </div>
                      </div>
                      <div className="col-3 text-center">
                        <ProgressRing percentage={demoPercentage} size={100} />
                        <div
                          className="mt-2 small fw-semibold"
                          style={{
                            color:
                              demoPercentage >= 90
                                ? "#16a34a"
                                : demoPercentage >= 70
                                ? "#f97316"
                                : "#64748b",
                          }}
                        >
                          {demoPercentage >= 90 ? "✅ Ready" : "Tailoring..."}
                        </div>
                      </div>
                      <div className="col-4">
                        <LiveConsole />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="glass-card p-4 text-center">
                    <div
                      className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                      style={{
                        width: 80,
                        height: 80,
                        background: "linear-gradient(135deg, #fff7ed, #ffedd5)",
                      }}
                    >
                      <Play size={32} className="text-orange-500" />
                    </div>
                    <h5 className="fw-bold">See It In Action</h5>
                    <p className="text-muted small mb-3">
                      Watch a 48% match transform into 94% in real-time
                    </p>
                    <button
                      className="btn btn-gradient-orange rounded-pill px-4 fw-semibold"
                      onClick={runDemo}
                    >
                      <Play size={16} className="me-1" /> Launch Demo
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Comparison Section */}
        <section className="py-5 bg-grid-pattern" id="features">
          <div className="container">
            <div className="text-center mb-5">
              <div className="section-badge mx-auto">
                <Target size={14} /> The Split-Reality Proof
              </div>
              <h2 className="fw-bold display-6 mb-2">
                Manual vs. <span className="text-gradient-sunset">HirePilot</span>
              </h2>
              <p className="text-muted">The numbers don't lie</p>
            </div>
            <div className="row g-4 justify-content-center">
              <div className="col-md-5">
                <div className="compare-card-manual text-center">
                  <div
                    className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                    style={{ width: 60, height: 60, background: "#fecaca" }}
                  >
                    <XCircle size={28} className="text-danger" />
                  </div>
                  <h4 className="fw-bold text-danger mb-3">Manual Applying</h4>
                  <div className="mb-2">
                    <span className="fw-bold fs-1 text-danger">45 min</span>
                    <br />
                    <span className="text-muted">per job</span>
                  </div>
                  <div className="mb-2">
                    <span className="fw-bold fs-1 text-danger">40%</span>
                    <br />
                    <span className="text-muted">match rate</span>
                  </div>
                  <div>
                    <span className="fw-bold text-danger">Ghosted</span>
                    <br />
                    <span className="text-muted">Result</span>
                  </div>
                </div>
              </div>
              <div className="col-md-5">
                <div className="compare-card-hirepilot text-center">
                  <div
                    className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                    style={{ width: 60, height: 60, background: "#bbf7d0" }}
                  >
                    <Zap size={28} className="text-success" />
                  </div>
                  <h4 className="fw-bold text-success mb-3">HirePilot</h4>
                  <div className="mb-2">
                    <span className="fw-bold fs-1 text-success">15 sec</span>
                    <br />
                    <span className="text-muted">per job</span>
                  </div>
                  <div className="mb-2">
                    <span className="fw-bold fs-1 text-success">90%+</span>
                    <br />
                    <span className="text-muted">guaranteed match</span>
                  </div>
                  <div>
                    <span className="fw-bold text-success">Human-like Interviews</span>
                    <br />
                    <span className="text-muted">on auto-pilot</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5 Autonomous Agent Pillars */}
        <section className="py-5" id="stealth">
          <div className="container">
            <div className="text-center mb-5">
              <div className="section-badge mx-auto">
                <Sparkles size={14} /> The 5 Autonomous Agents
              </div>
              <h2 className="fw-bold display-6 mb-2">
                Your Personal <span className="text-gradient-blue">AI Job Squad</span>
              </h2>
              <p className="text-muted">Five specialized agents working 24/7 to land you interviews</p>
            </div>
            <div className="row g-4">
              {[
                {
                  icon: <Search size={22} />,
                  title: "The JobScan Agent",
                  desc: "Scores listings against your profile, auto-filtering location, sponsorship, and skill roadblocks instantly.",
                  color: "#2563eb",
                  bg: "#eff6ff",
                },
                {
                  icon: <PenTool size={22} />,
                  title: "The Honest-Tailor Agent",
                  desc: "Upgrades matching keywords without hallucinating fake experience. Safe reframing only.",
                  color: "#f97316",
                  bg: "#fff7ed",
                },
                {
                  icon: <Eye size={22} />,
                  title: "The Stealth Pilot",
                  desc: "Drives a Playwright browser that types, moves, and acts exactly like a human to bypass anti-bot scrapers.",
                  color: "#7c3aed",
                  bg: "#f5f3ff",
                },
                {
                  icon: <FileText size={22} />,
                  title: "The Cover Letter Maestro",
                  desc: "Compiles custom, non-robotic outreach copy tailored to each role and company.",
                  color: "#059669",
                  bg: "#ecfdf5",
                },
                {
                  icon: <Sliders size={22} />,
                  title: "The Rate-Control Queue",
                  desc: "Operates safely in the background with zero API charges. 15s delays between jobs for rate-limit safety.",
                  color: "#d97706",
                  bg: "#fffbeb",
                },
              ].map((agent, i) => (
                <div key={i} className="col-md-6 col-lg-4">
                  <div className="feature-card h-100">
                    <div
                      className="feature-icon mb-3"
                      style={{ background: agent.bg, color: agent.color }}
                    >
                      {agent.icon}
                    </div>
                    <h5 className="fw-bold mb-2">{agent.title}</h5>
                    <p className="text-muted small mb-0">{agent.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Honesty Filter Section */}
        <section className="py-5 bg-grid-pattern" id="honesty">
          <div className="container">
            <div className="text-center mb-5">
              <div className="section-badge mx-auto">
                <Shield size={14} /> The Honesty Engine
              </div>
              <h2 className="fw-bold display-6 mb-2">
                Anti-Hallucination <span className="text-gradient-sunset">Guaranteed</span>
              </h2>
              <p className="text-muted">
                We never fabricate your experience. See the difference.
              </p>
            </div>
            <div className="row justify-content-center">
              <div className="col-lg-8">
                <HonestyFilter />
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Accordion Section */}
        <section className="py-5 bg-grid-pattern" id="faq">
          <div className="container">
            <div className="text-center mb-5">
              <div className="section-badge mx-auto">
                <FileText size={14} /> FAQ
              </div>
              <h2 className="fw-bold display-6 mb-2">
                Everything you need to know
              </h2>
              <p className="text-muted">
                Common questions about HirePilot's automation, safety, and platform support
              </p>
            </div>
            <div className="row justify-content-center">
              <div className="col-lg-8">
                <div className="accordion" id="faqAccordion">
                  {[
                    {
                      id: "faq1",
                      question: "Is HirePilot detected by LinkedIn or job boards?",
                      answer:
                        "HirePilot uses advanced Playwright stealth automation with randomized human-like keystroke intervals, mouse movements, and browser fingerprint randomization. It bypasses Cloudflare, DataDome, and most anti-bot systems. However, we recommend using a dedicated LinkedIn session with realistic delays (15-30s per action) to stay undetected.",
                    },
                    {
                      id: "faq2",
                      question: "Does it fake my experience or hallucinate?",
                      answer:
                        "Absolutely not. The Honest-Tailor Agent only reframes existing experience — it translates your real skills into equivalent concepts (e.g., C++ experience → object-oriented Python). It never fabricates years of experience, degree credentials, or employment history. This is guaranteed by our Honesty Engine filter.",
                    },
                    {
                      id: "faq3",
                      question: "Can recruiters tell I used an automation tool?",
                      answer:
                        "No. Every tailored resume reads naturally and passes ATS parsers. The Stealth Pilot emulates genuine human browsing patterns so job portals see legitimate user behavior. Applications arrive with natural timing and realistic session lengths.",
                    },
                    {
                      id: "faq4",
                      question: "Is it truly 100% free to run?",
                      answer:
                        "Yes. HirePilot integrates with OpenRouter's free tier for all LLM operations (resume tailoring, cover letter generation, job scanning). No API keys, no credit cards, no hidden costs. The 20 applications/day limit (50 for early supporters) is more than enough for most job searches.",
                    },
                    {
                      id: "faq5",
                      question: "What happens if my session gets blocked?",
                      answer:
                        "HirePilot includes automatic retry logic with exponential backoff. If a job board blocks a session, the agent logs the failure, rotates browser fingerprints, and retries from a fresh profile. Blocked attempts are reported in your dashboard so you always know your pipeline status.",
                    },
                    {
                      id: "faq6",
                      question: "Which job boards are supported?",
                      answer:
                        "Currently optimized for LinkedIn, Indeed, Glassdoor, and company career portals. The JobScan Agent extracts job descriptions from any URL you provide. Support for Workday, Lever, Greenhouse, and other ATS platforms is in active development.",
                    },
                  ].map((faq, i) => (
                    <div key={faq.id} className="accordion-item border-0 mb-3 rounded-3 shadow-sm overflow-hidden">
                      <h2 className="accordion-header">
                        <button
                          className={`accordion-button ${i !== 0 ? "collapsed" : ""} fw-semibold bg-white`}
                          type="button"
                          data-bs-toggle="collapse"
                          data-bs-target={`#${faq.id}`}
                          aria-expanded={i === 0}
                        >
                          {faq.question}
                        </button>
                      </h2>
                      <div
                        id={faq.id}
                        className={`accordion-collapse collapse ${i === 0 ? "show" : ""}`}
                        data-bs-parent="#faqAccordion"
                      >
                        <div className="accordion-body text-muted bg-white pt-0">
                          {faq.answer}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Login / CTA Section */}
        <section className="py-5" id="login-section">
          <div className="container">
            <div className="text-center mb-4">
              <h2 className="fw-bold display-6 mb-2">
                Ready to <span className="text-gradient-sunset">Automate</span> Your Job Search?
              </h2>
              <p className="text-muted fs-5">
                Join developers getting 5x more interviews with zero effort.
              </p>
            </div>
            <LoginForm onLogin={handleLogin} />
          </div>
        </section>

        {/* Footer */}
        <footer className="py-4 border-top">
          <div className="container text-center">
            <BrandLogo showText={true} />
            <p className="text-muted small mt-2 mb-0">
              © 2026 HirePilot — Autonomous Job Application Agent. Zero operational cost.
            </p>
          </div>
        </footer>
      </div>
    );
  }

  // ============================================
  // ONBOARDING FLOW
  // ============================================
  const needsOnboarding =
    !user?.onboardingDetails?.fullName ||
    !user?.onboardingDetails?.phone ||
    !user?.onboardingDetails?.skillsList?.length ||
    !user?.baseResumeText;

  if (needsOnboarding) {
    return (
      <div className="app-gradient-bg">
        <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom py-3">
          <div className="container">
            <BrandLogo />
            <div className="ms-auto d-flex align-items-center gap-3">
              <span className="text-muted small">{user.onboardingDetails?.fullName}</span>
              <button
                className="btn btn-outline-dark btn-sm rounded-pill px-3"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </nav>
        <div className="container py-5 text-center">
          <div className="section-badge mx-auto">
            <Zap size={14} /> One-Time Setup
          </div>
          <h3 className="fw-bold display-6 mb-2">Complete Your Profile</h3>
          <p className="text-muted fs-5 mb-0">
            Set up your profile to start applying automatically
          </p>
        </div>
        <OnboardingForm user={user} onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  // ============================================
  // MAIN DASHBOARD (Authenticated + Onboarded)
  // ============================================
  const NAV = [
    { id: "discovery", label: "Discovery", icon: Globe },
    { id: "resume", label: "Resume Intelligence", icon: Sparkles },
    { id: "analyzer", label: "Analyzer", icon: Search },
    { id: "applications", label: "Applications", icon: Briefcase },
    { id: "automation", label: "Automation", icon: Zap },
  ];

  return (
    <div className="app-gradient-bg">
      {/* Top Banner */}
      <div className="top-banner text-center">
        <div className="container">
          ⚡ You have{" "}
          <strong>
            {20 - (user?.dailyApplicationsCount || 0)} applications
          </strong>{" "}
          remaining today.{" "}
          <span
            className="text-decoration-underline"
            style={{ cursor: "pointer" }}
            onClick={() => setView("automation")}
          >
            Run Automation
          </span>
        </div>
      </div>

      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom py-3 sticky-top">
        <div className="container">
          <div style={{ cursor: "pointer" }} onClick={() => setView("discovery")}>
            <BrandLogo />
          </div>
          <div className="d-none d-md-flex align-items-center gap-1 ms-3">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`btn btn-sm rounded-pill px-3 fw-semibold ${
                  view === n.id ? "btn-dark" : "btn-light text-muted"
                }`}
                onClick={() => setView(n.id)}
              >
                <n.icon size={14} className="me-1" />
                {n.label}
              </button>
            ))}
          </div>
          <div className="ms-auto d-flex align-items-center gap-3">
            <span className="text-muted small d-none d-md-inline">
              {user.onboardingDetails?.fullName}
            </span>
            <button className="btn btn-outline-dark btn-sm rounded-pill px-3" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile nav */}
      <div className="d-md-none bg-white border-bottom py-2 d-flex justify-content-around">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`btn btn-sm d-flex flex-column align-items-center ${
              view === n.id ? "btn-dark" : "btn-light text-muted"
            }`}
            onClick={() => setView(n.id)}
          >
            <n.icon size={16} />
            <small>{n.label}</small>
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="container py-4">
        {view === "discovery" && <JobBoard />}

        {view === "analyzer" && (
          <>
            {/* Results */}
            {result && (
              <div className="mb-4">
                <div className="glass-card p-3 mb-3">
                  <div className="d-flex align-items-center gap-3">
                    <div
                      className="d-flex align-items-center justify-content-center rounded-3"
                      style={{
                        width: 40,
                        height: 40,
                        background: "linear-gradient(135deg, #2563eb, #4f46e5)",
                      }}
                    >
                      <Search size={18} className="text-white" />
                    </div>
                    <h4 className="fw-bold mb-0">Analysis Result</h4>
                  </div>
                </div>
                <ResultCard result={result} />
              </div>
            )}

            {/* Job Analyzer */}
            <div className="glass-card p-4 mb-4">
              <div className="text-center mb-4">
                <h3 className="fw-bold">
                  Optimize Your <span className="text-gradient-sunset">Match</span>
                </h3>
                <p className="text-muted">
                  Upload your resume and target a job description to see your compatibility
                  score instantly.
                </p>
              </div>
              <JobForm setResult={setResult} />
            </div>
          </>
        )}

        {view === "applications" && <ApplicationList />}

        {view === "resume" && <ResumeIntelligence />}

        {view === "automation" && <AutomationPanel onNavigate={setView} />}
      </main>
    </div>
  );
}

export default App;