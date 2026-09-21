import type { NextConfig } from "next";

const config: NextConfig = {
  typedRoutes: true,
  // statements.ts reads this file with a runtime-built path, which Next's file tracer
  // cannot follow via static import analysis. It's a single file (run `npm run
  // bundle-cache` after fetch) rather than pipeline/.cache/'s thousands of individual
  // entries, which a serverless deploy silently drops despite the trace manifest and
  // build size both looking fine.
  outputFileTracingIncludes: {
    "/log/[examId]": ["pipeline/.cache/bundle.json"],
    "/log/[examId]/timed": ["pipeline/.cache/bundle.json"],
  },
};

export default config;
