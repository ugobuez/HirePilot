/**
 * Jest environment setup — runs before any test module is imported, so the
 * config layer already sees a test environment.
 */
process.env.NODE_ENV = "test";
process.env.MONGO_MEMORY_EPHEMERAL = "true";
// Tests must never call an LLM API: everything is exercised through the
// deterministic local paths.
process.env.FLAG_LLM_ENRICHMENT = "false";
process.env.FLAG_AUTO_SUBMIT = "false";
process.env.FLAG_WARM_CACHE_ON_BOOT = "false";
