# Why the statement cache is a generated `.ts` file, not a read file

Symptom: on the live Vercel deployment, with `SHOW_PROBLEM_STATEMENTS=1` set, every
paper showed *"Problem display is switched on, but nothing is cached for this paper
yet."* — even though `pipeline/.cache/` had the right content, `npm run fetch` had been
run, and everything worked correctly with `npm run dev` locally.

Three fixes were tried, in order, before finding the one that actually works. Each one
looked correct by every check available short of an actual production request, and each
one failed identically. This file exists so nobody re-walks that path.

## Attempt 1 — `outputFileTracingIncludes` over the whole cache directory

`statements.ts` read individual files with `readFile(join(process.cwd(), "pipeline",
".cache", ...))`, built from a runtime string. Next's build-time file tracer can't
follow a dynamic path like that through static analysis, so `pipeline/.cache/`'s ~3600
wikitext files never made it into the deployed function on their own. The fix looked
like:

```ts
// next.config.ts
outputFileTracingIncludes: {
  "/log/[examId]": ["pipeline/.cache/**/*.json"],
  "/log/[examId]/timed": ["pipeline/.cache/**/*.json"],
},
```

Locally this worked exactly as documented: `next build`'s own `page.js.nft.json` trace
manifest listed all ~3600 files, and the Vercel build log showed a build cache upload
of a plausible size. Deployed anyway — same "nothing cached" error.

Adding temporary logging (`console.warn` on the `readFile` catch path) and pulling
`vercel logs` after hitting the page showed the real story:

```
[statements debug] readCachedWikitext failed for /var/task/pipeline/.cache/2017_AMC_10A_Problems/Problem_4.json: Error: ENOENT: no such file or directory
```

The trace manifest said the file should be there. The build log gave no error. The file
was not there at runtime. Best working theory: something in Vercel's own
deploy-output packaging drops files once there are thousands of tiny ones, silently,
downstream of Next's own tracing — this was never confirmed with certainty, because
there's no shell access to the deployed Lambda's filesystem to check directly.

## Attempt 2 — merge everything into one file

Reasoning: if the problem is *file count*, one file should dodge it. `npm run
bundle-cache` (a new pipeline script) walked `pipeline/.cache/` and merged every
`{ page, wikitext }` entry into one `pipeline/.cache/bundle.json` (page → wikitext),
skipping `pipeline/.cache/classify/` (unrelated LLM tagging cache) and
`_last-failure.html` (fetch debug dump). `statements.ts` read that one file instead,
cached in memory per Lambda instance. `outputFileTracingIncludes` was narrowed to just
that one path.

Same result. Diagnostic logging showed the identical failure, just on one file instead
of thousands:

```
[statements debug] failed to load /var/task/pipeline/.cache/bundle.json: Error: ENOENT
```

One file, 4.4 MB, explicitly traced, still not present at runtime. This ruled out file
*count* as the mechanism — whatever's happening, it's not about how many files there
are.

## Attempt 3 — static `import` of the JSON file

Reasoning: maybe the problem is specifically about *`outputFileTracingIncludes` +
runtime `readFile`* as a mechanism, and a build-time `import` would route through
webpack's ordinary module graph instead:

```ts
import bundleData from "../../pipeline/.cache/bundle.json";
```

`tsc --noEmit` was clean (`resolveJsonModule: true` was already set). This looked like
it should work — importing a JSON file is a completely standard thing to do. It did
not help. Inspecting the actual build output explained why:

```
$ grep -c "1999_AMC_8" ".next/server/app/log/[examId]/page.js"
0
```

Next.js, targeting Node.js for a server component, compiles a JSON import into a
`require()` of the file — not an inlined literal. It's sugar over the same
runtime-file-read mechanism as Attempt 2, wearing different syntax. The trace manifest
still listed `bundle.json` as a separate file dependency, same as before.

## What actually works — generate real `.ts` source, not JSON

`npm run bundle-cache` was changed to emit an actual TypeScript module instead of JSON:

```ts
// src/lib/statement-cache.generated.ts (generated, do not hand-edit)
const bundle: Record<string, string | null> = { /* ...3589 entries... */ };
export default bundle;
```

`statements.ts` imports it exactly like any other local module:

```ts
import bundle from "./statement-cache.generated";
```

Checking the build output confirmed the difference immediately:

```
$ grep -rl "1999_AMC_8" .next/server/
.next/server/chunks/862.js
```

The data landed in a first-class webpack chunk, and `page.js`'s own webpack runtime
array explicitly lists that chunk as a dependency (`b.X(0,[543,479,...,862],...)`).
Chunks are core to how Next.js runs at all — if Vercel silently dropped a required
chunk, most Next.js apps simply wouldn't deploy. That's a fundamentally different
guarantee than "a file this app happens to reference via `outputFileTracingIncludes`
survives deployment," which is the assumption both earlier attempts were resting on
without realizing it.

Deployed, then confirmed via `vercel logs`: the diagnostic ENOENT line was gone, and
the statement rendered.

## The actual rule

**A Next.js route on Vercel that needs a large static dataset at runtime should import
it as a real `.ts`/`.js` module (something webpack compiles into a chunk), never
`readFile` a path built at runtime — even one covered by `outputFileTracingIncludes`,
and even via a static `import` of a `.json` file, which still compiles to a runtime
file read for a Node.js target.** `outputFileTracingIncludes` is for genuinely small,
few-in-number support files (a couple of config files, a native binary): treat it as
unreliable for anything with many files or real size, on this app's evidence.

## Where the pieces live

- `pipeline/src/bundle-cache.ts` — walks `pipeline/.cache/` (skipping `classify/` and
  `_last-failure.html`) and writes `src/lib/statement-cache.generated.ts`.
- `npm run bundle-cache` — runs it. Run after `npm run fetch`, before deploying with
  `SHOW_PROBLEM_STATEMENTS=1`.
- `src/lib/statement-cache.generated.ts` — generated, committed (needed at deploy time,
  since Vercel doesn't run the pipeline), never hand-edited.
- `src/lib/statements.ts` — imports the generated module directly; no filesystem
  access at runtime at all anymore.
