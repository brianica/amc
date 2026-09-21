import type { NextConfig } from "next";

const config: NextConfig = {
  typedRoutes: true,
  // statements.ts reads pipeline/.cache/**/*.json with a runtime-built path, which
  // Next's file tracer cannot follow via static import analysis — without this the
  // cache is silently dropped from the deployed function bundle.
  outputFileTracingIncludes: {
    "/log/[examId]": ["pipeline/.cache/**/*.json"],
    "/log/[examId]/timed": ["pipeline/.cache/**/*.json"],
  },
};

export default config;
