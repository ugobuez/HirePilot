/**
 * Standalone LLM check: verify model ids, probe every configured provider and
 * print the PASS/FAIL table. Same code path the server uses at boot.
 * Usage: npm run llm:check
 */
import { runSelfTest } from "../services/llmSelfTest.js";

const result = await runSelfTest({ print: true });
console.log(`\nllmMode: ${result.mode}`);
console.log(`${result.summary} in ${result.totalMs}ms\n`);
process.exit(0);
