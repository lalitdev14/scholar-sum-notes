import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { BookOpen, GraduationCap, NotebookPen, Sparkles } from "lucide-react";

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

const steps = [
  {
    icon: GraduationCap,
    title: "Pick your class",
    body: "Choose the subject you're sitting in, with the professor and class code attached.",
  },
  {
    icon: NotebookPen,
    title: "Write as it happens",
    body: "Type notes straight into the page and save them when you're ready. They're private to you.",
  },
  {
    icon: Sparkles,
    title: "Summarize your notes",
    body: "One click turns everything you wrote into a comprehensive, well-organised summary.",
  },
  {
    icon: BookOpen,
    title: "Review anytime",
    body: "Your notes, summaries, slides and bookmarks stay together on your dashboard.",
  },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(!!data.session);
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
    <div className="min-h-screen">
      {signedIn ? (
        <AuthenticatedHeader />
      ) : (
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            <span className="font-display text-xl">LectureLoop</span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </header>
      )}


      <main>
        <section className="mx-auto max-w-4xl px-4 sm:px-6 pb-16 pt-16 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Your personal class notebook
          </p>
          <h1 className="mt-5 text-4xl leading-[1.1] sm:text-6xl">
            Your notes,
            <span className="italic"> summarized for you.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Take your own notes during class — typed or handwritten, right next to the lecture slides.
            Then get a comprehensive AI summary of everything you wrote, ready for revision.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to={signedIn ? "/dashboard" : "/auth"}>
                {signedIn ? "Back to your dashboard" : "Start taking notes"}
              </Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-24">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.title} className="surface-paper rounded-xl p-6">
                <step.icon className="h-5 w-5 text-accent" />
                <h2 className="mt-4 text-xl">{step.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row">
          <span className="text-sm text-muted-foreground">
            LectureLoop — your notes, summarized.
          </span>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="text-sm font-medium text-primary hover:underline">
              Privacy
            </Link>
            <Link to="/about" className="text-sm font-medium text-primary hover:underline">
              About
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
