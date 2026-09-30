/**
 * One-off hygiene pass: strip UTF-8 BOMs and repair mojibake sequences left by
 * earlier Windows-encoded writes. Safe to run repeatedly.
 * Run: node scripts/fix-encoding.js
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const SKIP = new Set(["node_modules", "artifacts", ".git", "coverage"]);

const REPAIRS = [
  [/•/g, "\u2022"], // bullet
  [/·/g, "\u00b7"], // middle dot
  [/–/g, "\u2013"], // en dash
  [/—/g, "\u2014"], // em dash
  [/’/g, "\u2019"], // right single quote
  [/“/g, "\u201c"],
  [/â€\u009d/g, "\u201d"],
  [/§/g, "\u00a7"], // section sign
];

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".json")) out.push(full);
  }
  return out;
};

let bomStripped = 0;
let repaired = 0;
for (const file of walk(ROOT)) {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const [re, to] of REPAIRS) text = text.replace(re, to);
  // Explicit unicode escapes keep the source ASCII-only and stable everywhere.
  text = text.replace(
    /const text = String\(frag\)\.replace\(\/\^\[[^\]]*\]\+\/, ""\);/,
    'const text = String(frag).replace(/^[\s\-*\u2022\u00b7|>\u2013\u2014]+/, "");'
  );
  if (text !== before) {
    fs.writeFileSync(file, text, "utf8");
    if (before.charCodeAt(0) === 0xfeff) bomStripped++;
    repaired++;
    console.log("fixed:", path.relative(ROOT, file));
  }
}
console.log(`\nfiles changed: ${repaired} (bom stripped: ${bomStripped})`);
