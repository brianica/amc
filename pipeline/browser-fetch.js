/**
 * Fetch all remaining AMC 10 wiki pages from a real browser session.
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
 */

const WIKI = "https://artofproblemsolving.com/wiki/index.php";
const SAVE_DIR = "data/cache"; // reminder only — browser saves to ~/Downloads

// All AMC 10 exams 2015–2025 (priority set).
// Edit this list to skip exams you already have in data/cache/.
const EXAMS = [
  { id: "amc10-2017-A", prefix: "2017_AMC_10A_Problems" },
  { id: "amc10-2017-B", prefix: "2017_AMC_10B_Problems" },
  { id: "amc10-2019-A", prefix: "2019_AMC_10A_Problems" },
  { id: "amc10-2019-B", prefix: "2019_AMC_10B_Problems" },
  { id: "amc10-2020-A", prefix: "2020_AMC_10A_Problems" },
  { id: "amc10-2020-B", prefix: "2020_AMC_10B_Problems" },
  { id: "amc10-2021-A", prefix: "2021_AMC_10A_Problems" },
  { id: "amc10-2021-B", prefix: "2021_AMC_10B_Problems" },
  { id: "amc10-2021F-A", prefix: "2021_Fall_AMC_10A_Problems" },
  { id: "amc10-2021F-B", prefix: "2021_Fall_AMC_10B_Problems" },
  { id: "amc10-2022-A", prefix: "2022_AMC_10A_Problems" },
  { id: "amc10-2022-B", prefix: "2022_AMC_10B_Problems" },
  { id: "amc10-2023-A", prefix: "2023_AMC_10A_Problems" },
  { id: "amc10-2023-B", prefix: "2023_AMC_10B_Problems" },
  { id: "amc10-2024-A", prefix: "2024_AMC_10A_Problems" },
  { id: "amc10-2024-B", prefix: "2024_AMC_10B_Problems" },
  { id: "amc10-2025-A", prefix: "2025_AMC_10A_Problems" },
  { id: "amc10-2025-B", prefix: "2025_AMC_10B_Problems" },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

async function fetchPage(page) {
  const url = `${WIKI}?title=${encodeURIComponent(page)}&action=raw`;
  const delay = 4000 + Math.random() * 3000;
  console.log(`  waiting ${(delay/1000).toFixed(1)}s → ${page}`);
  await sleep(delay);
  try {
    const r = await fetch(url);
    const wikitext = r.status === 404 ? null : await r.text();
    return { page, wikitext, fetchedAt: new Date().toISOString() };
  } catch (e) {
    console.error(`  ERROR ${page}: ${e}`);
    return { page, wikitext: null, fetchedAt: new Date().toISOString() };
  }
}

const total = EXAMS.length;
for (let i = 0; i < EXAMS.length; i++) {
  const { id, prefix } = EXAMS[i];
  const filename = `${id}-cache.json`;
  console.log(`\n[${i+1}/${total}] ${id}`);

  const pages = [
    prefix,
    ...Array.from({ length: 25 }, (_, n) => `${prefix}/Problem_${n+1}`),
    prefix.replace(/_Problems$/, "_Answer_Key"),
  ];

  const results = [];
  for (const page of pages) {
    results.push(await fetchPage(page));
  }

  download(filename, results);
  console.log(`✓ saved ${filename} (${results.filter(r => r.wikitext).length}/27 pages with content)`);
}

console.log("\n\nAll done! Move files from ~/Downloads/ to data/cache/ then run:");
console.log("  for f in data/cache/amc10-20*-cache.json; do node pipeline/split-cache.mjs $f; done");
