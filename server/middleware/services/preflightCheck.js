import { openRouterCompletion } from "./openRouterService.js";
import User from "../../models/User.js";

/**
 * Pre-Flight System Verification
 * Run before any automation queue begins.
 */

/**
 * Step 1: OpenRouter Handshake
 * Ping OpenRouter with a minimal completion request to verify the key works.
 */
export const checkOpenRouter = async () => {
  try {
    const result = await openRouterCompletion(
      "You are a verification system.",
      'Reply with exactly: {"status":"ok"}',
      0
    );
    const hasOk =
      result.includes("ok") || result.includes("OK") || result.includes('"status"');
    console.log(
      `✅ OpenRouter handshake: ${hasOk ? "PASSED" : "WARNING - unexpected response"}`
    );
    return true;
  } catch (err) {
    console.error("❌ OpenRouter handshake FAILED:", err.message);
    return false;
  }
};

/**
 * Step 2: Onboarding Validator
 * Throw an error if a user tries to run the app with an incomplete profile.
 */
export const validateOnboarding = (user) => {
  const errors = [];

  if (!user) {
    errors.push("User not found");
    return { valid: false, errors };
  }

  if (!user.baseResumeText || user.baseResumeText.trim() === "") {
    errors.push("Missing master resume text. Please upload your resume.");
  }

  if (!user.onboardingDetails?.fullName) {
    errors.push("Missing full name in onboarding details.");
  }

  if (!user.onboardingDetails?.email) {
    errors.push("Missing email in onboarding details.");
  }

  if (!user.onboardingDetails?.phone) {
    errors.push("Missing phone number in onboarding details.");
  }

  if (!user.onboardingDetails?.skillsList || user.onboardingDetails.skillsList.length === 0) {
    errors.push("Missing skills list. Please add at least one skill.");
  }

  const valid = errors.length === 0;
  if (!valid) {
    console.error("❌ Onboarding validation FAILED:", errors.join("; "));
  } else {
    console.log("✅ Onboarding validation PASSED");
  }

  return { valid, errors };
};

/**
 * Step 3: Playwright Warm-up
 * Launch a headless browser for 3 seconds to verify binaries and network routes.
 */
export const checkPlaywright = async () => {
  try {
    // Dynamic import to allow optional dependency
    let playwright;
    try {
      playwright = await import("playwright");
    } catch (e) {
      console.warn("⚠️ Playwright not installed. Skipping browser warm-up.");
      return false;
    }

    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("https://www.google.com", {
      waitUntil: "networkidle",
      timeout: 10000,
    });

    const title = await page.title();
    console.log(`✅ Playwright warm-up PASSED (Google title: "${title}")`);

    await browser.close();
    return true;
  } catch (err) {
    console.error("❌ Playwright warm-up FAILED:", err.message);
    return false;
  }
};

/**
 * Run all pre-flight checks.
 * @param {object} user - Mongoose User document
 * @returns {Promise<{passed: boolean, checks: object}>}
 */
export const runPreflightChecks = async (user) => {
  console.log("\n🔍 Running pre-flight checks...\n");

  const onboardingResult = validateOnboarding(user);
  const openRouterResult = await checkOpenRouter();

  // Playwright check is optional; don't fail the whole preflight
  const playwrightResult = await checkPlaywright();

  const checks = {
    onboarding: onboardingResult.valid,
    openRouter: openRouterResult,
    playwright: playwrightResult,
  };

  const passed =
    onboardingResult.valid && openRouterResult;

  console.log(`\n📊 Pre-flight summary:`);
  console.log(`   Onboarding: ${checks.onboarding ? "✅" : "❌"}`);
  console.log(`   OpenRouter: ${checks.openRouter ? "✅" : "❌"}`);
  console.log(`   Playwright: ${checks.playwright ? "✅" : "⚠️"}`);
  console.log(`   Overall: ${passed ? "✅ PASSED" : "❌ FAILED"}\n`);

  return {
    passed,
    checks,
    onboardingErrors: onboardingResult.errors,
  };
};

export default {
  checkOpenRouter,
  validateOnboarding,
  checkPlaywright,
  runPreflightChecks,
};