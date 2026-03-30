import { useState } from "react";
import { Form, Button, Spinner, Alert, Card } from "react-bootstrap";
import { UploadCloud, FileText, Send } from "lucide-react";
import axios from "axios";

function JobForm({ setResult }) {
  const [jobDesc, setJobDesc] = useState("");
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resume || !jobDesc) {
      setError("Please provide both your resume and the job description.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const formData = new FormData();
      formData.append("resume", resume);
      formData.append("jobDesc", jobDesc);

      const res = await axios.post("http://localhost:6900/api/analyze", formData);
      setResult(res.data);
    } catch (err) {
      setError("Analysis failed. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto border-0 shadow-lg" style={{ maxWidth: "800px", borderRadius: "24px" }}>
      <Card.Body className="p-4 p-md-5">
        {error && <Alert variant="danger" className="rounded-3 small">{error}</Alert>}
        
        <Form onSubmit={handleSubmit}>
          <div className="row g-4">
            {/* Resume Side */}
            <div className="col-md-5">
              <label className="fw-bold text-dark small mb-3 d-block text-uppercase">1. Resume Profile</label>
              <div className="upload-zone p-4 text-center border-dashed rounded-4 bg-light position-relative">
                <UploadCloud size={32} className="text-primary mb-2" />
                <p className="small text-muted mb-3">{resume ? resume.name : "Select PDF Resume"}</p>
                <Form.Control
                  type="file"
                  className="stretched-link opacity-0"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setResume(e.target.files[0])}
                />
                <Button variant="outline-primary" size="sm" className="rounded-pill px-3">Browse</Button>
              </div>
            </div>

            {/* Job Desc Side */}
            <div className="col-md-7 text-start">
              <label className="fw-bold text-dark small mb-3 d-block text-uppercase">2. Target Description</label>
              <div className="position-relative">
                <FileText size={18} className="position-absolute text-muted mt-3 ms-3" />
                <Form.Control
                  as="textarea"
                  rows={5}
                  className="ps-5 border-0 bg-light rounded-4 pt-3"
                  placeholder="Paste requirements here..."
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  style={{ fontSize: '0.95rem' }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-top text-center">
            <Button
              className="btn-primary rounded-pill px-5 py-2 fw-bold shadow-sm"
              type="submit"
              disabled={loading}
            >
              {loading ? <Spinner size="sm" className="me-2" /> : <Send size={18} className="me-2" />}
              {loading ? "Processing..." : "Analyze Match"}
            </Button>
          </div>
        </Form>
      </Card.Body>

      <style>{`
        .border-dashed { border: 2px dashed #e2e8f0; transition: 0.2s; }
        .border-dashed:hover { border-color: #2563eb; background: #eff6ff !important; }
      `}</style>
    </Card>
  );
}

export default JobForm;