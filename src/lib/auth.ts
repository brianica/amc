import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export interface SessionUser {
  id: string;
  email: string;
  isDev: boolean;
}

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Development stand-in for a signed-in user, so the app can be run before a Supabase
 * project exists. It refuses to activate in production: shipping without real auth
 * would silently give every visitor the same account.
 */
const DEV_USER: SessionUser = { id: "dev-user", email: "dev@localhost", isDev: true };

/**
 * True when this is a production deployment with no Supabase project behind it.
 *
 * The root layout turns this into an explanatory page. It is reported rather than
 * thrown because throwing from every page produced a bare 500 whose cause was only
 * visible in the server log — a missing setting should say which setting.
 */
export function authUnconfiguredInProduction(): boolean {
  return !supabaseConfigured() && process.env.NODE_ENV === "production";
}

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies are read-only; the
            // middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

export async function currentUser(): Promise<SessionUser | null> {
  // Never the development account in production: that would hand every visitor the
  // same data. Signed out is the safe answer, and the layout explains why.
  if (authUnconfiguredInProduction()) return null;
  if (!supabaseConfigured()) return DEV_USER;

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "", isDev: false };
}
