"use client";

import { useEffect } from "react";

/**
 * A server-action redirect (saveAttempt -> here) is a client-side transition, not a
 * full page load, and Next does not always reset scroll position for one the way a
 * <Link> click does. Landing scrolled to wherever the long review form left off — not
 * this page's own top — is the actual bug this works around.
 */
export function ScrollToTop() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return null;
}
