import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Check, Loader2 } from "lucide-react";
import {
  getNyuSections,
  getNyuTerms,
  type NyuCourse,
  type NyuSection,
  type NyuTerm,
} from "@/lib/nyu-courses.functions";
import { describeMeetings } from "@/lib/meeting-times";
import {
  deleteSection,
  saveSection,
  useMySections,
  useRefreshSections,
  type SavedSection,
} from "@/lib/class-sections";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, friendlyError } from "@/lib/utils";

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function formatDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Section A · T 11a-1:30p" for a saved or listed section. */
function sectionLabel(s: { no?: string; sectionNo?: string; meets: string }) {
  const no = s.no ?? s.sectionNo ?? "";
  return `Section ${no}${s.meets ? ` · ${s.meets}` : ""}`;
}

/**
 * Lists a course's NYU sections for a term (from NYU class search) and lets the student pick
 * theirs. Choosing is optional; a lookup failure shows a message with Try again.
 */
export function SectionPickerDialog({
  open,
  onOpenChange,
  code,
  title,
  termId,
  termLabel,
  selectedNo,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  title: string;
  /** FOSE term id to show first (e.g. the saved section's term). */
  termId?: string | null;
  /** Term label of the class (e.g. "Fall 2026"), used when there is no term id. */
  termLabel?: string | null;
  /** The section chosen now, if any. */
  selectedNo?: string | null;
  /** Called with the chosen section, or null for "no section". */
  onPick: (section: NyuSection | null) => void | Promise<void>;
}) {
  const fetchTerms = useServerFn(getNyuTerms);
  const fetchSections = useServerFn(getNyuSections);
  const termSelectId = useId();
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const termsQuery = useQuery({
    queryKey: ["nyu-terms"],
    enabled: open,
    staleTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<NyuTerm[]> => (await fetchTerms()).terms,
  });
  const terms = termsQuery.data;

  useEffect(() => {
    if (!open) return;
    setBusy(null);
    if (termId) setTerm(termId);
    else setTerm("");
  }, [open, termId]);
  useEffect(() => {
    if (!open || term || !terms?.length) return;
    const byLabel = termLabel
      ? terms.find((t) => t.label.toLowerCase() === termLabel.trim().toLowerCase())
      : undefined;
    setTerm((byLabel ?? terms.find((t) => t.current) ?? terms[0]!).id);
  }, [open, term, terms, termLabel]);

  const sections = useQuery({
    queryKey: ["nyu-sections", term, code.trim().toUpperCase()],
    enabled: open && !!term && !!code,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => (await fetchSections({ data: { code, term } })).sections,
  });

  async function choose(section: NyuSection | null) {
    setBusy(section?.no ?? "__none");
    try {
      await onPick(section);
      onOpenChange(false);
    } catch {
      // onPick reports its own error; keep the list open.
    } finally {
      setBusy(null);
    }
  }

  const termOptions =
    terms ?? (termId ? [{ id: termId, label: `Term ${termId}`, current: true }] : []);
  const list = sections.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        className="flex max-h-[88dvh] flex-col gap-4 overflow-hidden sm:max-w-lg"
        data-testid="section-picker"
      >
        <DialogHeader>
          <DialogTitle>Your section of {code}</DialogTitle>
          <DialogDescription>
            {title}. Pick the section you're registered in so LectureLoop knows when your class
            meets. This is optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor={termSelectId}>Term</Label>
          <Select value={term} onValueChange={setTerm} disabled={!termOptions.length}>
            <SelectTrigger id={termSelectId} aria-label="Term" data-testid="section-term">
              <SelectValue placeholder="Loading…" />
            </SelectTrigger>
            <SelectContent>
              {termOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1" aria-live="polite">
          {sections.isError || (termsQuery.isError && !term) ? (
            <div
              role="alert"
              className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              data-testid="section-error"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">We couldn't reach NYU's class search.</p>
                <p className="mt-1">
                  Your class is still added. Try again in a moment, or set your section later.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  data-testid="section-retry"
                  onClick={() =>
                    void (sections.isError ? sections.refetch() : termsQuery.refetch())
                  }
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : !term || sections.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading sections…
            </p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="section-empty">
              NYU lists no sections of {code} in this term. Try another term.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border" aria-label={`Sections of ${code}`}>
              {list.map((s) => {
                const picked = selectedNo === s.no;
                const dates =
                  s.startDate && s.endDate
                    ? `${formatDate(s.startDate)} – ${formatDate(s.endDate)}`
                    : "";
                return (
                  <li key={s.no}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:opacity-60",
                        picked && "bg-muted/60",
                      )}
                      aria-pressed={picked}
                      disabled={!!busy}
                      data-testid={`section-option-${slug(s.no)}`}
                      onClick={() => void choose(s)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-semibold">Section {s.no}</span>
                          {s.type && (
                            <span className="text-xs text-muted-foreground">{s.type}</span>
                          )}
                        </span>
                        <span className="block text-sm">
                          {s.meetings.length ? describeMeetings(s.meetings) : s.meets || "TBA"}
                          {s.meetings.length && s.meets ? (
                            <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                              ({s.meets})
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {[s.instructor || "Instructor TBA", dates].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="mt-0.5 shrink-0">
                        {busy === s.no ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : picked ? (
                          <Check className="h-4 w-4" aria-label="Your section" />
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {selectedNo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!!busy}
              data-testid="section-clear"
              onClick={() => void choose(null)}
            >
              No section
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!busy}
            onClick={() => onOpenChange(false)}
          >
            {selectedNo ? "Close" : "Skip for now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Opens the picker for an enrolled class and saves the choice straight away. */
export function ClassSectionButton({
  classId,
  code,
  subject,
  termLabel,
  className,
  tone = "default",
}: {
  classId: string;
  code: string;
  subject: string;
  termLabel?: string | null;
  className?: string;
  tone?: "default" | "quiet";
}) {
  const [open, setOpen] = useState(false);
  const { data: saved } = useMySections();
  const refresh = useRefreshSections();
  const current: SavedSection | undefined = saved?.get(classId);

  async function onPick(section: NyuSection | null) {
    try {
      if (section) await saveSection(classId, section);
      else await deleteSection(classId);
      refresh();
      toast.success(
        section ? `Saved section ${section.no} for ${subject}` : `Section cleared for ${subject}`,
      );
    } catch (err) {
      toast.error(friendlyError(err, "Could not save your section"));
      throw err;
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={tone === "quiet" ? "ghost" : "outline"}
        size="sm"
        className={cn("h-8 max-w-full gap-1.5", className)}
        aria-label={
          current
            ? `Change your section of ${subject} (now ${sectionLabel(current)})`
            : `Set your section of ${subject}`
        }
        data-testid={`section-button-${classId}`}
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{current ? sectionLabel(current) : "Set your section"}</span>
      </Button>
      <SectionPickerDialog
        open={open}
        onOpenChange={setOpen}
        code={code}
        title={subject}
        termId={current?.term ?? null}
        termLabel={termLabel ?? null}
        selectedNo={current?.sectionNo ?? null}
        onPick={onPick}
      />
    </>
  );
}

/** For a course about to be added: picks a section to save once the class is added. */
export function PendingSectionButton({
  course,
  termId,
  value,
  onChange,
}: {
  course: NyuCourse;
  termId: string;
  value: NyuSection | null;
  onChange: (section: NyuSection | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 max-w-full gap-1.5"
        aria-label={
          value
            ? `Change section of ${course.code} (now ${sectionLabel(value)})`
            : `Choose your section of ${course.code} (optional)`
        }
        data-testid={`pending-section-${slug(course.code)}`}
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{value ? sectionLabel(value) : "Choose section"}</span>
      </Button>
      <SectionPickerDialog
        open={open}
        onOpenChange={setOpen}
        code={course.code}
        title={course.title}
        termId={value?.term ?? termId}
        selectedNo={value?.no ?? null}
        onPick={onChange}
      />
    </>
  );
}

/** In the subjects form: an optional section choice for each course about to be added. */
export function PendingSectionsList({
  courses,
  termId,
  value,
  onChange,
}: {
  courses: NyuCourse[];
  termId: string;
  value: Record<string, NyuSection>;
  onChange: (code: string, section: NyuSection | null) => void;
}) {
  if (!courses.length || !termId) return null;
  return (
    <div className="mt-3 space-y-1.5" data-testid="pending-sections">
      <p className="text-xs text-muted-foreground">
        Optional: choose your section so the home page can count down to your next lecture.
      </p>
      <ul className="divide-y rounded-lg border">
        {courses.map((c) => (
          <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-mono text-xs">{c.code}</span> · {c.title}
            </span>
            <PendingSectionButton
              course={c}
              termId={termId}
              value={value[c.code] ?? null}
              onChange={(s) => onChange(c.code, s)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
