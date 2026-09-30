import { canonical, findSupport, supportsKeyword, cappedFrequency, densityProfile, normalizeText } from "./keywords.js";

/**
 * Deterministic, explainable ATS scoring (Addendum H Ã‚§3).
 *
 * Rules that replace the old engine:
 *  - No constant fallbacks: an empty profile scores 0 on skills, not 72.
 *  - No double counting: must-have and nice-to-have are disjoint sets and each
 *    keyword is scored exactly once, in exactly one category.
 *  - Must-haves weigh more than nice-to-haves (3:1 by default).
 *  - Every number is returned with the reason that produced it.
 *  - Keyword stuffing lowers the score instead of inflating it.
 */

export const DEFAULT_WEIGHTS = {
  mustHave: 0.45,
  niceToHave: 0.15,
  title: 0.15,
  experience: 0.1,
  locationRemote: 0.075,
  visa: 0.075,
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const pct = (n) => Math.round(clamp01(n) * 100);

const MUST_PHRASES = [
  "must have", "must-have", "required", "requirement", "required skills", "you have",
  "we are looking for", "looking for", "you should have", "at minimum", "essential",
  "minimum qualification", "basic qualification", "you must", "mandatory",
];
const NICE_PHRASES = [
  "nice to have", "nice-to-have", "preferred", "preferred qualification", "bonus",
  "a plus", "desirable", "familiarity with", "exposure to", "ideally", "good to have",
];
const VISA_POSITIVE = [
  "visa sponsorship", "sponsorship available", "we sponsor", "will sponsor",
  "relocation package", "work permit provided", "global talent",
];
const VISA_NEGATIVE = [
  "no visa sponsorship", "not able to sponsor", "unable to sponsor",
  "must be authorized to work", "must already have the right to work",
  "security clearance required", "us citizen", "must be a us citizen", "no sponsorship",
];
const SENIORITY = ["junior", "mid", "senior", "lead", "principal", "staff"];

const stripBullet = (s) => String(s).replace(/^[\s\-*\u2022\u00b7|>\u2013\u2014]+/, "");
// "Requirements:" / "Nice to have:" / "Bonus:" — the label is not a requirement.
const LABEL_RE =
  /^(requirements?|required skills?|qualifications?|preferred qualifications?|nice to have|nice-to-have|good to have|bonus|skills?|must haves?)\s*[:\-\u2013]?\s*/i;

/**
 * Split a description into must-have vs nice-to-have requirement lines.
 *
 * Stateful by design: a bare "Nice to have:" heading moves every following line
 * into the nice-to-have bucket, exactly as a human reads the post.
 */
export const splitRequirements = (description) => {
  const lines = String(description || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const must = [];
  const nice = [];
  let bucket = must; // unlabelled requirements are must-haves

  for (const raw of lines) {
    const low = raw.toLowerCase();
    const body = stripBullet(raw).replace(LABEL_RE, "").trim();
    const isNiceText = NICE_PHRASES.some((p) => low.includes(p));
    const isMustText = MUST_PHRASES.some((p) => low.includes(p));

    // A heading with no content of its own only changes the bucket.
    if (body.length < 2) {
      if (isNiceText) bucket = nice;
      else if (isMustText) bucket = must;
      continue;
    }
    // An inline "Nice to have: GraphQL" belongs to nice-to-have.
    const target = isNiceText && !isMustText ? nice : bucket;
    target.push({ line: body, raw });
  }
  return { mustHave: must, niceToHave: nice };
};

// --- Term cleaning constants ---------------------------------------------
// A real skill keyword is short. Anything longer is prose, not a requirement.
const MAX_TERM_WORDS = 4;
// Repeatedly stripped leading filler ("of", "with", "a", "our", "you", ...).
const LEAD_NOISE =
  /^(?:and|or|the|a|an|of|in|on|at|to|for|with|plus|also|very|some|any|our|your|their|we|you|they|it|its|be|is|are|as|by|from|using|use|used|role|position|candidate|etc)\b[\s,]*/i;
// Words that describe a requirement but are never the keyword itself.
const FILLER =
  /\b(?:experience|experienced|knowledge|proficiency|proficient|expertise|expert|skills?|skilled|familiarity|familiar|strong|good|solid|excellent|great|level|years?|yrs?|ability|able|must|required|requirement|preferred|nice|have|has|hiring|hire|seeking|looking|join|apply|responsibilit(?:y|ies)|responsible|demonstrated|proven|understanding|comfortable|bonus|ideally|minimum)\b/gi;
// Prose/boilerplate guards: sentences, legal text and visa wording are not skills.
const PROSE =
  /\b(?:we|you|they|our|your|their|are|is|was|were|will|would|shall|should|could|may|might|does|did|sponsor|sponsorship|visa|visas|authorized|authorised|clearance|citizen|equal|opportunity|employer|benefits?|salary|compensation|remote|hybrid|on-?site|apply|application|interview|company|culture|mission|offer|offers|provide|provides|include|includes|ensure|support|drive|day|days|week|weeks|month|months)\b/i;
// Junk 1-3 letter tokens that are never skills.
const STOP_TERMS = new Set([
  "us", "uk", "eu", "etc", "and", "or", "the", "we", "you", "our", "it", "be", "is", "as",
  "of", "in", "on", "at", "to", "for", "with", "plus", "also", "new", "job", "role", "team",
  "work", "full", "part", "time", "other", "e.g", "i.e",
]);

/** Normalise a fragment into a candidate keyword. */
const cleanTerm = (raw) => {
  let s = String(raw || "")
    .replace(/\b\d+\s*\+?\s*(?:-\s*\d+\s*)?\s*(?:years?|yrs?)\b/gi, " ")
    .replace(/\([^)]*\)?/g, " ")
    .replace(/[^A-Za-z0-9+#./& -]/g, " ");
  let prev;
  do {
    prev = s;
    s = s.replace(LEAD_NOISE, "");
  } while (s !== prev);
  s = s.replace(FILLER, " ");
  do {
    prev = s;
    s = s.replace(LEAD_NOISE, "");
  } while (s !== prev);
  return s
    .replace(/^[\s\-*•·|,.;:]+|[\s\-*•·|,.;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

/** A term is usable only if it is short, has letters and is not prose. */
const isUsableTerm = (s) => {
  if (!s || s.length < 2 || s.length > 42) return false;
  const words = s.split(" ").filter(Boolean);
  if (!words.length || words.length > MAX_TERM_WORDS) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (STOP_TERMS.has(s.toLowerCase())) return false;
  if (PROSE.test(s)) return false;
  return true;
};

/** Parse a fragment ("3+ years of Kubernetes, Docker") into terms + years. */
const parseTerms = (fragments) => {
  const terms = new Map(); // canonical -> display
  let years = 0;
  for (const frag of fragments) {
    const text = String(frag).replace(/^[\s\-*\u2022\u00b7|>\u2013\u2014]+/, "");
    const y = text.match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)/i);
    if (y) years = Math.max(years, parseInt(y[1], 10));
    // Skills lists separate on commas, slashes and conjunctions/prepositions.
    for (const piece of text.split(/[,;|/]|\band\b|\bor\b|\bwith\b|\bof\b|\bin\b|\bto\b|\+|\s&\s/i)) {
      const cleaned = cleanTerm(piece);
      // Drop the years phrase itself, and anything that is still prose.
      if (!isUsableTerm(cleaned)) continue;
      const c = canonical(cleaned);
      if (!c || c.length < 2) continue;
      if (!terms.has(c)) terms.set(c, cleaned);
    }
  }
  return { terms: [...terms.entries()].map(([c, display]) => ({ canonical: c, display })), years };
};

/** Build the structured job requirement model. */
export const parseJob = (job) => {
  const description = String(job?.description || "");
  const title = String(job?.title || "");
  const combined = `${title}\n${description}`;
  // Keywords come from the body only — the title is scored by the title category,
  // so counting it here too would double-count role wording.
  const { mustHave, niceToHave } = splitRequirements(description);

  const mustTerms = parseTerms(mustHave.map((m) => m.line));
  const niceTerms = parseTerms(niceToHave.map((n) => n.line));

  // A must-have repeated in the nice-to-have list is counted once, in the
  // higher-weight must-have bucket (no double counting).
  const mustSet = new Set(mustTerms.terms.map((t) => t.canonical));
  const niceOnly = niceTerms.terms.filter((t) => !mustSet.has(t.canonical));

  const low = combined.toLowerCase();
  const visaPositive = VISA_POSITIVE.some((p) => low.includes(p));
  const visaNegative = VISA_NEGATIVE.some((p) => low.includes(p));
  const visaStance = visaPositive && !visaNegative ? "offers" : visaNegative && !visaPositive ? "none" : "unclear";

  const location = String(job?.location || "");
  // Work arrangement can be stated in the location field ("Remote (US)") or in
  // the body, so both are searched.
  const where = `${title}\n${location}\n${description}`;
  const remote = /\b(remote|anywhere|work from home|wfh|distributed)\b/i.test(where);
  const onsite = /\b(on-?site|in-?office|in person)\b/i.test(where) && !remote;
  const hybrid = !remote && /\bhybrid\b/i.test(where);
  const country = (location.split(/[,/|]/).pop() || "").trim().toLowerCase();

  const yearsMatch = combined.match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)/i);
  const yearsRequired = mustTerms.years || niceTerms.years || (yearsMatch ? parseInt(yearsMatch[1], 10) : 0);
  const titleSeniority = SENIORITY.find((k) => new RegExp(`\\b${k}\\b`, "i").test(title)) || null;

  return {
    title,
    mustHave: mustTerms.terms,
    niceToHave: niceOnly,
    yearsRequired,
    titleSeniority,
    remote,
    onsite,
    hybrid,
    location,
    country,
    visaStance,
    description,
  };
};

/** Score a set of keywords against the resume, returning an explainable result. */
const scoreKeywords = (requirements, resumeText, profileText) => {
  const haystack = `${resumeText}\n${profileText}`;
  const matched = [];
  const missing = [];
  const densityFlags = [];

  for (const req of requirements) {
    // Prefer a surface form the resume already uses (mirrors job wording when true).
    const inResume = findSupport(resumeText, req.canonical) || findSupport(resumeText, req.display);
    const inProfile = inResume ? "" : findSupport(profileText, req.canonical) || findSupport(profileText, req.display);
    const surface = inResume || inProfile;
    if (surface) {
      const freq = cappedFrequency(haystack, req.canonical);
      if (freq >= 3) {
        // Supported, but repeated far more than a human writes Ã¢â‚¬” flag, don't reward.
        densityFlags.push({ keyword: req.display, count: freq, capped: true });
      }
      matched.push({
        keyword: req.display,
        canonical: req.canonical,
        // Mirror the job's wording when it is genuinely true.
        display: req.display,
        source: inResume ? "resume" : "profile",
        repetitions: freq,
      });
    } else {
      missing.push({ keyword: req.display, canonical: req.canonical });
    }
  }
  const ratio = requirements.length ? matched.length / requirements.length : 0;
  return { matched, missing, ratio, total: requirements.length, densityFlags };
};

/** Title alignment via normalized token overlap (no fuzzy magic). */
const scoreTitle = (jobTitle, targetTitles) => {
  const norm = (s) => normalizeText(s).replace(/\b(a|an|the|senior|sr|junior|jr|lead|principal|staff)\b/g, " ").replace(/\s+/g, " ").trim();
  const jobTok = new Set(norm(jobTitle).split(" ").filter(Boolean));
  if (!jobTok.size) return { ratio: 0, matched: [], reason: "Job post has no title to compare." };

  const list = (Array.isArray(targetTitles) ? targetTitles : [targetTitles]).filter(Boolean);
  if (!list.length) {
    return { ratio: 0, matched: [], reason: "No target roles in your profile, so title fit is unscored." };
  }
  let best = { ratio: 0, matched: [] };
  for (const t of list) {
    const want = new Set(norm(t).split(" ").filter(Boolean));
    if (!want.size) continue;
    const matched = [...jobTok].filter((w) => want.has(w));
    // Jaccard-style overlap: symmetric, so a vague 1-word title cannot inflate.
    const ratio = matched.length / Math.max(jobTok.size, want.size);
    if (ratio > best.ratio) best = { ratio, matched };
  }
  return {
    ratio: best.ratio,
    matched: best.matched,
    reason: best.matched.length
      ? `Role title overlaps with "${best.matched.join(", ")}".`
      : "Role title does not overlap your target roles.",
  };
};

/** Years of experience from the resume + explicit profile value. */
const extractYears = (resume, profile) => {
  const explicit = Number(profile?.yearsOfExperience);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const dates = String(resume || "").match(/\b(19|20)\d{2}\b/g) || [];
  if (dates.length >= 2) {
    const years = dates.map((d) => parseInt(d, 10));
    return Math.max(0, Math.max(...years) - Math.min(...years));
  }
  return 0;
};

/**
 * Score a job for a candidate profile.
 *
 * @param {object} job { title, description, location, company }
 * @param {object} profile {
 *   resumeText, skillsList[], targetTitles[], yearsOfExperience,
 *   authorizedCountries[], needsSponsorship, remotePreference
 * }
 * @returns {object} full explainable score
 */
export const scoreJob = (job, profile, opts = {}) => {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const threshold = opts.threshold ?? 70;
  const parsed = parseJob(job);

  const resumeText = String(profile?.resumeText || "");
  const profileSkills = (Array.isArray(profile?.skillsList) ? profile.skillsList : []).map((s) => s.toLowerCase());
  const profileText = profileSkills.join(" ");

  // --- Categories (each keyword scored exactly once) ----------------------
  const must = scoreKeywords(parsed.mustHave, resumeText, profileText);
  const nice = scoreKeywords(parsed.niceToHave, resumeText, profileText);
  const title = scoreTitle(parsed.title, profile?.targetTitles || []);

  const years = extractYears(resumeText, profile);
  const experience = {
    required: parsed.yearsRequired,
    available: years,
    ratio: parsed.yearsRequired ? clamp01(years / parsed.yearsRequired) : 1,
    reason: parsed.yearsRequired
      ? years >= parsed.yearsRequired
        ? `Resume shows ~${years} years against ${parsed.yearsRequired} required.`
        : `Resume shows ~${years} years; the post asks for ${parsed.yearsRequired}.`
      : "No explicit years requirement in the post.",
  };

  const wantsRemote = profile?.remotePreference || "remote";
  const location = { remote: parsed.remote, onsite: parsed.onsite, hybrid: parsed.hybrid, country: parsed.country, ratio: 0, reason: "" };
  if (parsed.remote) {
    location.ratio = wantsRemote === "onsite" ? 0.5 : 1;
    location.reason = "Remote role.";
  } else if (parsed.hybrid) {
    location.ratio = wantsRemote === "remote" ? 0.5 : 0.9;
    location.reason = "Hybrid role.";
  } else if (parsed.onsite) {
    location.ratio = 0.2;
    location.reason = "On-site role.";
  } else {
    location.ratio = 0.6;
    location.reason = "Work arrangement not stated.";
  }
  if (parsed.country && Array.isArray(profile?.authorizedCountries) && profile.authorizedCountries.length) {
    const authorized = profile.authorizedCountries.some((c) => String(c).trim().toLowerCase() === parsed.country);
    if (!authorized) {
      location.ratio = Math.min(location.ratio, 0.3);
      location.reason += ` Not a country you are authorized to work in (${parsed.country}).`;
    }
  }

  const visa = { stance: parsed.visaStance, needs: Boolean(profile?.needsSponsorship), ratio: 1, reason: "", review: false };
  if (!visa.needs) {
    visa.reason = "You do not need sponsorship.";
  } else if (parsed.visaStance === "offers") {
    visa.reason = "Post states sponsorship is available.";
  } else if (parsed.visaStance === "none") {
    visa.ratio = 0;
    visa.reason = "Post says sponsorship is not available.";
  } else {
    visa.ratio = 0.5;
    visa.review = true;
    visa.reason = "Sponsorship stance is unclear Ã¢â‚¬” this needs your review before anything is sent.";
  }

  const density = densityProfile(`${resumeText} ${profileText}`);
  const stuffing = Boolean(density.stuffed);

  // --- Weighted total ------------------------------------------------------
  const categories = {
    mustHave: { score: pct(must.ratio), weight: weights.mustHave, detail: must },
    niceToHave: { score: pct(nice.ratio), weight: weights.niceToHave, detail: nice },
    title: { score: pct(title.ratio), weight: weights.title, detail: title },
    experience: { score: pct(experience.ratio), weight: weights.experience, detail: experience },
    locationRemote: { score: pct(location.ratio), weight: weights.locationRemote, detail: location },
    visa: { score: pct(visa.ratio), weight: weights.visa, detail: visa },
  };

  let overall = 0;
  for (const c of Object.values(categories)) overall += (c.score / 100) * c.weight;

  // Keyword stuffing penalty: a real, visible reduction Ã¢â‚¬” not a silent cap.
  if (stuffing) {
    overall *= 0.9;
  }
  const score = Math.round(clamp01(overall) * 100);

  const reasons = [];
  if (must.total) {
    reasons.push(
      `${must.matched.length}/${must.total} must-have skills supported` +
        (must.missing.length ? `; missing ${must.missing.map((m) => m.keyword).join(", ")}.` : ".")
    );
  }
  if (nice.total) reasons.push(`${nice.matched.length}/${nice.total} nice-to-have skills supported.`);
  reasons.push(title.reason);
  reasons.push(experience.reason);
  reasons.push(location.reason);
  if (visa.needs) reasons.push(visa.reason);
  if (stuffing) {
    reasons.push(
      `Keyword density looks unnaturally high (${density.maxRepeat} repeats of one term), so the score was reduced.`
    );
  }

  const skipReasons = [];
  if (visa.ratio === 0) skipReasons.push(visa.reason);
  if (must.total && must.ratio === 0) skipReasons.push("None of the must-have skills are supported by your resume.");

  return {
    score,
    pass: score >= threshold && skipReasons.length === 0,
    threshold,
    categories: Object.fromEntries(
      Object.entries(categories).map(([k, v]) => [k, { score: v.score, weight: v.weight }])
    ),
    matchedKeywords: [...must.matched, ...nice.matched],
    missingKeywords: [...must.missing, ...nice.missing],
    mustHaveMatched: must.matched,
    mustHaveMissing: must.missing,
    niceToHaveMatched: nice.matched,
    niceToHaveMissing: nice.missing,
    reasons,
    skipReasons,
    needsReview: visa.review,
    density,
    parsedJob: {
      title: parsed.title,
      yearsRequired: parsed.yearsRequired,
      remote: parsed.remote,
      hybrid: parsed.hybrid,
      onsite: parsed.onsite,
      country: parsed.country,
      visaStance: parsed.visaStance,
      mustHaveCount: parsed.mustHave.length,
      niceToHaveCount: parsed.niceToHave.length,
    },
  };
};

/**
 * Addendum H Ã‚§3: the re-scan target is a GOAL, not a gate. If the score cannot
 * rise without inventing skills, we do not fabricate Ã¢â‚¬” we report the ceiling.
 */
export const rescScanTarget = (job, profile, baseScore) => {
  const result = scoreJob(job, profile);
  const ceiling = result.matchedKeywords.length;
  const total = ceiling + result.missingKeywords.length;
  return {
    base: baseScore ?? result.score,
    rescanned: result.score,
    reachableWithoutNewClaims: total ? Math.round((ceiling / total) * 100) : result.score,
    blockedByMissingSkills: result.missingKeywords.map((m) => m.keyword),
    note: result.missingKeywords.length
      ? "Score cannot reach 100% without skills you have not listed. Nothing was invented."
      : "Every keyword in this post is already supported by your resume.",
    decision: result.pass ? "apply" : "skip",
  };
};

export default { scoreJob, parseJob, splitRequirements, rescScanTarget, DEFAULT_WEIGHTS };

