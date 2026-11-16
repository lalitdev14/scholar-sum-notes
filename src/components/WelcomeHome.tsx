import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  History,
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

type Activity = "typed" | "handwriting" | "opened";
const ACTIVITY_LABEL: Record<Activity, string> = {
  typed: "You last typed notes here",
  handwriting: "You last wrote by hand here",
  opened: "You were last here",
};

/** The class last opened on this device (set by the class page). */
export const LAST_CLASS_KEY = "lectureloop:last-class";
function lastVisit(): { id: string; at: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_CLASS_KEY) ?? "null");
    return v && typeof v.id === "string" && typeof v.at === "number" ? v : null;
  } catch {
    return null;
  }
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"} ago`;
  if (s < 3600) return n(Math.max(1, Math.round(s / 60)), "minute");
  if (s < 86400) return n(Math.round(s / 3600), "hour");
  if (s < 2 * 86400) return "yesterday";
  if (s < 7 * 86400) return `${Math.round(s / 86400)} days ago`;
  return `on ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
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
      const [{ data: classes }, { data: notes }, { data: pages }] = await Promise.all([
        supabase.from("classes").select("id, subject, code, professor").in("id", ids),
        supabase
          .from("notes")
          .select("class_id, updated_at")
          .eq("user_id", userId)
          .in("class_id", ids),
        supabase
          .from("handwriting_pages")
          .select("class_id, updated_at")
          .eq("user_id", userId)
          .in("class_id", ids)
          .order("updated_at", { ascending: false })
          .limit(200),
      ]);
      const typed = new Map((notes ?? []).map((n) => [n.class_id, n.updated_at]));
      const drawn = new Map<string, string>();
      for (const pg of pages ?? [])
        if (!drawn.has(pg.class_id)) drawn.set(pg.class_id, pg.updated_at);
      const visit = lastVisit();
      const list = (classes ?? [])
        .map((c) => {
          // What happened last in this class: typed notes, handwriting, or just opened it.
          const events: [string, Activity][] = [];
          if (typed.get(c.id)) events.push([typed.get(c.id)!, "typed"]);
          if (drawn.get(c.id)) events.push([drawn.get(c.id)!, "handwriting"]);
          if (visit?.id === c.id) events.push([new Date(visit.at).toISOString(), "opened"]);
          events.sort((a, b) => b[0].localeCompare(a[0]));
          const written = [typed.get(c.id), drawn.get(c.id)].filter(Boolean).sort().pop() ?? null;
          return {
            ...c,
            updatedAt: written,
            lastAt: events[0]?.[0] ?? null,
            lastWhat: events[0]?.[1],
          };
        })
        // Most recent first, then alphabetical.
        .sort(
          (a, b) =>
            (b.lastAt ?? "").localeCompare(a.lastAt ?? "") || a.subject.localeCompare(b.subject),
        );
      return { name: profile?.full_name ?? "", classes: list };
    },
  });

  const first = (data?.name ?? "").trim().split(/\s+/)[0];
  const classes = data?.classes ?? [];
  const last = classes[0]?.lastAt ? classes[0] : null;

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
          <p>Your notes are private to you.</p>
        </div>
      </section>

      {/* Continue where you left off: the last class they were in */}
      {last && (
        <section
          className="mt-6 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.04] p-5 sm:p-6"
          aria-labelledby="continue-title"
          data-testid="continue-card"
        >
          <p
            id="continue-title"
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary"
          >
            <History className="h-3.5 w-3.5" /> Continue where you left off
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {last.code}
              </p>
              <p className="truncate text-xl font-medium sm:text-2xl">{last.subject}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[
                  last.professor,
                  `${ACTIVITY_LABEL[last.lastWhat ?? "opened"]} ${timeAgo(last.lastAt!)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/class/$classId" params={{ classId: last.id }}>
                <PenLine className="mr-2 h-4 w-4" /> Continue where you left off
              </Link>
            </Button>
          </div>
        </section>
      )}

      {/* On to the dashboard: every class, note and summary is there */}
      <section
        className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border/60 p-6 text-center sm:flex-row sm:justify-between sm:text-left"
        aria-label="Dashboard"
      >
        <p className="text-sm text-muted-foreground sm:text-base">
          {data && !classes.length
            ? "You haven't joined a class yet. Find your classes on the dashboard."
            : "All your classes, notes and summaries are on your dashboard."}
        </p>
        <Button
          asChild
          size="lg"
          variant={last ? "outline" : "default"}
          className="w-full sm:w-auto"
        >
          <Link to="/dashboard">
            <LayoutDashboard className="mr-2 h-4 w-4" /> Go to your dashboard
          </Link>
        </Button>
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
