import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/auth";

/** Exchanges the emailed one-time code for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", url.origin));
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }
  return NextResponse.redirect(new URL("/login?error=Missing+sign-in+code", url.origin));
}
