import Application from "../models/Application.js";
import User from "../models/User.js";

// POST /api/v1/applications - Create a new application
export const createApplication = async (req, res) => {
  try {
    const appData = {
      ...req.body,
      userId: req.user._id,
      history: [
        {
          status: req.body.status || "Scraped",
          changedAt: new Date(),
          note: "Application created",
        },
      ],
    };

    if (appData.status === "Applied") {
      appData.appliedAt = new Date();
    }

    const app = await Application.create(appData);
    res.status(201).json(app);
  } catch (err) {
    console.error("❌ Error creating application:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/applications - Get all applications for current user
export const getApplications = async (req, res) => {
  try {
    const filter = { userId: req.user._id };

    // Optional status filter
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const apps = await Application.find(filter).sort({ createdAt: -1 });
    res.json(apps);
  } catch (err) {
    console.error("❌ Error fetching applications:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/applications/stats - Get dashboard analytics
export const getApplicationStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const apps = await Application.find({ userId });

    const byStatus = {};
    const bySource = {};
    const companies = {};
    const skills = {};
    let atsSum = 0, atsCount = 0;
    let today = 0, week = 0, interviews = 0, offers = 0, applied = 0, rejected = 0, accepted = 0;
    const timeline = {};

    for (const a of apps) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      bySource[a.source] = (bySource[a.source] || 0) + 1;
      companies[a.company] = (companies[a.company] || 0) + 1;
      if (a.matchRate != null) { atsSum += a.matchRate; atsCount++; }
      const d = (a.createdAt || now).toISOString().slice(0, 10);
      timeline[d] = (timeline[d] || 0) + 1;
      if (new Date(a.createdAt) >= startOfToday) today++;
      if (new Date(a.createdAt) >= startOfWeek) week++;
      if (["Applied", "Assessment", "Phone Screen", "Technical", "Hiring Manager", "Interviewing", "Final Interview", "Negotiation"].includes(a.status)) applied++;
      if (["Interviewing", "Phone Screen", "Technical", "Hiring Manager", "Final Interview", "Assessment"].includes(a.status)) interviews++;
      if (a.status === "Offered") offers++;
      if (a.status === "Accepted") accepted++;
      if (a.status === "Rejected") rejected++;
    }

    const total = apps.length;
    const responseRate = applied > 0 ? Math.round(((interviews + offers + accepted) / applied) * 100) : 0;
    const successRate = total > 0 ? Math.round(((offers + accepted) / total) * 100) : 0;
    const avgAts = atsCount > 0 ? Math.round(atsSum / atsCount) : 0;

    const topCompanies = Object.entries(companies).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }));
    const topSkills = Object.entries(skills).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
    const timelineArr = Object.entries(timeline).sort().map(([date, count]) => ({ date, count }));

    res.json({
      total,
      applicationsToday: today,
      applicationsThisWeek: week,
      applied,
      interviews,
      offers,
      accepted,
      rejected,
      responseRate,
      successRate,
      avgAts,
      byStatus,
      bySource,
      topCompanies,
      topSkills,
      timeline: timelineArr,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/v1/applications/:id/status - Update application status
export const updateApplicationStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = [
      "Scraped", "Saved", "Interested", "Tailoring", "Queued", "Applied",
      "Assessment", "Phone Screen", "Technical", "Hiring Manager", "Interviewing",
      "Final Interview", "Negotiation", "Offered", "Accepted", "Rejected",
      "Withdrawn", "Ghosted", "Archived",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }

    const updateData = {
      status,
      $push: {
        history: {
          status,
          changedAt: new Date(),
          note: note || `Status changed to ${status}`,
        },
      },
    };

    if (status === "Applied") {
      updateData.appliedAt = new Date();
    }

    const app = await Application.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updateData,
      { new: true }
    );

    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.json(app);
  } catch (err) {
    console.error("❌ Update error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/v1/applications/:id - Update full application
export const updateApplication = async (req, res) => {
  try {
    const app = await Application.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true }
    );

    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/v1/applications/:id - Delete an application
export const deleteApplication = async (req, res) => {
  try {
    const app = await Application.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.json({ message: "Application deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/applications/apply - Manual apply flow
export const manualApply = async (req, res) => {
  try {
    const { jobTitle, company, location, jobDescription, source } = req.body;

    const app = await Application.create({
      userId: req.user._id,
      jobTitle,
      company,
      location,
      jobDescription,
      source: source || "Manual",
      status: "Scraped",
      history: [
        {
          status: "Scraped",
          changedAt: new Date(),
          note: "Manually added job application",
        },
      ],
    });

    res.status(201).json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/applications/run-tailor - Tailor for a specific application
export const runTailor = async (req, res) => {
  try {
    const app = await Application.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    const user = await User.findById(req.user._id);
    if (!user.baseResumeText) {
      return res.status(400).json({ error: "No master resume found. Please upload first." });
    }

    // Dynamically import to avoid circular deps
    const { scanJobDescription } = await import("../middleware/services/jobscanService.js");
    const { tailorForJob } = await import("../middleware/services/tailorService.js");

    // Run job scan
    const scanResult = await scanJobDescription(user, app.jobDescription || "");

    // Tailor resume + cover letter
    const tailored = await tailorForJob(
      user,
      scanResult,
      app.jobDescription || "",
      app.jobTitle,
      app.company
    );

    // Update application
    app.tailoredResumeText = tailored.tailoredResumeText;
    app.coverLetterText = tailored.coverLetterText;
    app.matchRate = scanResult.overallScore;
    app.status = "Tailored";
    app.history.push({
      status: "Tailored",
      changedAt: new Date(),
      note: `Resume tailored. Match rate: ${scanResult.overallScore}%`,
    });

    await app.save();

    res.json({
      application: app,
      scanResult,
    });
  } catch (err) {
    console.error("❌ runTailor error:", err.message);
    res.status(500).json({ error: err.message });
  }
};