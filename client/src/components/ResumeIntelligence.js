import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  FileText,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Award,
  Target,
  Zap,
  Shield,
  Eye,
  PenTool,
  Sliders,
  BarChart3,
  BookOpen,
  Briefcase,
  Code,
  Users,
  MessageSquare,
  Sparkles,
  Download,
  Save,
  Clock,
  Lightbulb,
  Star,
  Heart,
  Flag,
  Layers,
  Type,
  Maximize2,
  Plus,
  Hash,
  ShieldCheck,
} from "lucide-react";

// ============================================
// ANIMATED SCORE RING
// ============================================
function ScoreRing({ percentage, size = 100, strokeWidth = 8, label = "", sublabel = "" }) {
  const [animatedPct, setAnimatedPct] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (animatedPct / 100) * circumference;

  const color =
    percentage >= 90 ? "#22c55e" :
    percentage >= 75 ? "#16a34a" :
    percentage >= 60 ? "#f97316" :
    percentage >= 40 ? "#eab308" :
    "#ef4444";

  useEffect(() => {
    let start = 0;
    const step = Math.max(1, Math.floor(percentage / 30));
    const interval = setInterval(() => {
      start += step;
      if (start >= percentage) {
        setAnimatedPct(percentage);
        clearInterval(interval);
      } else {
        setAnimatedPct(start);
      }
    }, 20);
    return () => clearInterval(interval);
  }, [percentage]);

  return (
    <div className="d-flex flex-column align-items-center">
      <div className="position-relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle stroke="#e2e8f0" fill="transparent" strokeWidth={strokeWidth} r={radius} cx={size / 2} cy={size / 2} />
          <circle
            stroke={color} fill="transparent" strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset}
            r={radius} cx={size / 2} cy={size / 2}
            style={{ transition: "stroke-dashoffset 0.3s ease" }}
          />
        </svg>
        <div className="position-absolute d-flex flex-column align-items-center justify-content-center"
          style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
          <span className="fw-bold" style={{ fontSize: size * 0.22, color }}>{animatedPct}%</span>
        </div>
      </div>
      {label && <span className="fw-semibold mt-1 small text-center">{label}</span>}
      {sublabel && <span className="text-muted" style={{ fontSize: "0.65rem" }}>{sublabel}</span>}
    </div>
  );
}

// ============================================
// SCORE CARD
// ============================================
function ScoreCard({ title, score, icon, color, bg, detail, onClick }) {
  return (
    <div className="card border-0 rounded-3 p-3 h-100"
      style={{ background: bg || "#f8fafc", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}>
      <div className="d-flex align-items-center gap-2 mb-2">
        <div className="d-flex align-items-center justify-content-center rounded-2"
          style={{ width: 32, height: 32, background: color + "20", color }}>
          {icon}
        </div>
        <span className="fw-semibold small flex-grow-1">{title}</span>
        <span className="fw-bold" style={{ color, fontSize: "1.1rem" }}>{score}%</span>
      </div>
      {detail && <div className="small text-muted">{detail}</div>}
    </div>
  );
}

// ============================================
// BULLET POINT ANALYZER
// ============================================
function BulletPoint({ text, analysis }) {
  const hasActionVerb = analysis?.hasActionVerb;
  const hasNumbers = analysis?.hasNumbers;
  const hasImpact = analysis?.hasImpact;
  const score = [hasActionVerb, hasNumbers, hasImpact].filter(Boolean).length;

  return (
    <div className={`p-3 rounded-3 mb-2 border ${score >= 2 ? "border-success" : score >= 1 ? "border-warning" : "border-danger"}`}
      style={{ background: score >= 2 ? "#f0fdf4" : score >= 1 ? "#fffbeb" : "#fef2f2" }}>
      <div className="d-flex align-items-start gap-2">
        <div className="mt-1">
          {score >= 2 ? <CheckCircle size={16} className="text-success" /> :
           score >= 1 ? <AlertTriangle size={16} className="text-warning" /> :
           <XCircle size={16} className="text-danger" />}
        </div>
        <div className="flex-grow-1">
          <div className="small mb-1">{text}</div>
          <div className="d-flex gap-2 flex-wrap">
            <span className={`badge ${hasActionVerb ? "bg-success" : "bg-danger"} rounded-pill`} style={{ fontSize: "0.6rem" }}>
              {hasActionVerb ? "✓ Action Verb" : "✗ Missing Action Verb"}
            </span>
            <span className={`badge ${hasNumbers ? "bg-success" : "bg-danger"} rounded-pill`} style={{ fontSize: "0.6rem" }}>
              {hasNumbers ? "✓ Numbers" : "✗ No Metrics"}
            </span>
            <span className={`badge ${hasImpact ? "bg-success" : "bg-danger"} rounded-pill`} style={{ fontSize: "0.6rem" }}>
              {hasImpact ? "✓ Business Impact" : "✗ No Impact"}
            </span>
          </div>
          {score < 2 && (
            <button className="btn btn-sm btn-outline-primary rounded-pill mt-2" style={{ fontSize: "0.7rem" }}>
              <Zap size={10} className="me-1" /> AI Improve
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// HEAT MAP OVERLAY
// ============================================
function HeatMapOverlay({ sections }) {
  return (
    <div className="border rounded-3 overflow-hidden">
      {sections.map((section, i) => (
        <div key={i} className="d-flex align-items-center border-bottom" style={{ background: section.color + "15" }}>
          <div className="p-2 text-center" style={{ width: 80, background: section.color + "30" }}>
            <span className="fw-bold small" style={{ color: section.color }}>{section.score}%</span>
          </div>
          <div className="p-2 flex-grow-1">
            <span className="small fw-semibold">{section.name}</span>
          </div>
          <div className="p-2">
            <div className="rounded-2" style={{ width: 60, height: 8, background: "#e2e8f0", overflow: "hidden" }}>
              <div style={{ width: `${section.score}%`, height: "100%", background: section.color, borderRadius: 4, transition: "width 1s ease" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// MAIN RESUME INTELLIGENCE COMPONENT
// ============================================
export default function ResumeIntelligence() {
  const [step, setStep] = useState(1);
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [activeTab, setActiveTab] = useState("health");
  const [jobDescription, setJobDescription] = useState("");
  const fileInputRef = useRef(null);

  const tabs = [
    { id: "health", label: "Health Dashboard", icon: <Heart size={14} /> },
    { id: "keywords", label: "Keywords", icon: <Hash size={14} /> },
    { id: "skills", label: "Skills", icon: <Code size={14} /> },
    { id: "achievements", label: "Achievements", icon: <Award size={14} /> },
    { id: "recruiter", label: "Recruiter View", icon: <Eye size={14} /> },
    { id: "formatting", label: "Formatting", icon: <FileText size={14} /> },
    { id: "benchmark", label: "Benchmark", icon: <BarChart3 size={14} /> },
    { id: "gaps", label: "Gap Analysis", icon: <Flag size={14} /> },
    { id: "jd", label: "Job Match", icon: <Target size={14} /> },
    { id: "heatmap", label: "Heat Map", icon: <Layers size={14} /> },
    { id: "versions", label: "Versions", icon: <Save size={14} /> },
    { id: "readiness", label: "Readiness", icon: <ShieldCheck size={14} /> },
  ];

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => setResumeText(evt.target.result);
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => setResumeText(evt.target.result);
    reader.readAsText(file);
  };

  const runAnalysis = async () => {
    if (!resumeText) return;
    setAnalyzing(true);
    setStep(2);
    setTimeout(() => {
      setAnalysis(generateMockAnalysis());
      setAnalyzing(false);
      setStep(3);
    }, 2500);
  };

  const generateMockAnalysis = () => ({
    parsed: {
      name: "Alex Johnson", email: "alex.johnson@email.com", phone: "+1 (555) 123-4567",
      location: "San Francisco, CA", linkedin: "linkedin.com/in/alexjohnson", github: "github.com/alexjohnson",
      summary: "Senior full-stack developer with 6+ years building scalable web applications...",
      experience: [
        { title: "Senior Frontend Engineer", company: "TechCorp", duration: "2021-Present", bullets: ["Developed React components", "Led team of 3 developers", "Reduced load time by 35%"] },
        { title: "Frontend Developer", company: "StartupXYZ", duration: "2018-2021", bullets: ["Built responsive UIs", "Implemented CI/CD pipeline", "Increased test coverage to 90%"] },
      ],
      education: [{ degree: "B.S. Computer Science", school: "University of California", year: "2018" }],
      skills: ["React", "JavaScript", "TypeScript", "Node.js", "Python", "AWS", "Docker", "GraphQL", "PostgreSQL", "Redis", "Git", "CI/CD"],
      certifications: ["AWS Certified Developer", "Google Cloud Associate"],
    },
    scores: { overall: 78, ats: 82, recruiter: 75, formatting: 70, keywords: 68, branding: 72, technical: 85, experience: 80, achievements: 65, projects: 70, education: 90, readiness: 73, interview: 68 },
    keywords: [
      { keyword: "React", found: 9, recommended: 10, importance: "Critical", category: "Frontend", confidence: 95 },
      { keyword: "TypeScript", found: 4, recommended: 8, importance: "Critical", category: "Language", confidence: 90 },
      { keyword: "Docker", found: 0, recommended: 5, importance: "High", category: "DevOps", confidence: 85 },
      { keyword: "AWS", found: 1, recommended: 6, importance: "High", category: "Cloud", confidence: 88 },
      { keyword: "GraphQL", found: 2, recommended: 4, importance: "Medium", category: "API", confidence: 80 },
      { keyword: "CI/CD", found: 1, recommended: 3, importance: "Medium", category: "DevOps", confidence: 82 },
      { keyword: "Node.js", found: 5, recommended: 6, importance: "High", category: "Backend", confidence: 92 },
      { keyword: "PostgreSQL", found: 0, recommended: 4, importance: "Medium", category: "Database", confidence: 78 },
    ],
    skills: {
      hard: { detected: ["React", "JavaScript", "TypeScript", "Node.js", "Python", "AWS", "Docker", "GraphQL", "PostgreSQL", "Redis", "Git"], missing: ["Kubernetes", "Terraform", "Go", "Rust", "Kafka"] },
      soft: { detected: ["Leadership", "Communication", "Teamwork", "Problem Solving"], missing: ["Mentoring", "Public Speaking", "Cross-functional Collaboration"] },
      categories: {
        languages: { detected: ["JavaScript", "TypeScript", "Python"], missing: ["Go", "Rust"] },
        frameworks: { detected: ["React", "Node.js", "Express"], missing: ["Next.js", "Vue", "Angular"] },
        cloud: { detected: ["AWS"], missing: ["GCP", "Azure", "Terraform"] },
        databases: { detected: ["PostgreSQL", "Redis"], missing: ["MongoDB", "Elasticsearch"] },
        devops: { detected: ["Docker", "CI/CD"], missing: ["Kubernetes", "Jenkins", "GitHub Actions"] },
      },
    },
    achievements: [
      { text: "Developed APIs", hasActionVerb: false, hasNumbers: false, hasImpact: false },
      { text: "Led team of 3 developers to deliver project on time", hasActionVerb: true, hasNumbers: true, hasImpact: false },
      { text: "Reduced page load time by 35% through React optimization", hasActionVerb: true, hasNumbers: true, hasImpact: true },
      { text: "Built responsive web applications", hasActionVerb: false, hasNumbers: false, hasImpact: false },
      { text: "Implemented CI/CD pipeline reducing deployment time by 50%", hasActionVerb: true, hasNumbers: true, hasImpact: true },
    ],
    atsIssues: ["Contains table-based layout that may confuse parsers", "Missing standard 'Skills' section heading", "Uses multi-column format in experience section", "Font size below 10pt in some areas"],
    formatting: { hasTables: true, hasColumns: true, hasIcons: false, hasImages: false, hasHeaders: true, hasFooters: false, bulletConsistency: 85, sectionOrder: 90, pageLength: 2, whiteSpace: 75, fontConsistency: 80 },
    recruiter: { firstImpression: 78, scanningSpeed: "7 seconds", noticesFirst: ["Current role at TechCorp", "React expertise", "AWS certification"], ignores: ["Summary paragraph", "Education details"], professionalism: 82, modernity: 75, clarity: 80, trust: 85 },
    benchmark: { percentile: 82, roleAverage: 68, topPercentile: 95, comparisonCount: 1247 },
    gaps: [
      { area: "Cloud Infrastructure", severity: "high", recommendation: "Add Kubernetes and Terraform experience" },
      { area: "Testing", severity: "medium", recommendation: "Include unit/integration testing frameworks" },
      { area: "Open Source", severity: "low", recommendation: "Contribute to open source projects" },
      { area: "Leadership", severity: "medium", recommendation: "Highlight mentoring and team leadership" },
    ],
    jobMatch: jobDescription ? { overall: 84, technical: 88, keyword: 76, experience: 90, title: 100, education: 100, industry: 80, leadership: 70, culture: 75, recruiter: 82, ats: 86 } : null,
    heatMap: [
      { name: "Contact Info", score: 100, color: "#22c55e" },
      { name: "Summary", score: 65, color: "#eab308" },
      { name: "Experience", score: 82, color: "#22c55e" },
      { name: "Education", score: 90, color: "#22c55e" },
      { name: "Skills", score: 55, color: "#f97316" },
      { name: "Certifications", score: 70, color: "#eab308" },
      { name: "Projects", score: 45, color: "#ef4444" },
      { name: "Achievements", score: 50, color: "#f97316" },
    ],
    recommendations: [
      "Add Docker to your Skills section — it's mentioned in 85% of similar roles",
      "Rewrite 'Developed APIs' to include metrics: 'Developed 18 REST APIs serving 50K+ requests/day'",
      "Add a Projects section showcasing 2-3 key side projects",
      "Include your GitHub profile link — 73% of recruiters check it",
      "Move Technical Skills higher on the page for better ATS scanning",
      "Add Kubernetes to your cloud toolkit for senior roles",
      "Quantify your leadership impact with team size and project outcomes",
    ],
    versions: [
      { name: "Original", score: 78, date: "2026-07-15", purpose: "Master resume" },
      { name: "ATS Optimized", score: 88, date: "2026-07-16", purpose: "ATS-friendly version" },
      { name: "Recruiter Optimized", score: 85, date: "2026-07-16", purpose: "Human-readable" },
    ],
    interview: {
      likelyQuestions: [
        "Describe your experience with React performance optimization",
        "How do you handle state management in large applications?",
        "Walk me through your CI/CD pipeline setup",
        "How have you mentored junior developers?",
        "Describe a challenging technical problem you solved",
      ],
      technicalTopics: ["React internals", "System design", "Data structures", "AWS services"],
    },
  });

  const a = analysis;

  // Step 1: UPLOAD
  if (step === 1) {
    return (
      <div className="container py-4">
        <div className="text-center mb-4">
          <div className="section-badge mx-auto"><Sparkles size={14} /> Resume Intelligence</div>
          <h2 className="fw-bold display-6 mb-2">Upload Your <span className="text-gradient-sunset">Resume</span></h2>
          <p className="text-muted">We'll analyze, score, and optimize your resume to beat any ATS system</p>
        </div>
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className="glass-card p-5 text-center"
              onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
              style={{ border: "2px dashed #cbd5e1", cursor: "pointer", minHeight: 250 }}
              onClick={() => fileInputRef.current?.click()}>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleFileUpload} style={{ display: "none" }} />
              <Upload size={48} className="text-muted mb-3" />
              <h5 className="fw-bold">Drop your resume here</h5>
              <p className="text-muted small mb-3">or click to browse</p>
              <p className="text-muted" style={{ fontSize: "0.75rem" }}>Supports PDF, DOCX, TXT — Max 10MB</p>
              {fileName && (
                <div className="mt-3 p-3 rounded-3" style={{ background: "#f0fdf4" }}>
                  <FileText size={20} className="text-success me-2" />
                  <span className="fw-semibold">{fileName}</span>
                  <span className="text-muted ms-2 small">({resumeText.length} chars)</span>
                </div>
              )}
            </div>
            <div className="text-center mt-4">
              <button className="btn btn-gradient-orange rounded-pill px-5 py-3 fw-bold" disabled={!resumeText || analyzing} onClick={runAnalysis}>
                {analyzing ? <><div className="spinner-border spinner-border-sm me-2" /> Analyzing...</> : <><Zap size={18} className="me-2" /> Analyze Resume</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: ANALYZING
  if (step === 2) {
    return (
      <div className="container py-5 text-center">
        <div className="mb-4"><div className="spinner-border text-primary" style={{ width: 60, height: 60 }} role="status" /></div>
        <h4 className="fw-bold">Analyzing Your Resume</h4>
        <p className="text-muted">Running 12 intelligence engines...</p>
        <div className="row justify-content-center mt-4">
          <div className="col-lg-6">
            {["Parsing resume structure...","Extracting skills & experience...","Simulating ATS parsing...","Analyzing keyword density...","Evaluating achievement quality...","Running recruiter review...","Checking formatting compatibility...","Benchmarking against industry...","Generating recommendations...","Calculating readiness score..."].map((msg, i) => (
              <div key={i} className="d-flex align-items-center gap-2 py-1 console-line" style={{ animationDelay: `${i * 0.3}s` }}>
                <div className="spinner-grow spinner-grow-sm text-primary" style={{ width: 8, height: 8 }} />
                <span className="small text-muted">{msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 3: DASHBOARD
  return (
    <div className="container py-4">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <div className="section-badge"><Sparkles size={14} /> Resume Intelligence</div>
          <h3 className="fw-bold mb-0">{a?.parsed?.name || "Resume Analysis"}</h3>
          <p className="text-muted small mb-0">{a?.parsed?.email} · {a?.parsed?.location}</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary btn-sm rounded-pill" onClick={() => setStep(1)}><Upload size={14} className="me-1" /> New Resume</button>
          <button className="btn btn-gradient-orange btn-sm rounded-pill fw-semibold"><Download size={14} className="me-1" /> Export Report</button>
        </div>
      </div>

      <div className="d-flex gap-1 mb-4 flex-wrap">
        {tabs.map((tab) => (
          <button key={tab.id} className={`btn btn-sm rounded-pill ${activeTab === tab.id ? "btn-dark" : "btn-light text-muted"}`} onClick={() => setActiveTab(tab.id)}>
            {tab.icon}<span className="ms-1 d-none d-md-inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* HEALTH DASHBOARD */}
      {activeTab === "health" && (
        <div>
          <div className="row g-3 mb-4">
            <div className="col-4 col-md-2"><ScoreRing percentage={a?.scores?.overall || 0} size={90} label="Overall Health" sublabel="Resume Score" /></div>
            <div className="col-4 col-md-2"><ScoreRing percentage={a?.scores?.ats || 0} size={90} label="ATS Compat" sublabel="Parser Score" /></div>
            <div className="col-4 col-md-2"><ScoreRing percentage={a?.scores?.recruiter || 0} size={90} label="Recruiter" sublabel="Readability" /></div>
            <div className="col-4 col-md-2"><ScoreRing percentage={a?.scores?.formatting || 0} size={90} label="Formatting" sublabel="Layout Score" /></div>
            <div className="col-4 col-md-2"><ScoreRing percentage={a?.scores?.keywords || 0} size={90} label="Keywords" sublabel="Optimization" /></div>
            <div className="col-4 col-md-2"><ScoreRing percentage={a?.scores?.readiness || 0} size={90} label="Readiness" sublabel="Apply Ready" /></div>
          </div>
          <div className="row g-2 mb-4">
            {[
              { title: "Technical Strength", score: a?.scores?.technical || 0, icon: <Code size={16} />, color: "#2563eb", bg: "#eff6ff" },
              { title: "Experience Quality", score: a?.scores?.experience || 0, icon: <Briefcase size={16} />, color: "#059669", bg: "#ecfdf5" },
              { title: "Achievement Quality", score: a?.scores?.achievements || 0, icon: <Award size={16} />, color: "#d97706", bg: "#fffbeb" },
              { title: "Professional Branding", score: a?.scores?.branding || 0, icon: <Star size={16} />, color: "#7c3aed", bg: "#f5f3ff" },
              { title: "Project Quality", score: a?.scores?.projects || 0, icon: <Layers size={16} />, color: "#0891b2", bg: "#ecfeff" },
              { title: "Education", score: a?.scores?.education || 0, icon: <BookOpen size={16} />, color: "#65a30d", bg: "#f7fee7" },
              { title: "Interview Readiness", score: a?.scores?.interview || 0, icon: <MessageSquare size={16} />, color: "#db2777", bg: "#fdf2f8" },
              { title: "Career Level", score: a?.scores?.readiness || 0, icon: <TrendingUp size={16} />, color: "#ea580c", bg: "#fff7ed" },
            ].map((c, i) => (
              <div key={i} className="col-6 col-md-3"><ScoreCard {...c} /></div>
            ))}
          </div>
          {/* ATS Parsing Success */}
          <div className="glass-card p-4 mb-4">
            <div className="d-flex align-items-center gap-3 mb-3">
              <div className="d-flex align-items-center justify-content-center rounded-2" style={{ width: 40, height: 40, background: "#dcfce7" }}>
                <CheckCircle size={20} className="text-success" />
              </div>
              <div>
                <h5 className="fw-bold mb-0">ATS Parsing Success</h5>
                <p className="text-muted small mb-0">How well ATS systems can read your resume</p>
              </div>
              <div className="ms-auto text-end">
                <span className="fw-bold fs-3 text-success">{a?.scores?.ats || 0}%</span><br />
                <span className="text-muted small">Parsing Accuracy</span>
              </div>
            </div>
            <div className="row g-2">
              {[
                { label: "Section Detection", score: 95 }, { label: "Date Parsing", score: 90 },
                { label: "Skill Extraction", score: 85 }, { label: "Company Recognition", score: 88 },
                { label: "Title Recognition", score: 92 }, { label: "Education Detection", score: 95 },
                { label: "Font Compatibility", score: 80 }, { label: "Unicode Support", score: 85 },
              ].map((item) => (
                <div key={item.label} className="col-6 col-md-3">
                  <div className="d-flex align-items-center gap-2">
                    <span className="small text-muted flex-grow-1">{item.label}</span>
                    <span className="fw-bold small" style={{ color: item.score >= 90 ? "#15803d" : item.score >= 75 ? "#d97706" : "#dc2626" }}>{item.score}%</span>
                  </div>
                  <div className="rounded-2 mb-1" style={{ height: 4, background: "#e2e8f0", overflow: "hidden" }}>
                    <div style={{ width: `${item.score}%`, height: "100%", background: item.score >= 90 ? "#22c55e" : item.score >= 75 ? "#eab308" : "#ef4444", borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Recommendations */}
          <div className="glass-card p-4">
            <h5 className="fw-bold mb-3"><Lightbulb size={18} className="text-warning me-2" /> AI Recommendations</h5>
            {a?.recommendations?.map((rec, i) => (
              <div key={i} className="d-flex align-items-start gap-2 py-2 border-bottom">
                <span className="badge bg-warning text-dark rounded-pill mt-1" style={{ fontSize: "0.6rem", minWidth: 20 }}>{i + 1}</span>
                <span className="small flex-grow-1">{rec}</span>
                <button className="btn btn-sm btn-outline-primary rounded-pill" style={{ fontSize: "0.65rem" }}><Zap size={10} className="me-1" /> Apply Fix</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KEYWORDS */}
      {activeTab === "keywords" && (
        <div className="glass-card p-4">
          <h5 className="fw-bold mb-3"><Hash size={18} className="me-2" /> Keyword Intelligence</h5>
          <p className="text-muted small mb-3">Detailed analysis of keyword usage, frequency, and optimization opportunities</p>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead><tr><th>Keyword</th><th>Found</th><th>Recommended</th><th>Status</th><th>Importance</th><th>Category</th><th>Confidence</th></tr></thead>
              <tbody>
                {a?.keywords?.map((kw, i) => {
                  const sc = kw.found >= kw.recommended ? "success" : kw.found > 0 ? "warning" : "danger";
                  const st = kw.found >= kw.recommended ? "Excellent" : kw.found > 0 ? "Needs Improvement" : "Missing";
                  return (
                    <tr key={i}>
                      <td className="fw-semibold">{kw.keyword}</td>
                      <td>{kw.found}</td><td>{kw.recommended}</td>
                      <td><span className={`badge bg-${sc} rounded-pill`}>{st}</span></td>
                      <td><span className={`badge ${kw.importance === "Critical" ? "bg-danger" : kw.importance === "High" ? "bg-warning text-dark" : "bg-info text-dark"} rounded-pill`}>{kw.importance}</span></td>
                      <td className="text-muted">{kw.category}</td>
                      <td>{kw.confidence}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SKILLS */}
      {activeTab === "skills" && (
        <div className="row g-3">
          <div className="col-lg-6">
            <div className="glass-card p-4 h-100">
              <h5 className="fw-bold mb-3"><Code size={18} className="me-2" /> Hard Skills</h5>
              <div className="mb-3">
                <span className="fw-semibold small">Detected ({a?.skills?.hard?.detected?.length || 0})</span>
                <div className="d-flex flex-wrap gap-1 mt-1">{a?.skills?.hard?.detected?.map((s, i) => <span key={i} className="badge bg-success rounded-pill">{s}</span>)}</div>
              </div>
              <div>
                <span className="fw-semibold small text-danger">Missing ({a?.skills?.hard?.missing?.length || 0})</span>
                <div className="d-flex flex-wrap gap-1 mt-1">{a?.skills?.hard?.missing?.map((s, i) => <span key={i} className="badge bg-danger rounded-pill">{s}</span>)}</div>
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="glass-card p-4 h-100">
              <h5 className="fw-bold mb-3"><Users size={18} className="me-2" /> Soft Skills</h5>
              <div className="mb-3">
                <span className="fw-semibold small">Detected ({a?.skills?.soft?.detected?.length || 0})</span>
                <div className="d-flex flex-wrap gap-1 mt-1">{a?.skills?.soft?.detected?.map((s, i) => <span key={i} className="badge bg-primary rounded-pill">{s}</span>)}</div>
              </div>
              <div>
                <span className="fw-semibold small text-warning">Missing ({a?.skills?.soft?.missing?.length || 0})</span>
                <div className="d-flex flex-wrap gap-1 mt-1">{a?.skills?.soft?.missing?.map((s, i) => <span key={i} className="badge bg-warning text-dark rounded-pill">{s}</span>)}</div>
              </div>
            </div>
          </div>
          <div className="col-12">
            <div className="glass-card p-4">
              <h5 className="fw-bold mb-3">Skill Categories</h5>
              <div className="row g-3">
                {Object.entries(a?.skills?.categories || {}).map(([cat, data]) => (
                  <div key={cat} className="col-md-4">
                    <div className="p-3 rounded-3" style={{ background: "#f8fafc" }}>
                      <h6 className="fw-bold text-capitalize mb-2">{cat}</h6>
                      <div className="mb-2">{data.detected.map((s, i) => <span key={i} className="badge bg-success rounded-pill me-1 mb-1">{s}</span>)}</div>
                      {data.missing.length > 0 && <div><span className="small text-danger">Missing: </span>{data.missing.map((s, i) => <span key={i} className="badge bg-danger rounded-pill me-1 mb-1" style={{ fontSize: "0.65rem" }}>{s}</span>)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACHIEVEMENTS */}
      {activeTab === "achievements" && (
        <div className="glass-card p-4">
          <h5 className="fw-bold mb-3"><Award size={18} className="me-2" /> Achievement Intelligence</h5>
          <p className="text-muted small mb-3">Analyzing bullet points for action verbs, metrics, and business impact</p>
          {a?.achievements?.map((bull, i) => <BulletPoint key={i} text={bull.text} analysis={bull} />)}
        </div>
      )}

      {/* RECRUITER VIEW */}
      {activeTab === "recruiter" && (
        <div className="row g-3">
          <div className="col-lg-4">
            <div className="glass-card p-4 text-center">
              <ScoreRing percentage={a?.scores?.recruiter || 0} size={100} label="Recruiter Score" />
              <div className="mt-3"><Clock size={14} className="text-muted me-1" /><span className="fw-semibold">Recruiter spends: </span><span className="text-warning fw-bold">{a?.recruiter?.scanningSpeed}</span></div>
            </div>
          </div>
          <div className="col-lg-8">
            <div className="glass-card p-4">
              <h5 className="fw-bold mb-3"><Eye size={18} className="me-2" /> Recruiter Review</h5>
              <div className="row g-2 mb-3">
                <div className="col-4"><ScoreCard title="First Impression" score={a?.recruiter?.firstImpression || 0} icon={<Star size={14} />} color="#2563eb" bg="#eff6ff" /></div>
                <div className="col-4"><ScoreCard title="Professionalism" score={a?.recruiter?.professionalism || 0} icon={<Shield size={14} />} color="#059669" bg="#ecfdf5" /></div>
                <div className="col-4"><ScoreCard title="Clarity" score={a?.recruiter?.clarity || 0} icon={<FileText size={14} />} color="#d97706" bg="#fffbeb" /></div>
              </div>
              <div className="mb-3">
                <h6 className="fw-semibold small">What they notice first:</h6>
                {a?.recruiter?.noticesFirst?.map((item, i) => <div key={i} className="d-flex align-items-center gap-2 mb-1"><Eye size={12} className="text-primary" /><span className="small">{item}</span></div>)}
              </div>
              <div><h6 className="fw-semibold small text-danger">What they ignore:</h6>
                {a?.recruiter?.ignores?.map((item, i) => <div key={i} className="d-flex align-items-center gap-2 mb-1"><XCircle size={12} className="text-danger" /><span className="small">{item}</span></div>)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FORMATTING */}
      {activeTab === "formatting" && (
        <div className="row g-3">
          <div className="col-lg-6">
            <div className="glass-card p-4">
              <h5 className="fw-bold mb-3"><FileText size={18} className="me-2" /> Formatting Analysis</h5>
              <div className="row g-2 mb-3">
                <div className="col-6"><ScoreCard title="Bullet Consistency" score={a?.formatting?.bulletConsistency || 0} icon={<FileText size={14} />} color="#2563eb" bg="#eff6ff" /></div>
                <div className="col-6"><ScoreCard title="Section Order" score={a?.formatting?.sectionOrder || 0} icon={<Layers size={14} />} color="#059669" bg="#ecfdf5" /></div>
                <div className="col-6"><ScoreCard title="White Space" score={a?.formatting?.whiteSpace || 0} icon={<Maximize2 size={14} />} color="#d97706" bg="#fffbeb" /></div>
                <div className="col-6"><ScoreCard title="Font Consistency" score={a?.formatting?.fontConsistency || 0} icon={<Type size={14} />} color="#7c3aed" bg="#f5f3ff" /></div>
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="glass-card p-4">
              <h5 className="fw-bold mb-3">Issues Detected</h5>
              {a?.atsIssues?.map((issue, i) => (
                <div key={i} className="d-flex align-items-start gap-2 py-2 border-bottom">
                  <AlertTriangle size={14} className="text-warning mt-1 flex-shrink-0" /><span className="small">{issue}</span>
                  <button className="btn btn-sm btn-outline-primary rounded-pill ms-auto" style={{ fontSize: "0.6rem" }}>Fix</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BENCHMARK */}
      {activeTab === "benchmark" && (
        <div className="glass-card p-4">
          <h5 className="fw-bold mb-3"><BarChart3 size={18} className="me-2" /> Industry Benchmark</h5>
          <p className="text-muted small mb-3">Compared against {a?.benchmark?.comparisonCount?.toLocaleString()} successful resumes for similar roles</p>
          <div className="row align-items-center g-4">
            <div className="col-md-4 text-center"><ScoreRing percentage={a?.benchmark?.percentile || 0} size={120} label="Your Resume" sublabel={`Top ${100 - (a?.benchmark?.percentile || 0)}%`} /></div>
            <div className="col-md-8">
              {[
                { label: "Your Score", score: a?.scores?.overall || 0, color: "#22c55e" },
                { label: "Role Average", score: a?.benchmark?.roleAverage || 0, color: "#94a3b8" },
                { label: "Top Performers", score: a?.benchmark?.topPercentile || 0, color: "#2563eb" },
              ].map((b) => (
                <div key={b.label} className="mb-3">
                  <div className="d-flex justify-content-between mb-1"><span className="small fw-semibold">{b.label}</span><span className="fw-bold" style={{ color: b.color }}>{b.score}%</span></div>
                  <div className="rounded-2" style={{ height: 8, background: "#e2e8f0", overflow: "hidden" }}>
                    <div style={{ width: `${b.score}%`, height: "100%", background: b.color, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GAP ANALYSIS */}
      {activeTab === "gaps" && (
        <div className="glass-card p-4">
          <h5 className="fw-bold mb-3"><Flag size={18} className="me-2" /> Career Gap Analysis</h5>
          {a?.gaps?.map((gap, i) => (
            <div key={i} className={`d-flex align-items-start gap-3 p-3 mb-2 rounded-3`}
              style={{ background: gap.severity === "high" ? "#fef2f2" : gap.severity === "medium" ? "#fffbeb" : "#f0fdf4" }}>
              <div className="mt-1">{gap.severity === "high" ? <XCircle size={18} className="text-danger" /> : gap.severity === "medium" ? <AlertTriangle size={18} className="text-warning" /> : <CheckCircle size={18} className="text-success" />}</div>
              <div className="flex-grow-1">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span className="fw-semibold small">{gap.area}</span>
                  <span className={`badge ${gap.severity === "high" ? "bg-danger" : gap.severity === "medium" ? "bg-warning text-dark" : "bg-success"} rounded-pill`} style={{ fontSize: "0.6rem" }}>{gap.severity}</span>
                </div>
                <p className="small text-muted mb-0">{gap.recommendation}</p>
              </div>
              <button className="btn btn-sm btn-outline-primary rounded-pill" style={{ fontSize: "0.65rem" }}><Zap size={10} className="me-1" /> Address</button>
            </div>
          ))}
        </div>
      )}

      {/* JOB MATCH */}
      {activeTab === "jd" && (
        <div className="row g-3">
          <div className="col-12">
            <div className="glass-card p-4">
              <h5 className="fw-bold mb-3"><Target size={18} className="me-2" /> Job Description Intelligence</h5>
              <textarea className="form-control mb-3" rows={4} placeholder="Paste a job description to compare against your resume..." value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
              {!a?.jobMatch && <button className="btn btn-gradient-orange btn-sm rounded-pill fw-semibold" onClick={() => setAnalysis(generateMockAnalysis())}><Zap size={14} className="me-1" /> Compare</button>}
            </div>
          </div>
          {a?.jobMatch && (
            <div className="col-12">
              <div className="glass-card p-4">
                <h5 className="fw-bold mb-3">Match Scores</h5>
                <div className="row g-2">
                  {Object.entries(a.jobMatch).map(([key, val]) => (
                    <div key={key} className="col-6 col-md-3">
                      <ScoreCard title={key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())} score={val} icon={<Target size={14} />}
                        color={val >= 80 ? "#22c55e" : val >= 60 ? "#eab308" : "#ef4444"}
                        bg={val >= 80 ? "#f0fdf4" : val >= 60 ? "#fffbeb" : "#fef2f2"} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HEAT MAP */}
      {activeTab === "heatmap" && (
        <div className="glass-card p-4">
          <h5 className="fw-bold mb-3"><Layers size={18} className="me-2" /> Resume Heat Map</h5>
          <p className="text-muted small mb-3">Visual overview of resume section strength — green is strong, red needs work</p>
          <HeatMapOverlay sections={a?.heatMap || []} />
          <div className="mt-3 d-flex gap-3">
            <div className="d-flex align-items-center gap-1"><div style={{ width: 12, height: 12, borderRadius: 2, background: "#22c55e" }} /><span className="small text-muted">Excellent</span></div>
            <div className="d-flex align-items-center gap-1"><div style={{ width: 12, height: 12, borderRadius: 2, background: "#eab308" }} /><span className="small text-muted">Needs Work</span></div>
            <div className="d-flex align-items-center gap-1"><div style={{ width: 12, height: 12, borderRadius: 2, background: "#ef4444" }} /><span className="small text-muted">Critical</span></div>
          </div>
        </div>
      )}

      {/* VERSIONS */}
      {activeTab === "versions" && (
        <div className="glass-card p-4">
          <h5 className="fw-bold mb-3"><Save size={18} className="me-2" /> Resume Versions</h5>
          <div className="row g-3">
            {a?.versions?.map((v, i) => (
              <div key={i} className="col-md-4">
                <div className="card border-0 rounded-3 p-3 h-100" style={{ background: "#f8fafc" }}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <FileText size={16} className="text-primary" /><span className="fw-semibold small flex-grow-1">{v.name}</span>
                    <span className="fw-bold" style={{ color: v.score >= 85 ? "#22c55e" : v.score >= 70 ? "#eab308" : "#ef4444" }}>{v.score}%</span>
                  </div>
                  <div className="small text-muted mb-1">Date: {v.date}</div>
                  <div className="small text-muted mb-2">Purpose: {v.purpose}</div>
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-primary rounded-pill flex-grow-1" style={{ fontSize: "0.65rem" }}><Eye size={10} className="me-1" /> View</button>
                    <button className="btn btn-sm btn-outline-secondary rounded-pill" style={{ fontSize: "0.65rem" }}><Save size={10} /></button>
                  </div>
                </div>
              </div>
            ))}
            <div className="col-md-4">
              <div className="card border-2 border-dashed rounded-3 p-3 h-100 d-flex align-items-center justify-content-center" style={{ borderStyle: "dashed", cursor: "pointer", background: "#fafafa" }}>
                <Plus size={24} className="text-muted mb-2" /><span className="small text-muted fw-semibold">Save Current Version</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* READINESS */}
      {activeTab === "readiness" && (
        <div className="glass-card p-4">
          <h5 className="fw-bold mb-3"><ShieldCheck size={18} className="me-2" /> Application Readiness</h5>
          <div className="row g-3 mb-4">
            <div className="col-md-3"><ScoreRing percentage={a?.scores?.overall || 0} size={80} label="Resume" /></div>
            <div className="col-md-3"><ScoreRing percentage={a?.scores?.ats || 0} size={80} label="ATS" /></div>
            <div className="col-md-3"><ScoreRing percentage={a?.scores?.recruiter || 0} size={80} label="Recruiter" /></div>
            <div className="col-md-3"><ScoreRing percentage={a?.scores?.readiness || 0} size={80} label="Readiness" /></div>
          </div>
          <div className="text-center p-4 rounded-3" style={{ background: (a?.scores?.readiness || 0) >= 70 ? "#f0fdf4" : "#fffbeb" }}>
            <h4 className="fw-bold mb-2" style={{ color: (a?.scores?.readiness || 0) >= 70 ? "#15803d" : "#d97706" }}>
              {(a?.scores?.readiness || 0) >= 70 ? "✅ READY TO APPLY" : "⚠️ Needs Improvement"}
            </h4>
            <p className="text-muted small mb-0">
              {(a?.scores?.readiness || 0) >= 70 ? "Your resume is in great shape! Focus on tailoring for specific roles." : "Address the recommendations above to improve your application readiness."}
            </p>
          </div>
        </div>
      )}

      {/* AI Rewrite */}
      <div className="glass-card p-4 mt-3">
        <h5 className="fw-bold mb-3"><Sparkles size={18} className="text-warning me-2" /> AI Resume Rewrite</h5>
        <p className="text-muted small mb-3">Generate a completely rewritten resume optimized for ATS and recruiters. We never invent experience.</p>
        <div className="row g-2">
          <div className="col-6 col-md-3"><button className="btn btn-outline-primary btn-sm w-100 rounded-pill">Rewrite Summary</button></div>
          <div className="col-6 col-md-3"><button className="btn btn-outline-primary btn-sm w-100 rounded-pill">Improve Experience</button></div>
          <div className="col-6 col-md-3"><button className="btn btn-outline-primary btn-sm w-100 rounded-pill">Optimize Skills</button></div>
          <div className="col-6 col-md-3"><button className="btn btn-gradient-orange btn-sm w-100 rounded-pill fw-semibold"><Zap size={14} className="me-1" /> Full Rewrite</button></div>
        </div>
      </div>

      {/* Interview Intelligence */}
      <div className="glass-card p-4 mt-3">
        <h5 className="fw-bold mb-3"><MessageSquare size={18} className="me-2" /> Interview Intelligence</h5>
        <p className="text-muted small mb-3">Predicted interview questions based on your resume</p>
        {a?.interview?.likelyQuestions?.map((q, i) => (
          <div key={i} className="d-flex align-items-start gap-2 py-2 border-bottom">
            <span className="badge bg-primary rounded-pill mt-1" style={{ fontSize: "0.6rem", minWidth: 20 }}>{i + 1}</span>
            <span className="small flex-grow-1">{q}</span>
            <button className="btn btn-sm btn-outline-secondary rounded-pill" style={{ fontSize: "0.6rem" }}><BookOpen size={10} className="me-1" /> Prepare</button>
          </div>
        ))}
      </div>
    </div>
  );
}