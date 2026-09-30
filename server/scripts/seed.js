/**
 * Database seed script.
 * Populates test user, base resume, sample jobs, and pipeline applications.
 * Usage: npm run seed
 */
import mongoose from "mongoose";
import { connectDB, connectToRunningInstance, disconnectDB } from "../config/db.js";
import User from "../models/User.js";
import Resume from "../models/Resume.js";
import Job from "../models/Job.js";
import Application from "../models/Application.js";
import { parseResumeLocal } from "../services/resumeParser.js";
import { scoreJob } from "../services/atsScoring.js";
import logger from "../utils/logger.js";

export const SEED_USER = {
  email: "demo@hirepilot.dev",
  password: "Password123!",
  baseResumeText: `Jane Doe
jane.doe@example.com | (415) 555-0134 | San Francisco, CA

SUMMARY
Staff backend engineer with 9 years of experience architecting fault-tolerant distributed systems and event-driven data pipelines.

EXPERIENCE
Staff Software Engineer, Acme Corp, San Francisco, CA
Jan 2021 – Present
• Architected event streaming services in Node.js, TypeScript, and Kafka handling 50k req/sec with sub-25ms p99 latency.
• Reduced PostgreSQL read load by 60% and spend by $140k/yr through distributed Redis caching and query plan indexing.
• Containerized core platforms with Docker and orchestrated deployments on AWS EKS with Terraform.

Senior Software Engineer, Globex Corporation, Austin, TX
Jun 2017 – Dec 2020
• Designed RESTful and GraphQL APIs in Python, Django, and Node.js serving 2.5 million monthly active users.
• Migrated legacy MySQL databases to partitioned PostgreSQL on AWS RDS with zero downtime data backfills.

EDUCATION
BSc in Computer Science, University of Texas at Austin, Aug 2010 – May 2014

SKILLS
Node.js, TypeScript, JavaScript, Python, PostgreSQL, Redis, Docker, Kubernetes, AWS, Terraform, Kafka, GraphQL, REST APIs, Microservices, CI/CD, Git
`,
  onboardingDetails: {
    fullName: "Jane Doe",
    email: "jane.doe@example.com",
    phone: "(415) 555-0134",
    location: "San Francisco, CA",
    isAuthorizedToWorkInUS: true,
    requiresSponsorship: false,
    employmentTypePref: "Full-Time",
    salaryExpectations: "$170,000 - $210,000",
    linkedInUrl: "https://linkedin.com/in/janedoe",
    gitHubUrl: "https://github.com/janedoe",
    personalWebsite: "https://janedoe.dev",
    skillsList: [
      "Node.js", "TypeScript", "JavaScript", "Python", "PostgreSQL",
      "Redis", "Docker", "Kubernetes", "AWS", "Terraform", "Kafka", "GraphQL"
    ],
    yearsOfExperience: 9,
  },
  settings: {
    minAts: 70,
    dailyLimit: 25,
    countries: ["United States", "Remote"],
    jobBoards: ["LinkedIn", "Indeed"],
    remoteOnly: false,
    keywords: ["Backend", "Distributed Systems", "Node.js", "TypeScript"],
    blacklistCompanies: [],
    preferredTitles: ["Senior Backend Engineer", "Staff Software Engineer"],
    autoApplyEnabled: false,
    autoApplyInterval: 30,
    salaryMin: 150000,
    employmentTypes: ["Full-Time"],
  },
};

export const SEED_JOBS = [
  {
    title: "Senior Backend Engineer",
    company: "CloudScale Technologies",
    location: "Remote",
    description: `Requirements:\n- 5+ years backend systems with Node.js and TypeScript\n- Strong experience with PostgreSQL and query optimization\n- Production experience with Redis and caching architectures\n- Familiarity with Docker, Kubernetes, and AWS\n\nNice to have:\n- Experience with Kafka\n- Infrastructure as code using Terraform\n- GraphQL API development experience`,
    source: "LinkedIn",
    category: "Engineering",
    remote: true,
    salary: "$160,000 - $190,000",
    visaSponsorship: false,
    skills: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "Docker", "Kubernetes", "AWS", "Kafka", "Terraform", "GraphQL"],
    externalId: "seed-job-001",
  },
  {
    title: "Staff Distributed Systems Engineer",
    company: "DataFlow Systems",
    location: "San Francisco, CA",
    description: `Must have:\n- 8+ years software engineering experience with distributed systems\n- Mastery of Node.js and TypeScript\n- Deep experience with Kafka\n- Foundation in containerization with Kubernetes and Terraform\n- PostgreSQL experience\n\nNice to have:\n- Python experience\n- AWS large-scale architectures`,
    source: "LinkedIn",
    category: "Engineering",
    remote: false,
    salary: "$200,000 - $240,000",
    visaSponsorship: true,
    skills: ["Node.js", "TypeScript", "Kafka", "Kubernetes", "Terraform", "PostgreSQL", "Python", "AWS"],
    externalId: "seed-job-002",
  },
  {
    title: "Senior Frontend Engineer (React)",
    company: "PixelCraft Design",
    location: "New York, NY",
    description: `Requirements:\n- 5+ years dedicated frontend engineering with React and CSS/Tailwind\n- Expert in browser rendering and SVG animations\n- State management with Redux or Zustand\n\nBonus:\n- Node.js backend integration experience`,
    source: "Indeed",
    category: "Frontend",
    remote: true,
    salary: "$150,000 - $180,000",
    visaSponsorship: false,
    skills: ["React", "CSS", "Tailwind", "Redux", "TypeScript"],
    externalId: "seed-job-003",
  },
];

export const seedDatabase = async () => {
  // Reuse a dev database that is already running: a second mongod on the same
  // data directory is a lock fight, not a seed.
  const reused = await connectToRunningInstance();
  if (reused) {
    logger.info("seeding against the already-running dev database", { db: "shared" });
  } else {
    logger.info("connecting to database for seed...");
    await connectDB();
  }

  await User.deleteOne({ email: SEED_USER.email });
  await Job.deleteMany({ externalId: { $in: SEED_JOBS.map((j) => j.externalId) } });

  const user = new User(SEED_USER);
  await user.save();
  logger.info("seeded user", { id: user._id.toString(), email: user.email });

  const parsedResume = parseResumeLocal(SEED_USER.baseResumeText);
  const resume = await Resume.create({
    userId: user._id.toString(),
    content: SEED_USER.baseResumeText,
  });
  logger.info("seeded resume", { id: resume._id.toString() });

  const scoringProfile = {
    resumeText: SEED_USER.baseResumeText,
    skillsList: parsedResume.skills,
    targetTitles: SEED_USER.settings.preferredTitles,
    yearsOfExperience: SEED_USER.onboardingDetails.yearsOfExperience,
    authorizedCountries: SEED_USER.settings.countries,
    needsSponsorship: SEED_USER.onboardingDetails.requiresSponsorship,
    remotePreference: "remote",
  };

  const insertedJobs = [];
  for (const jobData of SEED_JOBS) {
    const scoreResult = scoreJob(jobData, scoringProfile);
    const job = await Job.create({
      ...jobData,
      atsScore: scoreResult.score,
      qualityScore: scoreResult.score,
    });
    insertedJobs.push({ job, score: scoreResult });
    logger.info("seeded job", {
      title: job.title,
      company: job.company,
      atsScore: scoreResult.score,
      pass: scoreResult.pass,
    });
  }

  await Application.deleteMany({ userId: user._id });

  const appFixtures = [
    {
      jobIndex: 0,
      status: "Applied",
      appliedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      notes: "Tailored PDF verified. Applied via company careers portal.",
    },
    {
      jobIndex: 1,
      status: "Interviewing",
      appliedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      notes: "System design interview scheduled for Thursday.",
    },
  ];

  for (const af of appFixtures) {
    const { job, score } = insertedJobs[af.jobIndex];
    await Application.create({
      userId: user._id,
      jobTitle: job.title,
      company: job.company,
      location: job.location,
      jobDescription: job.description,
      salary: job.salary,
      source: job.source,
      status: af.status,
      matchRate: score.score,
      appliedAt: af.appliedAt,
      notes: af.notes,
    });
  }

  logger.info("seeded sample applications", { count: appFixtures.length });
  console.log("\n=== Seed complete ===");
  console.log(`User:         ${SEED_USER.email} (password: ${SEED_USER.password})`);
  console.log(`Jobs:         ${insertedJobs.length} diverse jobs across tech stacks`);
  console.log(`Applications: ${appFixtures.length} pipeline applications`);
  console.log("=====================\n");
};

if (process.argv[1] && process.argv[1].endsWith("seed.js")) {
  seedDatabase()
    .then(async () => {
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error("seed failed", { err: err.message, stack: err.stack });
      await disconnectDB().catch(() => {});
      process.exit(1);
    });
}
