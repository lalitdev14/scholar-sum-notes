import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { GraduationCap, NotebookPen, Sparkles, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LectureLoop — One refined class summary from everyone's notes" },
      {
        name: "description",
        content:
          "Students take notes in class, AI merges them into one refined summary per course with professor and class details.",
      },
      { property: "og:title", content: "LectureLoop — Shared AI class notes" },
      {
        property: "og:description",
        content: "Every student's notes, one refined class summary on the dashboard.",
      },
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
    body: "Type notes straight into the page. They're private to you and saved as you go.",
  },
  {
    icon: Sparkles,
    title: "AI refines the room",
    body: "Every student's notes for that class get merged, deduplicated and rewritten cleanly.",
  },
  {
    icon: Users,
    title: "Everyone reads it",
    body: "The refined summary lands on the shared dashboard for the whole class.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          <span className="font-display text-xl">LectureLoop</span>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Collaborative class notes
          </p>
          <h1 className="mt-5 text-5xl leading-[1.05] sm:text-6xl">
            The whole lecture,
            <span className="italic"> written by the whole class.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Take your own notes during class. AI merges everyone's notes into one refined summary per
            course — with professor and class details — for all students to read.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Start taking notes</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/dashboard">View class dashboard</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
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
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          LectureLoop — shared notes for every seat in the room.
        </div>
      </footer>
    </div>
  );
}
