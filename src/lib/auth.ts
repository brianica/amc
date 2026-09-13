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

export function assertAuthConfigured(): void {
  if (!supabaseConfigured() && process.env.NODE_ENV === "production") {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
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
  assertAuthConfigured();
  if (!supabaseConfigured()) return DEV_USER;

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "", isDev: false };
}
