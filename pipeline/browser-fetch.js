/**
 * Fetch AoPS wiki pages from a real browser session, bypassing Cloudflare.
 *
 * Paste into the Chrome DevTools console while on any artofproblemsolving.com page.
 * The browser's live CF cookies are used automatically.
 *
 * Configure the EXAMS array below, then run. Results are downloaded as a single
 * JSON file. Save it to data/cache/<name>.json, then run:
 *
 *   node --input-type=module < pipeline/split-cache.mjs  # splits into pipeline/.cache/
 *   npm run extract -- --exam <id>
 *   npm run classify -- --exam <id>
 *   npm run review
 *   npm run validate
 */

const WIKI = "https://artofproblemsolving.com/wiki/index.php";

// ── Configure which exams to fetch ───────────────────────────────────────────
const EXAMS = [
  { prefix: "2015_AMC_10B_Problems", problems: 25 },
  { prefix: "2018_AMC_10A_Problems", problems: 25 },
  { prefix: "2016_AMC_10A_Problems", problems: 25 },
  { prefix: "2016_AMC_10B_Problems", problems: 25 },
];

// Output filename for the downloaded JSON
const OUTPUT_FILE = "amc10-batch1-cache.json";
// ─────────────────────────────────────────────────────────────────────────────

const pages = [];
for (const exam of EXAMS) {
  pages.push(exam.prefix);
  for (let i = 1; i <= exam.problems; i++) pages.push(`${exam.prefix}/Problem_${i}`);
  pages.push(exam.prefix.replace(/_Problems$/, "_Answer_Key"));
}

console.log(`Total pages to fetch: ${pages.length}`);
console.log(`Estimated time: ${Math.ceil(pages.length * 5.5 / 60)} min at ~5.5s/page`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];

for (const page of pages) {
  const delay = 4000 + Math.random() * 3000;
  console.log(`Waiting ${(delay/1000).toFixed(1)}s before ${page}...`);
  await sleep(delay);

  const url = `${WIKI}?title=${encodeURIComponent(page)}&action=raw`;
  try {
    const r = await fetch(url);
    const wikitext = r.status === 404 ? null : await r.text();
    results.push({ page, wikitext, fetchedAt: new Date().toISOString() });
    console.log(`✓ [${results.length}/${pages.length}] ${page} (${wikitext?.length ?? 'missing'} chars)`);
  } catch(e) {
    results.push({ page, wikitext: null, fetchedAt: new Date().toISOString() });
    console.error(`✗ ${page}: ${e}`);
  }
}

const blob = new Blob([JSON.stringify(results, null, 2)], {type: "application/json"});
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = OUTPUT_FILE;
a.click();
console.log(`Done! ${results.length} pages fetched. Saved as ${OUTPUT_FILE}.`);
