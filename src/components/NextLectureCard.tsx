import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { SplitFlap } from "@/components/SplitFlap";
import { useMySections } from "@/lib/class-sections";
import { isManualSection, manualLabel } from "@/lib/manual-schedule";
import {
  clockDigits,
  durationWords,
  findNextLecture,
  formatLectureTime,
  timeLeft,
  type ScheduledClass,
} from "@/lib/next-lecture";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The current time, updated every second on the second (null until mounted, to keep SSR stable). */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 1000 - (d.getTime() % 1000) + 5);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

type Status = "loading" | "invite" | "none" | "later" | "soon" | "now";

/**
 * Home page "Next lecture" card: counts down to the soonest lecture across the student's
 * classes with a saved NYU section (New York time). Split-flap HH:MM:SS within 24 hours,
 * otherwise the day and time; "happening now" during a lecture.
 */
export function NextLectureCard({
  classes,
  onSetSections,
}: {
  classes: { id: string; subject: string; code: string }[];
  /** Opens the place where sections are set (the subjects form). */
  onSetSections: () => void;
}) {
  const now = useNow();
  const { data: saved, isPending, isError } = useMySections();

  const items = useMemo<ScheduledClass[]>(() => {
    if (!saved) return [];
    return classes.flatMap((c) => {
      const s = saved.get(c.id);
      return s
        ? [
            {
              classId: c.id,
              name: c.subject,
              code: c.code,
              // Times the student entered themselves read "Your times · Tue, Thu 2:00–3:15 pm".
              sectionNo: isManualSection(s) ? "" : s.sectionNo,
              meets: isManualSection(s) ? manualLabel(s.meets) : s.meets,
              meetings: s.meetings,
              startDate: s.startDate,
              endDate: s.endDate,
            },
          ]
        : [];
    });
  }, [saved, classes]);

  const next = now && items.length ? findNextLecture(items, now) : null;

  let status: Status;
  if (!now || (isPending && !isError)) status = "loading";
  else if (!items.length) status = "invite";
  else if (!next) status = "none";
  else if (next.status === "now") status = "now";
  else if (next.start.getTime() - now.getTime() <= DAY_MS) status = "soon";
  else status = "later";

  // Text/icon colour (lightened in dark theme) and the button fill (white text on it).
  const accent = "var(--home-accent)";
  const fill = "var(--uni-primary, #57068c)";
  const left = now && next ? timeLeft(next.status === "now" ? next.end : next.start, now) : null;
  const when = now && next ? formatLectureTime(next.start, now) : "";
  const name = next?.item.name ?? "";
  const detail = next
    ? [next.item.code, next.item.sectionNo && `Section ${next.item.sectionNo}`, next.item.meets]
        .filter(Boolean)
        .join(" · ")
    : "";

  // Screen readers get the time in words, changing once a minute (not announced every second).
  const spoken =
    status === "soon" && left
      ? `${name} starts in ${durationWords(left.total)}.`
      : status === "now" && left
        ? `${name} is happening now and ends in ${durationWords(left.total)}.`
        : status === "later"
          ? `Next lecture: ${name}, ${when}.`
          : "";

  return (
    <section
      className="mt-10 rounded-2xl border border-home-line bg-home-block p-5 sm:p-6"
      aria-labelledby="next-lecture-title"
      data-testid="next-lecture-card"
      data-status={status}
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="next-lecture-title"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-home-label"
        >
          <CalendarClock className="h-4 w-4" style={{ color: accent }} aria-hidden="true" />
          Next lecture
        </h2>
        {(status === "soon" || status === "now" || status === "later" || status === "none") && (
          <button
            type="button"
            onClick={onSetSections}
            className="shrink-0 text-xs font-medium text-home-label underline-offset-4 hover:text-home-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: accent }}
            data-testid="next-lecture-change-sections"
          >
            Change sections
          </button>
        )}
      </div>

      {status === "loading" && (
        <p className="mt-3 h-[4.5rem] text-sm text-home-muted" aria-busy="true">
          Loading your timetable…
        </p>
      )}

      {status === "invite" && (
        <div className="mt-3" data-testid="next-lecture-invite">
          <p className="text-lg font-semibold text-home-ink">See when your next lecture starts</p>
          <p className="mt-1 text-sm text-home-body">
            {classes.length
              ? "Pick your NYU section (or enter your class times) for each class and we'll count down to your next lecture."
              : "Add your subjects and pick your NYU section or enter your class times, and we'll count down to your next lecture."}
          </p>
          <button
            type="button"
            onClick={onSetSections}
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: fill, outlineColor: accent }}
            data-testid="next-lecture-set-sections"
          >
            Set your sections
          </button>
        </div>
      )}

      {status === "none" && (
        <div className="mt-3" data-testid="next-lecture-none">
          <p className="text-lg font-semibold text-home-ink">No upcoming lectures</p>
          <p className="mt-1 text-sm text-home-body">
            Your sections have no more lectures this term. Pick next term's sections when you have
            them.
          </p>
        </div>
      )}

      {(status === "soon" || status === "now") && left && (
        <div className="mt-3" data-testid="next-lecture-countdown">
          <p
            className="text-[0.95rem] font-semibold text-home-ink"
            data-testid="next-lecture-title"
            aria-hidden="true"
          >
            {status === "now" ? (
              <>
                {name} · <span style={{ color: accent }}>happening now</span> · ends in
              </>
            ) : (
              <>{name} starts in</>
            )}
          </p>
          <div className="mt-2.5 max-w-full overflow-hidden">
            <SplitFlap value={clockDigits(left.total, status === "now")} />
          </div>
          <p className="mt-2.5 text-sm text-home-muted" data-testid="next-lecture-when">
            {status === "now" ? `Started ${when}` : when}
            {detail ? ` · ${detail}` : ""}
          </p>
        </div>
      )}

      {status === "later" && (
        <div className="mt-3" data-testid="next-lecture-later" aria-hidden="true">
          <p
            className="truncate text-lg font-semibold text-home-ink"
            data-testid="next-lecture-title"
          >
            {name}
          </p>
          <p
            className="mt-0.5 text-2xl font-bold tracking-[-0.02em]"
            style={{ color: accent }}
            data-testid="next-lecture-when"
          >
            {when}
          </p>
          {detail && <p className="mt-1 text-sm text-home-muted">{detail}</p>}
        </div>
      )}

      {spoken && (
        <p className="sr-only" data-testid="next-lecture-sr">
          {spoken}
          {detail ? ` ${detail}.` : ""}
        </p>
      )}
    </section>
  );
}
