/**
 * Role Expansion Service
 * Analyzes a user's base skills and expands their search targets
 * to cast a wider net for job matching.
 */

// Role mapping definitions
const ROLE_MAPPINGS = {
  frontend: {
    direct: ["Frontend Engineer", "React Developer", "Web Developer", "Frontend Developer"],
    adjacent: [
      { role: "Full-Stack Developer", condition: "backend" },
      { role: "TypeScript Developer", condition: "typescript" },
      { role: "JavaScript Engineer", condition: "javascript" },
    ],
    crossFunctional: ["UI/UX Engineer", "Solutions Engineer", "Web Engineer"],
  },
  backend: {
    direct: ["Backend Engineer", "Node.js Developer", "API Developer", "Backend Developer"],
    adjacent: [
      { role: "Full-Stack Developer", condition: "frontend" },
      { role: "DevOps Engineer", condition: "devops" },
      { role: "Systems Engineer", condition: "systems" },
    ],
    crossFunctional: ["Solutions Engineer", "Technical Engineer", "Software Engineer"],
  },
  fullstack: {
    direct: ["Full-Stack Developer", "Full-Stack Engineer", "Software Engineer"],
    adjacent: [
      { role: "Frontend Engineer", condition: "react" },
      { role: "Backend Engineer", condition: "node" },
      { role: "Technical Lead", condition: "leadership" },
    ],
    crossFunctional: ["Solutions Engineer", "Web Engineer", "Application Engineer"],
  },
  mobile: {
    direct: ["Mobile Developer", "React Native Developer", "iOS Developer", "Android Developer"],
    adjacent: [
      { role: "Frontend Engineer", condition: "react" },
      { role: "Full-Stack Developer", condition: "backend" },
    ],
    crossFunctional: ["UI/UX Engineer", "Solutions Engineer"],
  },
  data: {
    direct: ["Data Engineer", "Data Analyst", "Data Scientist"],
    adjacent: [
      { role: "Backend Engineer", condition: "python" },
      { role: "Machine Learning Engineer", condition: "ml" },
      { role: "Analytics Engineer", condition: "sql" },
    ],
    crossFunctional: ["Solutions Engineer", "Technical Engineer"],
  },
};

/**
 * Detect primary role category from skills list.
 * @param {string[]} skills
 * @returns {string} role category key
 */
const detectPrimaryCategory = (skills) => {
  const lowerSkills = skills.map((s) => s.toLowerCase());
  const allSkills = lowerSkills.join(" ");

  if (
    allSkills.includes("react") ||
    allSkills.includes("angular") ||
    allSkills.includes("vue") ||
    allSkills.includes("html") ||
    allSkills.includes("css") ||
    allSkills.includes("frontend") ||
    allSkills.includes("front-end") ||
    allSkills.includes("ui") ||
    allSkills.includes("ux")
  ) {
    // Check if also has backend skills
    if (
      allSkills.includes("node") ||
      allSkills.includes("express") ||
      allSkills.includes("django") ||
      allSkills.includes("flask") ||
      allSkills.includes("backend") ||
      allSkills.includes("api") ||
      allSkills.includes("database") ||
      allSkills.includes("sql") ||
      allSkills.includes("mongodb")
    ) {
      return "fullstack";
    }
    return "frontend";
  }

  if (
    allSkills.includes("node") ||
    allSkills.includes("express") ||
    allSkills.includes("django") ||
    allSkills.includes("flask") ||
    allSkills.includes("backend") ||
    allSkills.includes("api") ||
    allSkills.includes("rest") ||
    allSkills.includes("graphql") ||
    allSkills.includes("spring")
  ) {
    // Check if also has frontend skills
    if (
      allSkills.includes("react") ||
      allSkills.includes("html") ||
      allSkills.includes("css") ||
      allSkills.includes("javascript") ||
      allSkills.includes("frontend")
    ) {
      return "fullstack";
    }
    return "backend";
  }

  if (
    allSkills.includes("react native") ||
    allSkills.includes("flutter") ||
    allSkills.includes("swift") ||
    allSkills.includes("kotlin") ||
    allSkills.includes("mobile") ||
    allSkills.includes("android") ||
    allSkills.includes("ios")
  ) {
    return "mobile";
  }

  if (
    allSkills.includes("python") ||
    allSkills.includes("data") ||
    allSkills.includes("machine learning") ||
    allSkills.includes("ml") ||
    allSkills.includes("ai") ||
    allSkills.includes("artificial intelligence") ||
    allSkills.includes("sql") ||
    allSkills.includes("tableau") ||
    allSkills.includes("power bi")
  ) {
    return "data";
  }

  // Default to fullstack if skills contain both or if uncertain
  if (allSkills.includes("javascript") || allSkills.includes("typescript") || allSkills.includes("python")) {
    return "fullstack";
  }

  return "fullstack";
};

/**
 * Check if a condition is met based on skills.
 * @param {string} condition
 * @param {string[]} skills
 * @returns {boolean}
 */
const checkCondition = (condition, skills) => {
  const lowerSkills = skills.join(" ").toLowerCase();
  const conditionMap = {
    frontend: /react|angular|vue|html|css|frontend|ui/.test(lowerSkills),
    backend: /node|express|django|flask|backend|api|sql|mongodb/.test(lowerSkills),
    typescript: /typescript|ts/.test(lowerSkills),
    javascript: /javascript|js/.test(lowerSkills),
    devops: /devops|docker|kubernetes|aws|ci.cd|jenkins/.test(lowerSkills),
    systems: /system|infrastructure|linux|unix/.test(lowerSkills),
    react: /react/.test(lowerSkills),
    node: /node/.test(lowerSkills),
    leadership: /lead|manager|senior|architect/.test(lowerSkills),
    python: /python/.test(lowerSkills),
    ml: /machine learning|ml|tensorflow|pytorch|ai/.test(lowerSkills),
    sql: /sql|postgresql|mysql|database/.test(lowerSkills),
  };
  return conditionMap[condition] || false;
};

/**
 * Expand a user's skills into a comprehensive list of search role targets.
 * @param {string[]} skills - User's skill list
 * @returns {string[]} Array of expanded role search terms
 */
export const expandRoles = (skills) => {
  if (!skills || skills.length === 0) {
    return ["Software Engineer", "Developer", "Web Developer"];
  }

  const category = detectPrimaryCategory(skills);
  const mapping = ROLE_MAPPINGS[category];
  const expandedRoles = [];

  // Add direct matches
  expandedRoles.push(...mapping.direct);

  // Add adjacent roles where condition is met
  for (const adj of mapping.adjacent) {
    if (checkCondition(adj.condition, skills)) {
      expandedRoles.push(adj.role);
    }
  }

  // Add cross-functional matches
  expandedRoles.push(...mapping.crossFunctional);

  // Deduplicate
  return [...new Set(expandedRoles)];
};

/**
 * Get base search terms for a user's skill profile.
 * @param {string[]} skills
 * @returns {string[]} Search terms suitable for job boards
 */
export const getSearchTerms = (skills) => {
  return expandRoles(skills);
};

export default {
  expandRoles,
  getSearchTerms,
};