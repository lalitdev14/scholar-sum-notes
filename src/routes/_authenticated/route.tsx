import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UpdatesPopup } from "@/components/UpdatesPopup";

// Sign out after 30 days without using the app (audit L5). Supabase's own session
// timeout needs a paid plan, so the app enforces it on this device.
const LAST_ACTIVE_KEY = "lectureloop:last-active";
const INACTIVITY_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;

function readLastActive(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_ACTIVE_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function markActive() {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}

// The session was checked with the auth server this recently, for this access token: moving
// between pages reuses that check instead of waiting for a network round trip on every
// click (opening a class must respond at once). Signing out clears the saved session, so
// the local check below still sends a signed-out visitor to sign in straight away.
const VERIFIED_FOR_MS = 60_000;
let verified: { token: string; at: number } | null = null;

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async () => {
    const last = readLastActive();
    if (last && Date.now() - last > INACTIVITY_LIMIT_MS) {
      await supabase.auth.signOut();
      try {
        localStorage.removeItem(LAST_ACTIVE_KEY);
      } catch {
        /* ignore */
      }
      throw redirect({ to: "/auth" });
    }
    const { data: local } = await supabase.auth.getSession();
    const session = local.session;
    if (!session) throw redirect({ to: "/auth" });
    if (verified?.token === session.access_token && Date.now() - verified.at < VERIFIED_FOR_MS) {
      markActive();
      return { user: session.user };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      verified = null;
      throw redirect({ to: "/auth" });
    }
    verified = { token: session.access_token, at: Date.now() };
    markActive();
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  // Refresh the activity stamp while the app is in use (at most once a minute). A tab
  // left open for longer than the limit is signed out when the student comes back to it.
  useEffect(() => {
    let last = 0;
    const onActivity = () => {
      if (document.visibilityState !== "visible") return; // leaving the page isn't activity
      const stamp = readLastActive();
      if (stamp && Date.now() - stamp > INACTIVITY_LIMIT_MS) {
        void supabase.auth.signOut().then(() => navigate({ to: "/auth" }));
        return;
      }
      if (Date.now() - last < 60_000) return;
      last = Date.now();
      markActive();
    };
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onActivity);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onActivity);
    };
  }, [navigate]);

  return (
    <>
      <Outlet />
      <UpdatesPopup />
    </>
  );
}
