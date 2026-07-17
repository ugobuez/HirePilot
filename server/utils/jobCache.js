/**
 * Simple in-memory TTL cache for expensive job scrapes/scores.
 * Avoids repeatedly hitting external job boards / OpenRouter on every request.
 */
const store = new Map();

export const getCached = (key) => {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    store.delete(key);
    return null;
  }
  return entry.value;
};

export const setCached = (key, value, ttlMs = 5 * 60 * 1000) => {
  store.set(key, { value, expiry: Date.now() + ttlMs });
};

export const clearCache = (key) => {
  if (key) store.delete(key);
  else store.clear();
};
