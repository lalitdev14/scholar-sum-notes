import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GraduationCap, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import aboutDesk from "@/../public/about-desk.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Behind the Initiative — Lalit Dev Jakher | LectureLoop" },
      {
        name: "description",
        content:
          "Lalit Dev Jakher is an NYU GSAS student and the creator of LectureLoop. Read the story behind the shared AI class notes platform.",
      },
      { property: "og:title", content: "Behind the Initiative — Lalit Dev Jakher | LectureLoop" },
      {
        property: "og:description",
        content:
          "The story behind LectureLoop: a student-led initiative to make class notes more useful, collaborative, and trusted.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

const philosophy = [
  { number: "01.", label: "Human-first design" },
  { number: "02.", label: "Radical clarity" },
  { number: "03.", label: "Shared growth" },
];

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
    <div className="min-h-screen bg-background">
      {signedIn ? <AuthenticatedHeader /> : <MinimalHeader />}

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24">
        <article className="surface-paper rounded-2xl p-8 md:p-16">
          <header className="mb-12 md:mb-16">
            <span className="mb-4 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              The Origin Story
            </span>
            <h1 className="text-5xl leading-[1.05] md:text-6xl">
              Behind the <span className="italic">initiative.</span>
            </h1>

            <div className="mt-10 flex flex-col gap-10 md:flex-row md:gap-12">
              <div className="w-full md:w-1/2">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted grayscale transition-all duration-700 hover:grayscale-0">
                  <img
                    src={aboutDesk}
                    alt="A notebook open on a desk with soft natural light"
                    className="h-full w-full object-cover"
                    width={1024}
                    height={1024}
                  />
                </div>
                <p className="mt-4 font-display text-xs italic text-muted-foreground">
                  Lalit Dev Jakher, NYU GSAS Student & Creator of LectureLoop
                </p>
              </div>

              <div className="w-full md:w-1/2">
                <p className="font-display text-xl italic leading-relaxed text-muted-foreground">
                  "I didn't set out to build another platform. I set out to make the lecture hall feel a little
                  less lonely for every student taking notes in it."
                </p>
                <div className="mt-8 space-y-5 leading-relaxed text-foreground">
                  <p>
                    It started in a seminar at NYU GSAS. I noticed that every student was quietly building the
                    same understanding alone — their own notes, their own summary, their own anxiety about what
                    they might have missed.
                  </p>
                  <p>
                    LectureLoop is built on a simple idea: if we take notes together, the whole class learns
                    better. The AI doesn't add facts from outside the room; it only polishes what the room already
                    knows.
                  </p>
                </div>
              </div>
            </div>
          </header>

          <div className="grid gap-10 border-t border-border pt-12 md:grid-cols-12 md:gap-12 md:pt-16">
            <div className="md:col-span-4">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-foreground">
                The Philosophy
              </h2>
              <ul className="space-y-4 text-sm font-medium text-muted-foreground">
                {philosophy.map((item) => (
                  <li key={item.label} className="flex gap-3">
                    <span>{item.number}</span>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-8">
              <div className="leading-relaxed text-foreground">
                <p className="mb-6">
                  The initiative was born from a need for clarity, not noise. As a student, I wanted one place
                  where I could see the lecture through my classmates' eyes — without the clutter of forums, the
                  friction of group chats, or the risk of misinformation from outside sources.
                </p>
                <p className="mb-6">
                  LectureLoop keeps the classroom at the center. Notes are private to each student until the AI
                  merges them into a single refined summary. Faculty can review the result, so students know the
                  final version has been seen by someone who was there too.
                </p>
                <p>
                  Today, it remains a founder-led project. Every feature is designed to make trust, focus, and
                  collaboration the default experience in a lecture hall.
                </p>
              </div>

              <div className="mt-12 flex flex-col items-start gap-6 border-t border-border pt-8 sm:flex-row sm:items-center">
                <div className="h-px w-12 bg-border" />
                <span className="font-display text-2xl text-foreground">Lalit Dev Jakher</span>
                <span className="text-sm text-muted-foreground">NYU GSAS Student</span>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-border pt-10">
            <Button asChild size="lg">
              <Link to={signedIn ? "/dashboard" : "/auth"}>
                {signedIn ? "Back to your dashboard" : "Try LectureLoop"}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="mailto:lalit.dev.jakher@nyu.edu">
                <Mail className="mr-2 h-4 w-4" />
                Get in touch
              </a>
            </Button>
          </div>
        </article>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row">
          <span className="text-sm text-muted-foreground">
            LectureLoop — shared notes for every seat in the room.
          </span>
          <Link to="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
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
