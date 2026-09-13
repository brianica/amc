import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AMC Diagnostic",
  description: "Log past AMC papers and see where the points are going.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
              <Link href="/dashboard" className="hover:text-text">Dashboard</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
