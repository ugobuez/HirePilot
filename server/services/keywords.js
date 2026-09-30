/**
 * Keyword normalization for honest ATS matching (Addendum H §3).
 *
 * - Synonym groups: every variant maps to one canonical term, and we keep the
 *   display forms so we can mirror the job's wording when the resume supports it.
 * - Word-boundary + exact-phrase matching, light stemming.
 * - Repeat caps + density heuristics to detect keyword stuffing.
 */

export const SYNONYM_GROUPS = [
  ["javascript", "js", "ecmascript", "es6"],
  ["typescript", "ts"],
  ["node.js", "node", "nodejs"],
  ["redis", "redis cache", "redis caching"],
  ["react", "react.js", "reactjs"],
  ["react native", "react-native", "rn"],
  ["next.js", "nextjs", "next"],
  ["vue.js", "vue", "vuejs"],
  ["angular", "angularjs", "angular.js"],
  ["kubernetes", "k8s", "kube"],
  ["docker", "containers", "containerisation", "containerization"],
  ["ci/cd", "continuous integration", "continuous delivery", "continuous deployment"],
  ["github actions", "gh actions", "github action"],
  ["postgresql", "postgres", "psql"],
  ["mongodb", "mongo"],
  ["mysql", "mariadb"],
  ["aws", "amazon web services"],
  ["gcp", "google cloud platform", "google cloud"],
  ["azure", "microsoft azure"],
  ["rest api", "rest", "restful", "restful api", "restful apis"],
  ["graphql", "graph ql"],
  ["microservices", "micro services", "microservice architecture"],
  ["serverless", "lambda", "cloud functions"],
  ["terraform", "infrastructure as code", "iac"],
  ["git", "version control"],
  ["agile", "scrum", "kanban", "sprint planning"],
  ["machine learning", "ml"],
  ["artificial intelligence", "ai"],
  ["nlp", "natural language processing"],
  ["css", "css3", "css 3"],
  ["html", "html5", "html 5"],
  ["sass", "scss"],
  ["redux", "redux toolkit"],
  ["unit testing", "unit tests", "jest", "mocha"],
  ["tdd", "test driven development"],
  ["e2e", "end to end testing", "end-to-end testing"],
];

// Words that must never be treated as skills (job-post boilerplate noise).
export const STOPWORDS = new Set(
  ("a an the and or but if then else of in on at to for with without from by as is are was were be been " +
    "being have has had do does did will would shall should can could may might must not no nor so such than " +
    "that this these those it its we you they he she i our your their my me him her us them who whom which what " +
    "when where why how all any both each few more most other some only own same too very just also about " +
    "above after again against because before below between during further here once over under until up " +
    "down out off new work working works role job position company team teams year years experience " +
    "strong excellent good great ability able across etc via per using use used help helping build building " +
    "develop developing developed deliver delivering join joining please apply applicants candidate candidates " +
    "required requirements responsibility responsibilities qualification qualifications opportunity benefits " +
    "equal employer diversity inclusion include including etc.")
    .split(/\s+/)
    .filter(Boolean)
);

/** Lowercase, strip punctuation, collapse whitespace. */
export const normalizeText = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}+#./\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Canonical form of a keyword. Unknown terms are only stemmed if the stem is a
 * known term, so real words ending in "s" (redis, kubernetes) stay intact. */
export const canonical = (term) => {
  const n = normalizeText(term);
  if (!n) return "";
  if (CANONICAL.has(n)) return CANONICAL.get(n);
  if (n.length > 3 && n.endsWith("s") && !n.endsWith("ss")) {
    const stemmed = n.slice(0, -1);
    if (CANONICAL.has(stemmed)) return CANONICAL.get(stemmed);
  }
  return n;
};

/** Escape a string for safe use inside a RegExp. */
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const boundary = (term) =>
  new RegExp(`(^|[^\\p{L}\\p{N}+#./-])${esc(term)}([^\\p{L}\\p{N}+#./-]|$)`, "u");

/**
 * Does `text` support the given keyword?
 * Exact-phrase first (so "node" never matches "nodes"), then canonical aliases,
 * then the stemmed form. Returns the surface form actually found, or "".
 */
export const findSupport = (text, keyword) => {
  const hay = normalizeText(text);
  if (!hay) return "";
  const target = normalizeText(keyword);
  if (!target) return "";

  if (boundary(target).test(hay)) return target;

  const canon = canonical(target);
  const variants = new Set([canon]);
  for (const [alias, c] of CANONICAL) if (c === canon) variants.add(alias);
  for (const v of variants) {
    if (!v || v === target) continue;
    if (boundary(v).test(hay)) return v;
  }
  return "";
};

export const supportsKeyword = (text, keyword) => Boolean(findSupport(text, keyword));

/**
 * Term frequency of a keyword, capped so repeats cannot inflate the score
 * (keyword-stuffing defence). Uses a global regex and counts real occurrences.
 */
export const cappedFrequency = (text, keyword, cap = 3) => {
  const hay = normalizeText(text);
  const support = findSupport(hay, keyword);
  if (!support) return 0;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}+#./-])${esc(support)}([^\\p{L}\\p{N}+#./-]|$)`, "gu");
  return Math.min((hay.match(re) || []).length, cap);
};


// alias -> canonical
export const CANONICAL = new Map();

/**
 * Extract candidate keywords from free text: known aliases plus meaningful
 * multi-word tech phrases. Deterministic — no model required.
 */
export const extractKeywords = (text, { limit = 80 } = {}) => {
  const hay = normalizeText(text);
  const found = new Map(); // display -> canonical

  // multi-word aliases first so "node.js" wins over "node"
  for (const group of SYNONYM_GROUPS) {
    for (const variant of group) {
      if (!variant.includes(" ")) continue;
      if (boundary(variant).test(hay)) found.set(variant, group[0]);
    }
  }
  for (const [alias, c] of CANONICAL) {
    if (alias.includes(" ")) continue;
    if (boundary(alias).test(hay)) found.set(alias, c);
  }
  return [...found.entries()]
    .slice(0, limit)
    .map(([display, c]) => ({ display, canonical: c }));
};

/** Repeat/density profile used to flag keyword stuffing. */
export const densityProfile = (text) => {
  const hay = normalizeText(text);
  const tokens = hay.split(" ").filter(Boolean);
  const counts = new Map();
  for (const t of tokens) {
    if (STOPWORDS.has(t) || t.length < 3) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  const words = tokens.length || 1;
  let maxRepeat = 0;
  let repeatedTerms = 0;
  for (const c of counts.values()) {
    maxRepeat = Math.max(maxRepeat, c);
    if (c > 3) repeatedTerms++;
  }
  return {
    words,
    uniqueTerms: counts.size,
    lexicalDiversity: Number((counts.size / words).toFixed(3)),
    maxRepeat,
    repeatedTerms,
    stuffed: repeatedTerms >= 3 || maxRepeat >= 6,
  };
};

export default {
  SYNONYM_GROUPS,
  CANONICAL,
  STOPWORDS,
  normalizeText,
  canonical,
  findSupport,
  supportsKeyword,
  cappedFrequency,
  extractKeywords,
  densityProfile,
};

for (const group of SYNONYM_GROUPS) {
  for (const v of group) CANONICAL.set(v, group[0]);
}
