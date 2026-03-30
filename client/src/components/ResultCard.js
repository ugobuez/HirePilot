import { Card, Badge } from "react-bootstrap";

function ResultCard({ result }) {
  if (!result) return null;

  return (
    <Card
      className="mt-4 p-4 shadow-sm"
      style={{ maxWidth: "700px", margin: "0 auto" }}
    >
      <h4 className="mb-3">
        Match Score:{" "}
        <Badge bg={result.matchScore > 70 ? "success" : "warning"}>
          {result.matchScore}%
        </Badge>
      </h4>

      <hr />

      <h5>Missing Skills</h5>
      {result.missingSkills.length === 0 ? (
        <p className="text-success">You're a strong match 🎉</p>
      ) : (
        <ul>
          {result.missingSkills.map((skill, i) => (
            <li key={i}>{skill}</li>
          ))}
        </ul>
      )}

      <hr />

      <h5>Generated Cover Letter</h5>
      <p style={{ whiteSpace: "pre-line" }}>{result.coverLetter}</p>
    </Card>
  );
}

export default ResultCard;