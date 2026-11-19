import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WelcomeHome } from "@/components/WelcomeHome";
import { LandingHeader, LandingMain } from "@/components/LandingBold";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "LectureLoop — Your class notes, summarized by AI" },
      {
        name: "description",
        content:
          "Take your own notes for every class — typed or handwritten, next to the lecture slides — and get a comprehensive AI summary of what you wrote.",
      },
      {
        property: "og:title",
        content: "LectureLoop — Your class notes, summarized by AI",
      },
      {
        property: "og:description",
        content: "Your own class notes and a comprehensive AI summary of them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  // The server always renders the public page (search engines, and no blank page if the
  // scripts fail to load). Signed-in students switch to the welcome note before the first
  // paint: the saved session is checked synchronously in a layout effect.
  const [signedIn, setSignedIn] = useState(false);

  useLayoutEffect(() => {
    try {
      if (Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k))) setSignedIn(true);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(!!data.session);
      // The app has taken over: stop hiding the public page (see the root layout).
      document.documentElement.removeAttribute("data-signed-in");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {signedIn ? <AuthenticatedHeader /> : <LandingHeader />}
      {signedIn ? <WelcomeHome /> : <LandingMain />}

      <SiteFooter />
    </div>
  );
}
