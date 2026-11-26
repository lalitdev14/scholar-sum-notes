import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookPlus, LayoutGrid, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SemesterSubjectsDialog } from "@/components/SemesterSubjectsDialog";
import { supabase } from "@/integrations/supabase/client";
import { pickGreeting, rememberGreeting } from "@/lib/greetings";

/**
 * Full name for the greeting with each word capitalised.
 * All-lower or all-upper names are title-cased ("lalit dev" / "LALIT DEV" → "Lalit Dev"),
 * including after a hyphen or apostrophe ("sean o'brien" → "Sean O'Brien");
 * mixed-case names keep their casing apart from the first letter ("McDonald" stays).
 */
function formatFullName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return "";
  const uniformCase = name === name.toLowerCase() || name === name.toUpperCase();
  if (uniformCase) {
    // Title-case, also after a hyphen or apostrophe: "jean-luc d'arcy" → "Jean-Luc D'Arcy".
    return name
      .toLowerCase()
      .replace(/(^|[ \-'\u2019])(\S)/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
  // A new greeting each visit, fitting the time of day (kept for this page view).
  const [greeting] = useState(() => pickGreeting());
  useEffect(() => rememberGreeting(greeting), [greeting]);
  const { data } = useQuery({
    queryKey: ["welcome-home"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { userId: "", name: "", classes: [] };
      const [{ data: profile }, { data: enrollments }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
        supabase.from("enrollments").select("class_id, created_at").eq("user_id", userId),
      ]);
      const ids = (enrollments ?? []).map((e) => e.class_id);
      const addedAt = new Map((enrollments ?? []).map((e) => [e.class_id, e.created_at ?? ""]));
      if (!ids.length) return { userId, name: profile?.full_name ?? "", classes: [] };
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
            addedAt: addedAt.get(c.id) ?? "",
            lastAt: events[0]?.[0] ?? null,
            lastWhat: events[0]?.[1],
          };
        })
        // Most recent first, then alphabetical.
        .sort(
          (a, b) =>
            (b.lastAt ?? "").localeCompare(a.lastAt ?? "") || a.subject.localeCompare(b.subject),
        );
      return { userId, name: profile?.full_name ?? "", classes: list };
    },
  });

  // "Your subjects this semester": opens by itself the first time a student with no
  // classes lands here (once per device), and from the "Update my subjects" button after.
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  // Focus goes back to "My subjects" when the form was opened from it.
  const subjectsButton = useRef<HTMLButtonElement>(null);
  const [openedFromButton, setOpenedFromButton] = useState(false);
  const autoOpened = useRef(false);
  const userId = data?.userId ?? "";
  const hasClasses = (data?.classes.length ?? 0) > 0;
  useEffect(() => {
    if (!userId || hasClasses || autoOpened.current || isSubjectsDone(userId)) return;
    autoOpened.current = true;
    // Wait for any other pop-up (e.g. an admin update) to be closed first.
    let timer: ReturnType<typeof setTimeout>;
    const tryOpen = () => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        timer = setTimeout(tryOpen, 500);
      } else setSubjectsOpen(true);
    };
    timer = setTimeout(tryOpen, 600);
    return () => clearTimeout(timer);
  }, [userId, hasClasses]);
  function closeSubjects() {
    setSubjectsOpen(false);
    if (userId) markSubjectsDone(userId);
  }

  const fullName = formatFullName(data?.name ?? "");
  const classes = data?.classes ?? [];
  const last = classes[0]?.lastAt ? classes[0] : null;
  // No activity yet: the classes they joined most recently.
  const recent = [...classes]
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.subject.localeCompare(b.subject))
    .slice(0, 3);

  // Lightened in dark mode so it reads on the dark page (src/theme.css).
  const accent = "var(--home-accent)";
  // A very dark shade of the university colour for the "continue" card.
  const deep = "color-mix(in oklab, var(--uni-primary, #57068c) 32%, #0d0a12)";
  const mono = { fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' };
  const steps = [
    ["01", "Type or handwrite", "Use the Type tab, or the Handwrite tab with a pencil."],
    ["02", "Write on your slides", "Add page → Write on slide to annotate the lecture."],
    ["03", "Summarize", "Turn what you wrote into a study summary in one click."],
  ];

  return (
    <div className="flex-1 bg-home-page">
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14 lg:px-10">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-12">
          {/* Welcome note */}
          <section aria-labelledby="welcome-title" className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p
                className="text-xs font-medium uppercase tracking-[0.2em] text-home-label"
                style={mono}
              >
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              {userId && (
                <button
                  ref={subjectsButton}
                  type="button"
                  onClick={() => {
                    setOpenedFromButton(true);
                    setSubjectsOpen(true);
                  }}
                  aria-label="Update my subjects"
                  title="Update my subjects"
                  data-testid="update-subjects"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-home-chip-line bg-home-block px-2.5 py-1.5 text-xs font-medium text-home-text transition hover:border-home-chip-line-hover hover:text-home-ink focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ outlineColor: accent }}
                >
                  <BookPlus className="h-4 w-4" style={{ color: accent }} aria-hidden="true" />
                  <span className="hidden sm:inline">My subjects</span>
                </button>
              )}
            </div>
            <h1
              id="welcome-title"
              className="mt-4 text-[2.75rem] font-bold leading-[1.02] tracking-[-0.035em] text-home-ink sm:text-6xl"
            >
              {greeting.lead}
              {fullName ? (
                <>
                  ,<br />
                  <span className="italic break-words" style={{ color: accent }}>
                    {fullName}
                  </span>
                </>
              ) : null}
              {greeting.end}
            </h1>
            <p className="mt-6 max-w-[34rem] text-[1.05rem] leading-relaxed text-home-text">
              Welcome to LectureLoop, your own notebook for every class. Type or handwrite your
              notes right next to the lecture slides, and turn them into a clear summary when it's
              time to revise.
            </p>
            <p className="mt-5 flex items-center gap-2 text-sm text-home-muted">
              <Lock className="h-3.5 w-3.5" /> Your notes are private to you.
            </p>
          </section>

          {/* Continue where you left off: the last class they were in */}
          {last ? (
            <section
              className="rounded-[1.25rem] p-6 text-white shadow-[0_24px_60px_-28px_rgba(60,10,90,0.65)] sm:p-7"
              style={{ backgroundColor: deep }}
              aria-labelledby="continue-title"
              data-testid="continue-card"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p
                  id="continue-title"
                  className="text-xs font-semibold uppercase tracking-[0.12em] text-[#d9c2f0]"
                >
                  Continue where you left off
                </p>
                <p
                  className="shrink-0 text-xs text-white/60"
                  title={ACTIVITY_LABEL[last.lastWhat ?? "opened"]}
                >
                  {capitalize(timeAgo(last.lastAt!))}
                </p>
              </div>
              <p className="mt-5 text-xs text-white/60" style={mono}>
                {last.code}
              </p>
              <p className="mt-1 truncate text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">
                {last.subject}
              </p>
              {last.professor && <p className="mt-1 text-sm text-white/70">{last.professor}</p>}
              <Link
                to="/class/$classId"
                params={{ classId: last.id }}
                className="mt-6 flex items-center justify-between rounded-xl bg-white px-5 py-3.5 text-[0.95rem] font-semibold text-[#17151c] transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Open note <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          ) : classes.length ? (
            <section
              className="min-w-0 rounded-[1.25rem] p-6 text-white sm:p-7"
              style={{ backgroundColor: deep }}
              aria-labelledby="your-classes-title"
              data-testid="your-classes-card"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p
                  id="your-classes-title"
                  className="text-xs font-semibold uppercase tracking-[0.12em] text-[#d9c2f0]"
                >
                  Your classes
                </p>
                <p className="shrink-0 text-xs text-white/60">
                  {classes.length} class{classes.length === 1 ? "" : "es"}
                </p>
              </div>
              <ul className="mt-4 space-y-2.5">
                {recent.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.07] px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-white/60" style={mono}>
                        {c.code}
                      </p>
                      <p className="line-clamp-2 break-words font-semibold leading-snug">
                        {c.subject}
                      </p>
                    </div>
                    <Link
                      to="/class/$classId"
                      params={{ classId: c.id }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#17151c] transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      aria-label={`Open ${c.subject}`}
                    >
                      Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                to="/dashboard"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white/80 underline-offset-4 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {classes.length > recent.length
                  ? `See all ${classes.length} classes on your dashboard`
                  : "See them on your dashboard"}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </section>
          ) : (
            <section
              className="rounded-[1.25rem] p-6 text-white sm:p-7"
              style={{ backgroundColor: deep }}
              aria-label="Get started"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#d9c2f0]">
                Get started
              </p>
              <p className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.02em]">
                {data && !classes.length ? "Join your first class" : "Open a class to begin"}
              </p>
              <p className="mt-1 text-sm text-white/70">
                Find your class by name or code on the dashboard.
              </p>
              <Link
                to="/dashboard"
                className="mt-6 flex items-center justify-between rounded-xl bg-white px-5 py-3.5 text-[0.95rem] font-semibold text-[#17151c] transition hover:bg-white/90"
              >
                Find a class <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          )}
        </div>

        {/* On to the dashboard */}
        <Link
          to="/dashboard"
          className="group mt-10 flex items-center gap-4 rounded-2xl border border-home-line bg-home-block p-5 transition hover:border-home-line-hover hover:shadow-[0_10px_30px_-20px_rgba(40,20,60,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: accent }}
          aria-label="Go to your dashboard"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-home-icon-bg"
            style={{ color: accent }}
          >
            <LayoutGrid className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-home-ink">Go to your dashboard</span>
            <span className="block text-sm text-home-muted">
              {data && !classes.length
                ? "You haven't joined a class yet. Find your classes on the dashboard."
                : "All your classes, notes and summaries are on your dashboard."}
            </span>
          </span>
          <ArrowRight
            className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5"
            style={{ color: accent }}
          />
        </Link>

        {/* How it works */}
        <section className="mt-10" aria-labelledby="how-title">
          <h2
            id="how-title"
            className="text-xs font-semibold uppercase tracking-[0.12em] text-home-label"
          >
            How it works
          </h2>
          <ol className="mt-4 grid overflow-hidden rounded-2xl border border-home-line bg-home-block sm:grid-cols-3">
            {steps.map(([n, title, body], i) => (
              <li
                key={n}
                className={`p-6 ${i > 0 ? "border-t border-home-line sm:border-l sm:border-t-0" : ""}`}
              >
                <span className="text-sm font-medium" style={{ ...mono, color: accent }}>
                  {n}
                </span>
                <p className="mt-3 text-lg font-semibold text-home-ink">{title}</p>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-home-body">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      {userId && (
        <SemesterSubjectsDialog
          open={subjectsOpen}
          onOpenChange={(o) => (o ? setSubjectsOpen(true) : closeSubjects())}
          onDone={closeSubjects}
          returnFocusTo={openedFromButton ? subjectsButton : undefined}
          userId={userId}
          currentClasses={classes.map((c) => ({ id: c.id, subject: c.subject, code: c.code }))}
        />
      )}
    </div>
  );
}

/** Set once a student has pressed Done on (or closed) the subjects form on this device. */
const subjectsDoneKey = (userId: string) => `lectureloop:subjects-done:${userId}`;
function isSubjectsDone(userId: string) {
  try {
    return localStorage.getItem(subjectsDoneKey(userId)) === "1";
  } catch {
    return false;
  }
}
function markSubjectsDone(userId: string) {
  try {
    localStorage.setItem(subjectsDoneKey(userId), "1");
  } catch {
    // Private mode: the pop-up may show again next time, which is harmless.
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
