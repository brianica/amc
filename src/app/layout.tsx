import type { Metadata } from "next";
import Link from "next/link";
import { authUnconfiguredInProduction } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "AMC Diagnostic",
  description: "Log past AMC papers and see where the points are going.",
};

/**
 * Shown instead of the app when a production deployment has no Supabase project.
 *
 * Running without it would fall back to the shared development account, so refusing
 * is right — but refusing by throwing meant every route returned a bare 500 with the
 * reason only in the server log. The cause is a missing setting, so the page says so.
 */
function SetupRequired() {
  return (
    <main className="mx-auto max-w-prose px-4 py-16">
      <h1 className="text-2xl font-semibold">This deployment is not configured yet</h1>
      <p className="mt-4 text-muted">
        It has no Supabase project, so there is nowhere to keep accounts or attempts.
        The app refuses to run without one rather than fall back to the shared local
        development account, which would give every visitor the same data.
      </p>
      <p className="mt-4 text-muted">Set these in the hosting provider&apos;s environment variables:</p>
      <ul className="mt-2 list-inside list-disc text-muted">
        <li><code>NEXT_PUBLIC_SUPABASE_URL</code></li>
        <li><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
        <li><code>NEXT_PUBLIC_SITE_URL</code> — this deployment&apos;s own origin</li>
      </ul>
      <p className="mt-4 text-muted">
        Then <strong>redeploy</strong>. <code>NEXT_PUBLIC_</code> variables are baked in
        when the app is built, so setting them alone does not change a build that has
        already happened.
      </p>
    </main>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // One check at the root covers every page, instead of each one failing separately.
  const unconfigured = authUnconfiguredInProduction();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-4xl items-baseline justify-between px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              AMC Diagnostic
            </Link>
            <nav className="flex gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-text">Exams</Link>
              <Link href="/resolve" className="hover:text-text">Re-solve</Link>
              <Link href="/dashboard" className="hover:text-text">Dashboard</Link>
            </nav>
          </div>
        </header>
        {unconfigured ? (
          <SetupRequired />
        ) : (
          <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        )}
      </body>
    </html>
  );
}
