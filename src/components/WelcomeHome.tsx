import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  LayoutDashboard,
  NotebookPen,
  PenLine,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The home page for a signed-in student: a short welcome note, then the way on to the
 * dashboard and straight into each of their classes.
 */
export function WelcomeHome() {
  const { data } = useQuery({
    queryKey: ["welcome-home"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { name: "", classes: [] };
      const [{ data: profile }, { data: enrollments }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
        supabase.from("enrollments").select("class_id").eq("user_id", userId),
      ]);
      const ids = (enrollments ?? []).map((e) => e.class_id);
      if (!ids.length) return { name: profile?.full_name ?? "", classes: [] };
      const [{ data: classes }, { data: notes }] = await Promise.all([
        supabase.from("classes").select("id, subject, code, professor").in("id", ids),
        supabase
          .from("notes")
          .select("class_id, updated_at")
          .eq("user_id", userId)
          .in("class_id", ids),
      ]);
      const touched = new Map((notes ?? []).map((n) => [n.class_id, n.updated_at]));
      const list = (classes ?? [])
        .map((c) => ({ ...c, updatedAt: touched.get(c.id) ?? null }))
        // Most recently written in first, then alphabetical.
        .sort(
          (a, b) =>
            (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
            a.subject.localeCompare(b.subject),
        );
      return { name: profile?.full_name ?? "", classes: list };
    },
  });

  const first = (data?.name ?? "").trim().split(/\s+/)[0];
  const classes = data?.classes ?? [];
  const shown = classes.slice(0, 6);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
      {/* Welcome note */}
      <section
        className="surface-paper relative overflow-hidden rounded-2xl p-6 sm:p-10"
        aria-labelledby="welcome-title"
      >
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 id="welcome-title" className="mt-3 text-3xl leading-tight sm:text-5xl">
          {greeting()}
          {first ? (
            <>
              , <span className="italic">{first}</span>
            </>
          ) : null}
          .
        </h1>
        <div className="mt-5 max-w-2xl space-y-3 text-base text-muted-foreground sm:text-lg">
          <p>
            Welcome to LectureLoop, your own notebook for every class. Type or handwrite your notes
            right next to the lecture slides, and turn them into a clear summary when it's time to
            revise.
          </p>
          <p>Your notes are private to you. Pick up where you left off below.</p>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/dashboard">
              <LayoutDashboard className="mr-2 h-4 w-4" /> Go to your dashboard
            </Link>
          </Button>
          {shown[0] && (
            <Button asChild size="lg" variant="outline">
              <Link to="/class/$classId" params={{ classId: shown[0].id }}>
                <PenLine className="mr-2 h-4 w-4" /> Continue {shown[0].code || shown[0].subject}
              </Link>
            </Button>
          )}
        </div>
      </section>

      {/* Classes */}
      <section className="mt-10" aria-labelledby="home-classes">
        <div className="flex items-end justify-between gap-3">
          <h2 id="home-classes" className="text-2xl">
            Your classes
          </h2>
          {classes.length > 0 && (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {classes.length > shown.length ? `All ${classes.length} classes` : "Dashboard"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        {data === undefined ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface-paper h-28 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : shown.length ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="home-classes">
            {shown.map((c) => (
              <li key={c.id}>
                <Link
                  to="/class/$classId"
                  params={{ classId: c.id }}
                  className="surface-paper group flex h-full flex-col rounded-xl p-5 transition-shadow hover:shadow-md"
                >
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {c.code}
                  </span>
                  <span className="mt-1 text-lg font-medium leading-snug">{c.subject}</span>
                  {c.professor && (
                    <span className="mt-0.5 text-sm text-muted-foreground">{c.professor}</span>
                  )}
                  <span className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
                    {c.updatedAt
                      ? `Last written ${new Date(c.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                      : "No notes yet"}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="surface-paper mt-4 rounded-xl p-6 text-sm text-muted-foreground">
            You haven't joined a class yet.{" "}
            <Link to="/dashboard" className="font-medium text-primary hover:underline">
              Find your classes on the dashboard
            </Link>{" "}
            to start taking notes.
          </div>
        )}
      </section>

      {/* Quick tips */}
      <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label="Tips">
        {[
          [
            NotebookPen,
            "Type or handwrite",
            "Use the Type tab, or the Handwrite tab with a pencil.",
          ],
          [BookOpen, "Write on your slides", "Add page → Write on slide to annotate the lecture."],
          [Sparkles, "Summarize", "Turn what you wrote into a study summary in one click."],
        ].map(([Icon, title, body]) => {
          const I = Icon as typeof NotebookPen;
          return (
            <div key={title as string} className="rounded-xl border border-border/60 p-4">
              <I className="h-4 w-4 text-accent" />
              <p className="mt-2 text-sm font-medium">{title as string}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body as string}</p>
            </div>
          );
        })}
      </section>
    </main>
  );
}
