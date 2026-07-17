import React, { useEffect, useState } from "react";
import { Zap, Play, Settings, RefreshCw, ShieldCheck, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { automationService } from "../services/api";

const NAV_ITEMS = [
  { id: "discovery", label: "Discovery" },
  { id: "analyzer", label: "Analyzer" },
  { id: "applications", label: "Applications" },
  { id: "automation", label: "Automation" },
];

const AutomationPanel = ({ onNavigate }) => {
  const [status, setStatus] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [minAts, setMinAts] = useState(70);
  const [interval, setIntervalVal] = useState(30);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const data = await automationService.getAutoApplyStatus();
      setStatus(data);
      const s = data.settings || {};
      setEnabled(!!s.autoApplyEnabled);
      setMinAts(s.minAts ?? 70);
      setIntervalVal(s.autoApplyInterval ?? 30);
      setRemoteOnly(!!s.remoteOnly);
      setKeywords((s.keywords || []).join(", "));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await automationService.setAutoApplySettings({
        enabled,
        autoApplyEnabled: enabled,
        minAts: Number(minAts),
        autoApplyInterval: Number(interval),
        remoteOnly,
        keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const run = async (dryRun) => {
    setRunning(true);
    setError("");
    setRunSummary(null);
    try {
      const res = await automationService.autoApplyRun(dryRun, 5);
      setRunSummary(res);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="glass-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <div className="d-flex align-items-center justify-content-center rounded-3" style={{ width: 40, height: 40, background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}>
            <Zap size={18} className="text-white" />
          </div>
          <h4 className="fw-bold mb-0">Auto-Apply Engine</h4>
        </div>
        <button className="btn btn-outline-secondary btn-sm rounded-pill" onClick={load}><RefreshCw size={14} className="me-1" />Refresh</button>
      </div>

      {/* Daily limit + last run */}
      {status && (
        <div className="row g-2 mb-4">
          <div className="col-6 col-md-3">
            <div className="p-3 rounded-3 text-center" style={{ background: "#eff6ff" }}>
              <div className="fw-bold fs-4" style={{ color: "#1d4ed8" }}>{status.remaining}/{status.dailyLimit}</div>
              <small className="text-muted">Applications left today</small>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="p-3 rounded-3 text-center" style={{ background: status.settings?.autoApplyEnabled ? "#dcfce7" : "#f3f4f6" }}>
              <div className="fw-bold fs-4" style={{ color: status.settings?.autoApplyEnabled ? "#15803d" : "#6b7280" }}>
                {status.settings?.autoApplyEnabled ? "ON" : "OFF"}
              </div>
              <small className="text-muted">Auto-Apply</small>
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="p-3 rounded-3 h-100 d-flex align-items-center gap-2" style={{ background: "#fff7ed" }}>
              <Clock size={18} className="text-warning" />
              <small className="text-muted mb-0">
                Last run: {status.lastAutoApplyAt ? new Date(status.lastAutoApplyAt).toLocaleString() : "Never"}
              </small>
            </div>
          </div>
        </div>
      )}

      {error && <div className="alert alert-danger py-2 small">{error}</div>}

      {/* Config */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold">Minimum ATS Match (%)</label>
          <input type="number" min={0} max={100} className="form-control" value={minAts} onChange={(e) => setMinAts(e.target.value)} />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold">Run Interval (minutes)</label>
          <input type="number" min={5} max={1440} className="form-control" value={interval} onChange={(e) => setIntervalVal(e.target.value)} />
        </div>
        <div className="col-12 col-md-8">
          <label className="form-label small fw-semibold">Preferred Keywords (comma-separated)</label>
          <input className="form-control" placeholder="React, Node.js, Remote" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </div>
        <div className="col-12 col-md-4 d-flex align-items-end">
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" id="remoteOnly" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
            <label className="form-check-label" htmlFor="remoteOnly">Remote only</label>
          </div>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-4">
        <div className="form-check form-switch me-3">
          <input className="form-check-input" type="checkbox" id="enableAA" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <label className="form-check-label fw-semibold" htmlFor="enableAA">Enable scheduled auto-apply</label>
        </div>
        <button className="btn btn-gradient-blue btn-sm rounded-pill px-4 fw-bold" disabled={saving} onClick={save}>
          <Settings size={14} className="me-1" />{saving ? "Saving…" : "Save Settings"}
        </button>
        <button className="btn btn-outline-secondary btn-sm rounded-pill px-4 fw-bold" disabled={running} onClick={() => run(true)}>
          <Play size={14} className="me-1" />Dry Run
        </button>
        <button className="btn btn-gradient-orange btn-sm rounded-pill px-4 fw-bold" disabled={running} onClick={() => run(false)}>
          <Zap size={14} className="me-1" />{running ? "Running…" : "Run Auto-Apply Now"}
        </button>
      </div>

      <div className="d-flex align-items-center gap-2 mb-3 text-muted small">
        <ShieldCheck size={14} className="text-success" />
        Hallucination-safe tailoring — applications are logged with tailored resume &amp; cover letter.
      </div>

      {/* Run summary */}
      {runSummary && (
        <div className="border rounded-3 p-3">
          <div className="d-flex align-items-center gap-2 mb-2">
            <CheckCircle2 size={18} className="text-success" />
            <span className="fw-bold">Last Run {runSummary.dryRun ? "(Dry Run)" : ""}</span>
          </div>
          <div className="d-flex gap-4 mb-2">
            <span><strong className="text-success">{runSummary.applied || 0}</strong> applied</span>
            <span><strong className="text-warning">{runSummary.skipped || 0}</strong> skipped</span>
            <span><strong>{runSummary.eligible || 0}</strong> eligible of {runSummary.found || 0}</span>
          </div>
          {runSummary.jobs?.length > 0 && (
            <div className="small">
              {runSummary.jobs.slice(0, 6).map((j, i) => (
                <div key={i} className="d-flex justify-content-between border-top py-1">
                  <span className="text-truncate me-2">{j.title} · {j.company}</span>
                  <span className={j.status === "Applied" ? "text-success" : "text-warning"}>{j.status}{j.ats != null ? ` · ${j.ats}%` : ""}</span>
                </div>
              ))}
            </div>
          )}
          {runSummary.errors?.length > 0 && (
            <div className="text-danger small mt-2"><AlertTriangle size={12} className="me-1" />{runSummary.errors.length} error(s)</div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutomationPanel;
export { NAV_ITEMS };
