const API_BASE = process.env.REACT_APP_API_URL || "https://hirepilot-qskd.onrender.com";

// ========================================================
// Auth Service
// ========================================================

const getHeaders = (includeAuth = true) => {
  const headers = { "Content-Type": "application/json" };
  if (includeAuth) {
    const token = localStorage.getItem("token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
};

export const authService = {
  signup: async (data) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/signup`, {
      method: "POST",
      headers: getHeaders(false),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Signup failed" }));
      throw new Error(err.error || "Signup failed");
    }
    return res.json();
  },

  login: async (email, password) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: getHeaders(false),
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error || "Login failed");
    }
    return res.json();
  },

  getMe: async () => {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Failed to get user");
    return res.json();
  },

  updateOnboarding: async (data) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/onboarding`, {
      method: "PUT",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update onboarding");
    return res.json();
  },

  forgotPassword: async (email) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: getHeaders(false),
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to send reset email" }));
      throw new Error(err.error || "Failed to send reset email");
    }
    return res.json();
  },

  extractResume: async (file) => {
    const form = new FormData();
    form.append("resume", file);
    const res = await fetch(`${API_BASE}/api/v1/auth/extract-resume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Resume extraction failed" }));
      throw new Error(err.error || "Resume extraction failed");
    }
    return res.json();
  },
};

// ========================================================
// Application Service
// ========================================================

export const applicationService = {
  getAll: async (statusFilter = "") => {
    const query = statusFilter ? `?status=${statusFilter}` : "";
    const res = await fetch(`${API_BASE}/api/v1/applications${query}`, {
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Failed to fetch applications");
    return res.json();
  },

  getStats: async () => {
    const res = await fetch(`${API_BASE}/api/v1/applications/stats`, {
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Failed to fetch stats");
    return res.json();
  },

  create: async (data) => {
    const res = await fetch(`${API_BASE}/api/v1/applications`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create application");
    return res.json();
  },

  manualApply: async (data) => {
    const res = await fetch(`${API_BASE}/api/v1/applications/manual-apply`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to add application");
    return res.json();
  },

  updateStatus: async (id, status, note = "") => {
    const res = await fetch(`${API_BASE}/api/v1/applications/${id}/status`, {
      method: "PUT",
      headers: getHeaders(true),
      body: JSON.stringify({ status, note }),
    });
    if (!res.ok) throw new Error("Failed to update status");
    return res.json();
  },

  update: async (id, data) => {
    const res = await fetch(`${API_BASE}/api/v1/applications/${id}`, {
      method: "PUT",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update application");
    return res.json();
  },

  delete: async (id) => {
    const res = await fetch(`${API_BASE}/api/v1/applications/${id}`, {
      method: "DELETE",
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Failed to delete application");
    return res.json();
  },

  tailor: async (id) => {
    const res = await fetch(`${API_BASE}/api/v1/applications/${id}/tailor`, {
      method: "POST",
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Failed to tailor");
    return res.json();
  },
};

// ========================================================
// Automation Service
// ========================================================

export const automationService = {
  run: async (dryRun = false, maxApplications = 10) => {
    const res = await fetch(`${API_BASE}/api/v1/automation/run`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify({ dryRun, maxApplications }),
    });
    if (!res.ok) throw new Error("Automation run failed");
    return res.json();
  },

  scan: async () => {
    const res = await fetch(`${API_BASE}/api/v1/automation/scan`, {
      method: "POST",
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Scan failed");
    return res.json();
  },

  preflight: async () => {
    const res = await fetch(`${API_BASE}/api/v1/automation/preflight`, {
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Preflight check failed");
    return res.json();
  },

  // Auto-apply to user-selected jobs (from the job board)
  applyToJobs: async (jobs, dryRun = false) => {
    const res = await fetch(`${API_BASE}/api/v1/automation/auto-apply/jobs`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify({ jobs, dryRun }),
    });
    if (!res.ok) throw new Error("Auto-apply failed");
    return res.json();
  },

  // Manual auto-apply run across the full pool
  autoApplyRun: async (dryRun = false, maxPerRun = 5) => {
    const res = await fetch(`${API_BASE}/api/v1/automation/auto-apply/run`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify({ dryRun, maxPerRun }),
    });
    if (!res.ok) throw new Error("Auto-apply run failed");
    return res.json();
  },

  // Get current auto-apply settings + remaining daily limit
  getAutoApplyStatus: async () => {
    const res = await fetch(`${API_BASE}/api/v1/automation/auto-apply`, {
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Failed to load auto-apply status");
    return res.json();
  },

  // Configure auto-apply settings
  setAutoApplySettings: async (settings) => {
    const res = await fetch(`${API_BASE}/api/v1/automation/auto-apply`, {
      method: "PUT",
      headers: getHeaders(true),
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error("Failed to save auto-apply settings");
    return res.json();
  },
};

// ========================================================
// Job Discovery Service
// ========================================================

const buildQuery = (params = {}) => {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "" && v !== false) usp.append(k, v);
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
};

export const jobService = {
  // Curated dashboard sections + "Recommended For You" (auth)
  getSections: async (params = {}) => {
    const res = await fetch(`${API_BASE}/api/jobs/sections${buildQuery(params)}`, {
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Failed to load job sections");
    return res.json();
  },

  // Filtered + paginated search (public)
  searchJobs: async (params = {}) => {
    const res = await fetch(`${API_BASE}/api/jobs/search${buildQuery(params)}`, {
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Job search failed");
    return res.json();
  },

  // Plain paginated feed (public)
  getJobs: async (params = {}) => {
    const res = await fetch(`${API_BASE}/api/jobs${buildQuery(params)}`, {
      headers: getHeaders(true),
    });
    if (!res.ok) throw new Error("Failed to fetch jobs");
    return res.json();
  },

  // Source registry metadata (public)
  getSources: async () => {
    const res = await fetch(`${API_BASE}/api/jobs/sources`, { headers: getHeaders(false) });
    if (!res.ok) throw new Error("Failed to load sources");
    return res.json();
  },
};

// ========================================================
// Legacy Services
// ========================================================

export const uploadResume = async (file) => {
  const formData = new FormData();
  formData.append("resume", file);
  const res = await fetch(`${API_BASE}/api/resume/upload-resume`, {
    method: "POST",
    body: formData,
  });
  return res.json();
};

export const matchJobs = async (resumeId) => {
  const res = await fetch(`${API_BASE}/api/match-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeId }),
  });
  if (!res.ok) throw new Error("Match jobs failed");
  return res.json();
};

export const scrapeJobs = async (data) => {
  const res = await fetch(`${API_BASE}/api/scrape-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Scraping failed");
  return res.json();
};