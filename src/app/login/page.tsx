import { redirect } from "next/navigation";
import { currentUser, supabaseConfigured, supabaseServer } from "@/lib/auth";


// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  if (await currentUser()) redirect("/");

  async function signIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) redirect("/login?error=Enter+an+email+address");

    const supabase = await supabaseServer();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
    });
    redirect(signInError ? `/login?error=${encodeURIComponent(signInError.message)}` : "/login?sent=1");
  }

  return (
    <section className="max-w-sm">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      {!supabaseConfigured() ? (
        <p className="mt-4 text-muted">
          Supabase is not configured, so sign-in is disabled and the app is running
          against a local development account.
        </p>
      ) : sent ? (
        <p className="mt-4">Check your email for a sign-in link.</p>
      ) : (
        <form action={signIn} className="mt-6 space-y-3">
          <label htmlFor="email" className="block text-sm text-muted">
            We will email you a sign-in link — no password to remember.
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-border bg-surface px-3 py-2"
            placeholder="you@example.com"
          />
          <button type="submit" className="rounded-md bg-accent px-4 py-2 font-medium text-white">
            Email me a link
          </button>
          {error && <p className="text-sm text-wrong">{error}</p>}
        </form>
      )}
    </section>
  );
}
