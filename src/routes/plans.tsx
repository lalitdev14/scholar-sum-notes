import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PlanCards } from "@/components/PlanCards";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { freeSummariesLeft, usePlan, useRequestPro } from "@/lib/plan";
import { friendlyError } from "@/lib/utils";

export const Route = createFileRoute("/plans")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Plans — LectureLoop" },
      {
        name: "description",
        content:
          "LectureLoop is free for every student. Pro adds unlimited AI summaries of your class notes.",
      },
    ],
  }),
  component: PlansPage,
});

function PlansPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => active && setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  const { data: plan } = usePlan(signedIn === true);
  const requestPro = useRequestPro();
  const [sending, setSending] = useState(false);
  const left = freeSummariesLeft(plan);

  const [comingSoon, setComingSoon] = useState(false);
  async function request() {
    if (!plan?.canRequestPro) {
      setComingSoon(true);
      toast("Pro is coming soon! Keep using Free for now.");
      return;
    }
    setSending(true);
    try {
      await requestPro();
      toast.success("Request sent! An admin will switch you to Pro soon.");
    } catch (err) {
      toast.error(friendlyError(err, "Could not send your request. Please try again."));
    } finally {
      setSending(false);
    }
  }

  const action = !signedIn ? (
    <Button asChild className="w-full">
      <Link to="/auth">Sign in to join Pro</Link>
    </Button>
  ) : plan?.plan === "pro" ? (
    <p className="text-sm font-medium text-primary">You're on Pro. Thank you!</p>
  ) : plan?.proRequested ? (
    <Button className="w-full" disabled>
      Request sent · waiting for approval
    </Button>
  ) : comingSoon ? (
    <Button className="w-full" disabled>
      Pro is coming soon
    </Button>
  ) : (
    <Button className="w-full" onClick={() => void request()} disabled={sending}>
      {sending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Crown className="mr-2 h-4 w-4" />
      )}
      Join Pro
    </Button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {signedIn ? (
        <AuthenticatedHeader />
      ) : (
        <header className="mx-auto flex w-full max-w-[100rem] items-center justify-between px-4 py-6 sm:px-6 lg:px-10 xl:px-16">
          <Link to="/" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            <span className="font-display text-xl">LectureLoop</span>
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </header>
      )}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-14 sm:px-6 sm:py-20">
        <p className="text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Plans
        </p>
        <h1 className="mt-4 text-center text-4xl sm:text-5xl">
          Free for every student. <span className="italic">Pro</span> when you need more.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-center text-muted-foreground">
          Notes, handwriting, slides and notebooks are free. Pro removes the weekly limit on AI
          summaries of your notes.
        </p>
        {signedIn && plan && left !== null && (
          <p className="mt-6 text-center text-sm" data-testid="plan-usage">
            You're on <strong>Free</strong>: {left} of {plan.freeSummariesPerWeek} AI summaries left
            this week (resets Monday).
          </p>
        )}
        <div className="mt-10">
          <PlanCards
            current={signedIn ? plan?.plan : undefined}
            action={action}
            freeAction={
              <Button asChild variant="outline" className="w-full">
                <Link to={signedIn ? "/dashboard" : "/auth"}>
                  {signedIn ? "Continue with Free" : "Get started free"}
                </Link>
              </Button>
            }
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
