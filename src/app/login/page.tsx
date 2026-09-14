import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser, supabaseConfigured, supabaseServer } from "@/lib/auth";

// Depends on who is signed in, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Sign-in failures are reported in the same generic terms whatever went wrong, so the
 * page never reveals which email addresses have accounts.
 */
const GENERIC_SIGN_IN_ERROR = "That email and password did not match an account.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; mode?: string; created?: string }>;
}) {
  const { sent, error, mode, created } = await searchParams;
  if (await currentUser()) redirect("/");

  const magicLink = mode === "link";

  async function signInWithPassword(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) redirect("/login?error=Enter+an+email+and+password");

    const supabase = await supabaseServer();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) redirect(`/login?error=${encodeURIComponent(GENERIC_SIGN_IN_ERROR)}`);
    redirect("/");
  }

  async function signUp(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) redirect("/login?mode=signup&error=Use+at+least+8+characters");

    const supabase = await supabaseServer();
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) redirect(`/login?mode=signup&error=${encodeURIComponent(signUpError.message)}`);

    // With email confirmation on, the account exists but cannot sign in until the
    // link is clicked; with it off, signing in works immediately.
    redirect("/login?created=1");
  }

  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) redirect("/login?mode=link&error=Enter+an+email+address");

    const supabase = await supabaseServer();
    const { error: linkError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
    });
    redirect(linkError ? `/login?mode=link&error=${encodeURIComponent(linkError.message)}` : "/login?sent=1");
  }

  if (!supabaseConfigured()) {
    return (
      <section className="max-w-sm">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-4 text-muted">
          Supabase is not configured, so sign-in is disabled and the app is running
          against a local development account.{" "}
          <Link href="/" className="text-accent underline">
            Go to the exam list
          </Link>
          .
        </p>
      </section>
    );
  }

  if (sent) {
    return (
      <section className="max-w-sm">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-4 text-muted">We sent you a sign-in link.</p>
      </section>
    );
  }

  const signingUp = mode === "signup";

  return (
    <section className="max-w-sm">
      <h1 className="text-2xl font-semibold">{signingUp ? "Create an account" : "Sign in"}</h1>

      {created && (
        <p className="mt-4 rounded-md border border-correct/40 bg-correct/10 px-3 py-2 text-sm">
          Account created. If email confirmation is switched on for this project, click
          the link we sent before signing in.
        </p>
      )}

      {magicLink ? (
        <form action={sendMagicLink} className="mt-6 space-y-3">
          <label htmlFor="email" className="block text-sm text-muted">
            We will email you a sign-in link — no password needed.
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
          <p className="pt-2 text-sm text-muted">
            <Link href="/login" className="text-accent underline">
              Use a password instead
            </Link>
          </p>
        </form>
      ) : (
        <form action={signingUp ? signUp : signInWithPassword} className="mt-6 space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm text-muted">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-muted">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={signingUp ? 8 : undefined}
              autoComplete={signingUp ? "new-password" : "current-password"}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
            />
          </div>

          <button type="submit" className="rounded-md bg-accent px-4 py-2 font-medium text-white">
            {signingUp ? "Create account" : "Sign in"}
          </button>

          {error && <p className="text-sm text-wrong">{error}</p>}

          <p className="pt-2 text-sm text-muted">
            {signingUp ? (
              <Link href="/login" className="text-accent underline">
                I already have an account
              </Link>
            ) : (
              <>
                <Link href="/login?mode=signup" className="text-accent underline">
                  Create an account
                </Link>
                {" · "}
                <Link href="/login?mode=link" className="text-accent underline">
                  Email me a link instead
                </Link>
              </>
            )}
          </p>
        </form>
      )}
    </section>
  );
}
