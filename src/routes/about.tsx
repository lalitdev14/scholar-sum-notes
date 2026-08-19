import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GraduationCap, Mail, Linkedin, Github } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Lalit Dev Jakher | LectureLoop" },
      {
        name: "description",
        content:
          "Lalit Dev Jakher is an NYU GSAS student and the creator of LectureLoop, a shared AI class notes platform for students.",
      },
      { property: "og:title", content: "About — Lalit Dev Jakher | LectureLoop" },
      {
        property: "og:description",
        content:
          "NYU GSAS student building LectureLoop: shared AI class notes for every seat in the room.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
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
    <div className="min-h-screen bg-white">
      {signedIn ? <AuthenticatedHeader /> : <MinimalHeader />}

      <main className="mx-auto max-w-3xl px-6 py-16">
        <section className="text-center">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-primary text-white shadow-md">
            <span className="font-display text-4xl font-bold">L</span>
          </div>
          <h1 className="mt-8 text-4xl font-bold text-black sm:text-5xl">
            Lalit Dev Jakher
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            NYU GSAS Student & Creator of LectureLoop
          </p>
        </section>

        <section className="mt-12 space-y-6 text-lg leading-relaxed text-foreground">
          <p>
            Hi, I’m Lalit — a graduate student at the{" "}
            <strong className="text-black">New York University Graduate School of Arts and Science (GSAS)</strong>.
            I built LectureLoop to make class notes more useful, more collaborative, and less lonely.
          </p>
          <p>
            LectureLoop lets students take notes together. Every student writes what they hear and understand;
            our AI merges those notes into one clean, refined summary per class — no outside facts, just the
            classroom content, polished and shared.
          </p>
          <p>
            Whether you missed a lecture or want to compare your understanding with classmates, the dashboard
            gives you a single, trustworthy view of what happened in class.
          </p>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          <a
            href="mailto:lalit.dev.jakher@nyu.edu"
            className="surface-paper flex items-center justify-center gap-2 rounded-xl p-4 transition-colors hover:bg-accent"
          >
            <Mail className="h-5 w-5 text-primary" />
            <span className="font-medium">Email</span>
          </a>
          <a
            href="https://www.linkedin.com/school/nyu/"
            target="_blank"
            rel="noopener noreferrer"
            className="surface-paper flex items-center justify-center gap-2 rounded-xl p-4 transition-colors hover:bg-accent"
          >
            <Linkedin className="h-5 w-5 text-primary" />
            <span className="font-medium">LinkedIn</span>
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="surface-paper flex items-center justify-center gap-2 rounded-xl p-4 transition-colors hover:bg-accent"
          >
            <Github className="h-5 w-5 text-primary" />
            <span className="font-medium">GitHub</span>
          </a>
        </section>

        <div className="mt-12 flex justify-center">
          <Button asChild size="lg">
            <Link to={signedIn ? "/dashboard" : "/auth"}>
              {signedIn ? "Back to your dashboard" : "Try LectureLoop"}
            </Link>
          </Button>
        </div>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          LectureLoop — shared notes for every seat in the room.
        </div>
      </footer>
    </div>
  );
}

function MinimalHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link to="/" className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5" />
        <span className="font-display text-xl">LectureLoop</span>
      </Link>
      <Button asChild variant="outline" size="sm">
        <Link to="/auth">Sign in</Link>
      </Button>
    </header>
  );
}
