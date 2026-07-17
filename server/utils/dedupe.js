/**
 * Deduplicate job listings.
 *
 * Merges duplicates using a composite key:
 *   - title + company + location
 *   - identical apply URL
 *   - high description similarity (token Jaccard >= threshold)
 *
 * Keeps the richest copy (prefers one with applyLink / more skills / higher salary).
 *
 * @param {object[]} jobs
 * @param {object} [opts] { similarityThreshold = 0.85 }
 * @returns {object[]}
 */
const tokenize = (text = "") =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const jaccard = (a, b) => {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const t of new Set(a)) if (setB.has(t)) inter++;
  return inter / (new Set(a).size + setB.size - inter);
};

export const dedupeJobs = (jobs = [], opts = {}) => {
  const threshold = opts.similarityThreshold ?? 0.85;
  const seen = new Map(); // baseKey -> job
  const out = [];

  const baseKey = (j) =>
    `${String(j.title || "").trim().toLowerCase()}|${String(j.company || "").trim().toLowerCase()}|${String(j.location || "").trim().toLowerCase()}`;

  const richer = (a, b) => {
    const score = (j) =>
      (j.applyLink ? 2 : 0) +
      (j.salary && j.salary !== "Not specified" ? 2 : 0) +
      ((j.skills || []).length || 0) +
      (j.description ? Math.min(20, j.description.length / 500) : 0);
    return score(b) > score(a) ? b : a;
  };

  for (const j of jobs) {
    if (!j || !j.title) continue;

    const key = baseKey(j);
    const url = (j.applyLink || "").trim().toLowerCase();

    let match = seen.get(key);

    // Same apply URL is a strong duplicate signal
    if (!match && url) {
      match = out.find((o) => (o.applyLink || "").trim().toLowerCase() === url);
    }

    // Description similarity (token Jaccard)
    if (!match) {
      const ja = tokenize(j.description || j.title);
      match = out.find((o) => {
        const jb = tokenize(o.description || o.title);
        return jaccard(ja, jb) >= threshold;
      });
    }

    if (match) {
      const merged = richer(match, j);
      Object.assign(match, merged);
      match._duplicateCount = (match._duplicateCount || 1) + 1;
      if (url && !match.applyLink) match.applyLink = j.applyLink;
    } else {
      const copy = { ...j, _duplicateCount: 1 };
      seen.set(key, copy);
      out.push(copy);
    }
  }

  return out;
};
