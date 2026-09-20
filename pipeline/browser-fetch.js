/**
 * Fetch AMC 10 wiki pages from a real browser session.
 *
 * Paste into the Chrome DevTools console while on any artofproblemsolving.com page.
 * Each exam is saved as a separate JSON file as it completes, so the script is
 * safe to interrupt and resume — already-downloaded exams are skipped.
 *
 * After downloading, for each file run from the repo root:
 *   node pipeline/split-cache.mjs data/cache/<file>
 *
 * Or process them all at once:
 *   for f in data/cache/amc10-*.json; do node pipeline/split-cache.mjs $f; done
 *
 * Known-fragile: Cloudflare sometimes answers a raw-wikitext request with an
 * HTTP 200 "Just a moment..." challenge page instead of a 404, so a page can
 * silently come back as junk rather than null. After every run, scan for it:
 *   grep -rl "Just a moment" pipeline/.cache/ data/cache/
 * Any hit means that page needs a retry — see RETRY_PAGES below.
 */

const WIKI = "https://artofproblemsolving.com/wiki/index.php";
const SAVE_DIR = "data/cache"; // reminder only — browser saves to ~/Downloads

// All AMC 10 exams 2015–2025 (priority set).
// Edit this list to skip exams you already have in data/cache/.
//
// Status as of this edit:
//   data/exams/  (extracted, committed): 2015-A/B, 2016-A/B, 2018-A/B, 2022-B
//   data/cache/  (raw dump, not yet split/extracted): 2017-A/B, 2018-B (dup),
//     2019-A/B, 2020-A/B, 2021-A/B, 2021F-A/B, 2022-A/B, 2023-A/B, 2024-A/B,
//     2025-A/B — fetched, but see RETRY_PAGES: 31 pages across these six came
//     back as Cloudflare challenge pages and need to be re-fetched.
// Leave EXAMS empty to skip the whole-exam pass and only run RETRY_PAGES.
const EXAMS = [];

// Individual pages that came back as Cloudflare challenge pages on the last
// run and need a targeted re-fetch, grouped by exam so split-cache.mjs still
// works unchanged on the output. Delete an exam's entry here once confirmed
// clean (no "Just a moment" hits) after re-running.
// All confirmed clean as of the 2023-2025 backfill — leave empty unless a
// future run turns up new challenge pages.
const RETRY_PAGES = [];

// Some AMC 10 problems are cross-listed with AMC 12 (shared problem set for a
// given year): the AMC 10 wiki page for these is just a #redirect stub, e.g.
//   #redirect [[2021 AMC 12A Problems/Problem 3]]
// extract/classify can't get a statement from a redirect stub, so these 88
// AMC 12 pages need to be fetched directly. Found by scanning data/exams/ for
// problems with area === null whose cached wikitext starts with "#redirect".
const REDIRECT_TARGETS = [
  { id: "amc12-2019-B-redirect", prefix: "2019_AMC_12B_Problems", problems: [13] },
  { id: "amc12-2021-A-redirect", prefix: "2021_AMC_12A_Problems", problems: [3, 4, 5, 7, 9, 10, 12, 16, 17, 18, 23] },
  { id: "amc12-2021-B-redirect", prefix: "2021_AMC_12B_Problems", problems: [1, 2, 4, 5, 6, 7, 8, 12, 15, 22, 25] },
  { id: "amc12-2021F-A-redirect", prefix: "2021_Fall_AMC_12A_Problems", problems: [1, 2, 3, 4, 5, 6, 7, 10, 17, 18, 20, 23] },
  { id: "amc12-2021F-B-redirect", prefix: "2021_Fall_AMC_12B_Problems", problems: [1, 2, 3, 4, 5, 6, 7, 11, 19, 20] },
  { id: "amc12-2023-A-redirect", prefix: "2023_AMC_12A_Problems", problems: [1, 2, 3, 4, 5, 7, 8, 9, 13, 18, 21] },
  { id: "amc12-2023-B-redirect", prefix: "2023_AMC_12B_Problems", problems: [1, 2, 3, 4, 5, 6, 9, 13, 15, 19, 25] },
  { id: "amc12-2024-B-redirect", prefix: "2024_AMC_12B_Problems", problems: [16] },
  { id: "amc12-2025-A-redirect", prefix: "2025_AMC_12A_Problems", problems: [1, 2, 3, 4, 5, 6, 12, 15, 16, 23] },
  { id: "amc12-2025-B-redirect", prefix: "2025_AMC_12B_Problems", problems: [2, 4, 6, 10, 11, 14, 15, 17, 19, 20] },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  // Give Chrome time to register the download before the next one.
  await sleep(2000);
}

async function fetchPage(page) {
  const url = `${WIKI}?title=${encodeURIComponent(page)}&action=raw`;
  const delay = 4000 + Math.random() * 3000;
  console.log(`  waiting ${(delay/1000).toFixed(1)}s → ${page}`);
  await sleep(delay);
  try {
    const r = await fetch(url);
    const wikitext = r.status === 404 ? null : await r.text();
    if (wikitext && wikitext.includes("Just a moment")) {
      console.warn(`  ⚠ CLOUDFLARE CHALLENGE (not real content) → ${page}`);
    }
    return { page, wikitext, fetchedAt: new Date().toISOString() };
  } catch (e) {
    console.error(`  ERROR ${page}: ${e}`);
    return { page, wikitext: null, fetchedAt: new Date().toISOString() };
  }
}

const jobs = [
  ...EXAMS.map(({ id, prefix }) => ({
    id,
    pages: [
      prefix,
      ...Array.from({ length: 25 }, (_, n) => `${prefix}/Problem_${n + 1}`),
      prefix.replace(/_Problems$/, "_Answer_Key"),
    ],
  })),
  ...RETRY_PAGES.map(({ id, prefix, problems, answerKey }) => ({
    id,
    pages: [
      ...problems.map(n => `${prefix}/Problem_${n}`),
      ...(answerKey ? [prefix.replace(/_Problems$/, "_Answer_Key")] : []),
    ],
  })),
  ...REDIRECT_TARGETS.map(({ id, prefix, problems }) => ({
    id,
    pages: problems.map(n => `${prefix}/Problem_${n}`),
  })),
];

const total = jobs.length;

for (let i = 0; i < jobs.length; i++) {
  const { id, pages } = jobs[i];
  const filename = `${id}-cache.json`;
  console.log(`\n[${i+1}/${total}] ${id}`);

  const results = [];
  for (const page of pages) {
    results.push(await fetchPage(page));
  }

  await download(filename, results);
  const ok = results.filter(r => r.wikitext && !r.wikitext.includes("Just a moment")).length;
  console.log(`✓ saved ${filename} (${ok}/${pages.length} pages with clean content)`);
}

console.log("\nAll done! Move files from ~/Downloads/ to data/cache/ then run:");
console.log("  for f in data/cache/amc10-*.json; do node pipeline/split-cache.mjs $f; done");
console.log("\nThen re-scan for Cloudflare challenge pages before running extract:");
console.log("  grep -rl 'Just a moment' pipeline/.cache/");
