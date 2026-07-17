import React, { useState } from "react";
import { authService } from "../services/api";

const OnboardingForm = ({ user, onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [extracted, setExtracted] = useState(null);

  const [formData, setFormData] = useState({
    fullName: user?.onboardingDetails?.fullName || "",
    phone: user?.onboardingDetails?.phone || "",
    linkedInUrl: user?.onboardingDetails?.linkedInUrl || "",
    gitHubUrl: user?.onboardingDetails?.gitHubUrl || "",
    personalWebsite: user?.onboardingDetails?.personalWebsite || "",
    isAuthorizedToWorkInUS: user?.onboardingDetails?.isAuthorizedToWorkInUS || false,
    requiresSponsorship: user?.onboardingDetails?.requiresSponsorship || true,
    employmentTypePref: user?.onboardingDetails?.employmentTypePref || "Full-Time",
    location: user?.onboardingDetails?.location || "Nigeria",
    salaryExpectations: user?.onboardingDetails?.salaryExpectations || "",
    skillsList: user?.onboardingDetails?.skillsList?.join(", ") || "",
    yearsOfExperience: user?.onboardingDetails?.yearsOfExperience || 0,
    baseResumeText: user?.baseResumeText || "",
  });

  const updateField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handleExtract = async () => {
    if (!resumeFile) {
      setError("Please choose your resume file first.");
      return;
    }
    setExtracting(true);
    setError("");
    try {
      const data = await authService.extractResume(resumeFile);
      const p = data.profile || {};
      const resumeText = data.resumeText || "";
      setExtracted(p);
      setFormData((prev) => ({
        ...prev,
        fullName: p.fullName || prev.fullName,
        phone: p.phone || prev.phone,
        linkedInUrl: p.linkedInUrl || prev.linkedInUrl,
        gitHubUrl: p.gitHubUrl || prev.gitHubUrl,
        personalWebsite: p.personalWebsite || prev.personalWebsite,
        location: p.location || prev.location || "Nigeria",
        skillsList: (p.skills && p.skills.length ? p.skills : []).join(", ") || prev.skillsList,
        yearsOfExperience: p.yearsOfExperience || prev.yearsOfExperience,
        baseResumeText: resumeText,
      }));
      setStep(2);
    } catch (err) {
      setError(err.message || "Could not read the resume. You can still continue and fill details manually.");
    } finally {
      setExtracting(false);
    }
  };

  const handleNext = () => {
    setError("");
    if (step === 1 && !formData.baseResumeText) {
      setError("Upload and extract your resume (or paste it in the final step).");
      return;
    }
    if (step === 2 && !formData.fullName) {
      setError("Full name is required");
      return;
    }
    if (step === 2 && !formData.phone) {
      setError("Phone number is required");
      return;
    }
    setStep((prev) => Math.min(prev + 1, 4));
  };

  const handlePrev = () => {
    setError("");
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const onboardingData = {
        onboardingDetails: {
          fullName: formData.fullName,
          phone: formData.phone,
          location: formData.location,
          isAuthorizedToWorkInUS: formData.isAuthorizedToWorkInUS,
          requiresSponsorship: formData.requiresSponsorship,
          employmentTypePref: formData.employmentTypePref,
          salaryExpectations: formData.salaryExpectations,
          linkedInUrl: formData.linkedInUrl,
          gitHubUrl: formData.gitHubUrl,
          personalWebsite: formData.personalWebsite,
          skillsList: formData.skillsList
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          yearsOfExperience: Number(formData.yearsOfExperience),
        },
        baseResumeText: formData.baseResumeText,
      };
      await authService.updateOnboarding(onboardingData);
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isComplete =
    user?.onboardingDetails?.fullName &&
    user?.onboardingDetails?.phone &&
    user?.onboardingDetails?.skillsList?.length > 0 &&
    user?.baseResumeText;

  if (isComplete && !user?.onboardingDetails?.fullName?.includes("(editing)")) {
    return null;
  }

  const steps = [
    { num: 1, label: "Resume" },
    { num: 2, label: "Details" },
    { num: 3, label: "Preferences" },
    { num: 4, label: "Finish" },
  ];

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="d-flex justify-content-center mb-4">
            {steps.map((s, i) => (
              <React.Fragment key={s.num}>
                <div className="text-center">
                  <div
                    className={`rounded-circle d-flex align-items-center justify-content-center fw-bold ${
                      step >= s.num ? "bg-primary text-white" : "bg-light text-muted"
                    }`}
                    style={{ width: 40, height: 40 }}
                  >
                    {s.num}
                  </div>
                  <small className="d-block mt-1 text-muted">{s.label}</small>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className="align-self-center mx-3"
                    style={{ width: 60, height: 2, backgroundColor: step > s.num ? "#2563eb" : "#dee2e6" }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="card shadow border-0 rounded-4">
            <div className="card-body p-4">
              <h4 className="fw-bold mb-4">
                {step === 1 && "Upload Your Resume"}
                {step === 2 && "Your Details"}
                {step === 3 && "Job Preferences"}
                {step === 4 && "Review & Finish"}
              </h4>

              {error && <div className="alert alert-danger py-2 small">{error}</div>}

              {/* Step 1: Resume upload + AI extract */}
              {step === 1 && (
                <div className="row g-3">
                  <div className="col-12">
                    <label className="fw-semibold d-block mb-2">
                      We'll read your resume and pre-fill the rest.
                    </label>
                    <div className="upload-zone p-4 text-center border-dashed rounded-4 bg-light">
                      <input
                        type="file"
                        className="form-control"
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={(e) => setResumeFile(e.target.files[0])}
                      />
                      <p className="small text-muted mt-2 mb-0">
                        {resumeFile ? resumeFile.name : "PDF, DOCX or TXT"}
                      </p>
                    </div>
                    <button
                      className="btn btn-gradient-orange rounded-pill px-4 mt-3 fw-semibold"
                      onClick={handleExtract}
                      disabled={extracting || !resumeFile}
                    >
                      {extracting ? "Reading resume…" : "Extract with AI"}
                    </button>
                  </div>

                  {extracted && (
                    <div className="col-12">
                      <div className="border rounded-3 p-3 bg-light">
                        <div className="fw-semibold mb-1">Extracted from resume</div>
                        <div className="small text-muted">
                          <div><strong>Name:</strong> {extracted.fullName || "—"}</div>
                          <div><strong>Skills:</strong> {(extracted.skills || []).join(", ") || "—"}</div>
                          <div><strong>Location:</strong> {extracted.location || "—"}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="col-12">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="noResume"
                        checked={!!formData.baseResumeText}
                        onChange={(e) => {
                          if (!e.target.checked) return;
                          setError("");
                        }}
                      />
                      <label className="form-check-label small text-muted" htmlFor="noResume">
                        Prefer to paste your resume text manually instead? Do it in the final step.
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Details */}
              {step === 2 && (
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Full Name *</label>
                    <input type="text" className="form-control" value={formData.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Phone *</label>
                    <input type="tel" className="form-control" value={formData.phone}
                      onChange={(e) => updateField("phone", e.target.value)} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">LinkedIn URL</label>
                    <input type="url" className="form-control" placeholder="https://linkedin.com/in/..."
                      value={formData.linkedInUrl} onChange={(e) => updateField("linkedInUrl", e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">GitHub URL</label>
                    <input type="url" className="form-control" placeholder="https://github.com/..."
                      value={formData.gitHubUrl} onChange={(e) => updateField("gitHubUrl", e.target.value)} />
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">Personal Website</label>
                    <input type="url" className="form-control" placeholder="https://..."
                      value={formData.personalWebsite} onChange={(e) => updateField("personalWebsite", e.target.value)} />
                  </div>
                </div>
              )}

              {/* Step 3: Preferences */}
              {step === 3 && (
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Location</label>
                    <input type="text" className="form-control" value={formData.location}
                      onChange={(e) => updateField("location", e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Employment Type</label>
                    <select className="form-select" value={formData.employmentTypePref}
                      onChange={(e) => updateField("employmentTypePref", e.target.value)}>
                      <option value="Full-Time">Full-Time</option>
                      <option value="Contract">Contract</option>
                      <option value="Both">Both</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Salary Expectations</label>
                    <input type="text" className="form-control" placeholder="e.g. $80,000 - $120,000"
                      value={formData.salaryExpectations} onChange={(e) => updateField("salaryExpectations", e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Years of Experience</label>
                    <input type="number" className="form-control" min="0" max="50" value={formData.yearsOfExperience}
                      onChange={(e) => updateField("yearsOfExperience", e.target.value)} />
                  </div>
                  <div className="col-12">
                    <div className="form-check form-switch">
                      <input className="form-check-input" type="checkbox" checked={formData.isAuthorizedToWorkInUS}
                        onChange={(e) => updateField("isAuthorizedToWorkInUS", e.target.checked)} />
                      <label className="form-check-label fw-semibold">Authorized to work in the US?</label>
                    </div>
                  </div>
                  <div className="col-12">
                    <div className="form-check form-switch">
                      <input className="form-check-input" type="checkbox" checked={formData.requiresSponsorship}
                        onChange={(e) => updateField("requiresSponsorship", e.target.checked)} />
                      <label className="form-check-label fw-semibold">Requires visa sponsorship?</label>
                    </div>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">Technical Skills (comma separated) *</label>
                    <textarea className="form-control" rows="3" placeholder="React, Node.js, TypeScript, Python, AWS..."
                      value={formData.skillsList} onChange={(e) => updateField("skillsList", e.target.value)} />
                    <small className="text-muted">Pre-filled from your resume — edit if needed.</small>
                  </div>
                </div>
              )}

              {/* Step 4: Review / resume text */}
              {step === 4 && (
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label fw-semibold">Master Resume Text</label>
                    <textarea className="form-control" rows="12"
                      placeholder="Paste your full resume text here…"
                      value={formData.baseResumeText}
                      onChange={(e) => updateField("baseResumeText", e.target.value)} />
                    <small className="text-muted">
                      Used to generate tailored versions for each job. Pre-filled from your upload.
                    </small>
                  </div>
                </div>
              )}

              <div className="d-flex justify-content-between mt-4">
                <div>
                  {step > 1 && (
                    <button className="btn btn-outline-secondary rounded-pill px-4" onClick={handlePrev}>
                      Previous
                    </button>
                  )}
                </div>
                <div>
                  {step < 4 ? (
                    <button className="btn btn-primary rounded-pill px-4 fw-semibold" onClick={handleNext}>
                      Next
                    </button>
                  ) : (
                    <button className="btn btn-success rounded-pill px-4 fw-semibold" onClick={handleSubmit} disabled={loading}>
                      {loading ? "Saving..." : "Complete Setup"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .border-dashed { border: 2px dashed #e2e8f0; transition: 0.2s; }
        .border-dashed:hover { border-color: #2563eb; background: #eff6ff !important; }
      `}</style>
    </div>
  );
};

export default OnboardingForm;
