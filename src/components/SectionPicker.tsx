import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Check, Clock, Loader2, Plus, Trash2 } from "lucide-react";
import {
  getNyuSections,
  getNyuTerms,
  type NyuCourse,
  type NyuSection,
  type NyuTerm,
} from "@/lib/nyu-courses.functions";
import { describeMeetings, type Meeting } from "@/lib/meeting-times";
import {
  buildManualSection,
  emptyMeetingDraft,
  isManualSection,
  isManualValid,
  manualDraftFromMeetings,
  manualLabel,
  MAX_MANUAL_MEETINGS,
  validateManual,
  type ManualDraft,
  type ManualMeetingDraft,
} from "@/lib/manual-schedule";
import {
  deleteSection,
  saveSection,
  useMySections,
  useRefreshSections,
  type SavedSection,
} from "@/lib/class-sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/**
 * "Section A · T 11a-1:30p" for a saved or listed section, or "Your times · Tue, Thu
 * 2:00–3:15 pm" for times the student entered themselves.
 */
function sectionLabel(s: {
  no?: string;
  sectionNo?: string;
  type?: string;
  scheduleType?: string;
  meets: string;
}) {
  if (isManualSection(s)) return manualLabel(s.meets);
  const no = s.no ?? s.sectionNo ?? "";
  return `Section ${no}${s.meets ? ` · ${s.meets}` : ""}`;
}

/** Saved manual times of a class, for pre-filling the manual form. */
export type ManualTimes = {
  meetings: Meeting[];
  startDate: string | null;
  endDate: string | null;
};

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const DAY_CHIPS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type Touched = { days: boolean; start: boolean; end: boolean };
type Row = ManualMeetingDraft & { key: number; touched: Touched };
const untouched: Touched = { days: false, start: false, end: false };
const allTouched: Touched = { days: true, start: true, end: true };

/**
 * Lists a course's NYU sections for a term (from NYU class search) and lets the student pick
 * theirs, or enter their class times themselves ("Enter times manually"). Choosing is
 * optional; a lookup failure shows a message with Try again.
 */
export function SectionPickerDialog({
  open,
  onOpenChange,
  code,
  title,
  termId,
  termLabel,
  selectedNo,
  manual,
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
  /** The manual times saved now, if any: the picker then opens on the manual form, pre-filled. */
  manual?: ManualTimes | null;
  /** Called with the chosen section (an NYU one or manual times), or null for "no section". */
  onPick: (section: NyuSection | null) => void | Promise<void>;
}) {
  const fetchTerms = useServerFn(getNyuTerms);
  const fetchSections = useServerFn(getNyuSections);
  const termSelectId = useId();
  const formId = useId();
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"nyu" | "manual">("nyu");
  const [rows, setRows] = useState<Row[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const nextKey = useRef(0);
  const hasSaved = !!selectedNo || !!manual;
  /** Changes only when the saved times do, so a re-render never resets what is being typed. */
  const manualKey = manual ? JSON.stringify(manual) : "";

  const termsQuery = useQuery({
    queryKey: ["nyu-terms"],
    enabled: open,
    staleTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<NyuTerm[]> => (await fetchTerms()).terms,
  });
  const terms = termsQuery.data;

  function resetManual(from: ManualDraft) {
    setRows(
      from.meetings.map((m) => ({
        ...m,
        key: nextKey.current++,
        touched: untouched,
      })),
    );
    setStartDate(from.startDate);
    setEndDate(from.endDate);
  }

  useEffect(() => {
    if (!open) return;
    setBusy(null);
    if (termId) setTerm(termId);
    else setTerm("");
    setMode(manual ? "manual" : "nyu");
    resetManual(
      manual
        ? manualDraftFromMeetings(manual.meetings, manual.startDate, manual.endDate)
        : { meetings: [emptyMeetingDraft()], startDate: "", endDate: "" },
    );
    // Only when the dialog opens (or the saved schedule behind it changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, termId, manualKey]);
  useEffect(() => {
    if (!open || !terms?.length) return;
    // No term yet, or one NYU doesn't list (e.g. manual times saved while NYU was down).
    if (term && terms.some((t) => t.id === term)) return;
    const byLabel = termLabel
      ? terms.find((t) => t.label.toLowerCase() === termLabel.trim().toLowerCase())
      : undefined;
    setTerm((byLabel ?? terms.find((t) => t.current) ?? terms[0]!).id);
  }, [open, term, terms, termLabel]);

  const sections = useQuery({
    queryKey: ["nyu-sections", term, code.trim().toUpperCase()],
    enabled: open && mode === "nyu" && !!term && !!code,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => (await fetchSections({ data: { code, term } })).sections,
  });

  const draft: ManualDraft = useMemo(
    () => ({
      meetings: rows.map(({ days, start, end }) => ({ days, start, end })),
      startDate,
      endDate,
    }),
    [rows, startDate, endDate],
  );
  const errors = useMemo(() => validateManual(draft), [draft]);
  const manualValid = isManualValid(errors);

  async function choose(section: NyuSection | null, busyKey = section?.no ?? "__none") {
    setBusy(busyKey);
    try {
      await onPick(section);
      onOpenChange(false);
    } catch {
      // onPick reports its own error; keep the dialog open.
    } finally {
      setBusy(null);
    }
  }

  function saveManual() {
    if (!manualValid || busy) {
      setRows((rs) => rs.map((r) => ({ ...r, touched: allTouched })));
      return;
    }
    // The term the dialog shows (or the class's saved one); a placeholder if NYU is unreachable.
    void choose(buildManualSection(draft, term || termId || "manual"), "__manual");
  }

  function updateRow(key: number, patch: Partial<ManualMeetingDraft>, touch: Partial<Touched>) {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, ...patch, touched: { ...r.touched, ...touch } } : r)),
    );
  }

  function toggleDay(row: Row, day: number) {
    const days = row.days.includes(day)
      ? row.days.filter((d) => d !== day)
      : [...row.days, day].sort((a, b) => a - b);
    updateRow(row.key, { days }, { days: true });
  }

  const termOptions =
    terms ?? (termId ? [{ id: termId, label: `Term ${termId}`, current: true }] : []);
  const list = sections.data ?? [];

  const manualLink = (testId: string, className?: string) => (
    <Button
      type="button"
      variant="link"
      size="sm"
      className={cn("h-auto gap-1.5 px-0 py-0", className)}
      disabled={!!busy}
      data-testid={testId}
      onClick={() => setMode("manual")}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      Enter times manually
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        className="flex max-h-[88dvh] flex-col gap-4 overflow-hidden sm:max-w-lg"
        data-testid="section-picker"
        data-mode={mode}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "manual" ? `Your class times for ${code}` : `Your section of ${code}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "manual"
              ? `${title}. Enter when your class meets each week (New York time) so LectureLoop can count down to your next lecture.`
              : `${title}. Pick the section you're registered in so LectureLoop knows when your class meets. This is optional.`}
          </DialogDescription>
        </DialogHeader>

        {mode === "nyu" ? (
          <>
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
                  className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
                  data-testid="section-error"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">We couldn't reach NYU's class search.</p>
                    <p className="mt-1">
                      Your class is still added. Try again in a moment, set your section later, or
                      enter your class times yourself.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="section-retry"
                        onClick={() =>
                          void (sections.isError ? sections.refetch() : termsQuery.refetch())
                        }
                      >
                        Try again
                      </Button>
                      {manualLink("section-manual-error", "text-amber-900 dark:text-amber-100")}
                    </div>
                  </div>
                </div>
              ) : !term || sections.isPending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading sections…
                </p>
              ) : list.length === 0 ? (
                <div className="space-y-2" data-testid="section-empty">
                  <p className="text-sm text-muted-foreground">
                    NYU lists no sections of {code} in this term. Try another term, or enter your
                    class times yourself.
                  </p>
                  {manualLink("section-manual-empty")}
                </div>
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
                              {[s.instructor || "Instructor TBA", dates]
                                .filter(Boolean)
                                .join(" · ")}
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

            <div className="flex flex-wrap items-center justify-between gap-2">
              {manualLink("section-manual")}
              <div className="ml-auto flex flex-wrap justify-end gap-2">
                {hasSaved && (
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
                  {hasSaved ? "Close" : "Skip for now"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <form
              id={formId}
              className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-1 motion-fade-in"
              data-testid="manual-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                saveManual();
              }}
            >
              <ol className="space-y-3" aria-label="Weekly meetings">
                {rows.map((row, i) => (
                  <ManualMeetingRow
                    key={row.key}
                    row={row}
                    index={i}
                    count={rows.length}
                    errors={errors.meetings[i] ?? {}}
                    disabled={!!busy}
                    onToggleDay={(d) => toggleDay(row, d)}
                    onChange={(patch, touch) => updateRow(row.key, patch, touch)}
                    onRemove={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                  />
                ))}
              </ol>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!!busy || rows.length >= MAX_MANUAL_MEETINGS}
                data-testid="manual-add-meeting"
                onClick={() =>
                  setRows((rs) => [
                    ...rs,
                    { ...emptyMeetingDraft(), key: nextKey.current++, touched: untouched },
                  ])
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add another meeting
              </Button>
              {rows.length >= MAX_MANUAL_MEETINGS && (
                <p className="text-xs text-muted-foreground" data-testid="manual-max">
                  You can add up to {MAX_MANUAL_MEETINGS} meetings.
                </p>
              )}

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Term dates <span className="font-normal text-muted-foreground">(optional)</span>
                </legend>
                <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                  <DateField
                    id={`${formId}-first`}
                    label="First day of classes"
                    value={startDate}
                    error={errors.startDate}
                    disabled={!!busy}
                    testId="manual-first-day"
                    onChange={setStartDate}
                  />
                  <DateField
                    id={`${formId}-last`}
                    label="Last day of classes"
                    value={endDate}
                    min={startDate || undefined}
                    error={errors.endDate}
                    disabled={!!busy}
                    testId="manual-last-day"
                    onChange={setEndDate}
                  />
                </div>
              </fieldset>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 py-0"
                disabled={!!busy}
                data-testid="manual-to-nyu"
                onClick={() => setMode("nyu")}
              >
                Pick an NYU section instead
              </Button>
              <div className="ml-auto flex flex-wrap justify-end gap-2">
                {hasSaved && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!!busy}
                    data-testid="section-clear"
                    onClick={() => void choose(null)}
                  >
                    Clear times
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  data-testid="manual-cancel"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form={formId}
                  size="sm"
                  className="gap-1.5"
                  disabled={!manualValid || !!busy}
                  data-testid="manual-save"
                >
                  {busy === "__manual" && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  Save times
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldError({
  id,
  message,
  testId,
}: {
  id: string;
  message?: string | undefined;
  testId: string;
}) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs font-medium text-destructive motion-fade-in" data-testid={testId}>
      {message}
    </p>
  );
}

function DateField({
  id,
  label,
  value,
  min,
  error,
  disabled,
  testId,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min?: string | undefined;
  error?: string | undefined;
  disabled: boolean;
  testId: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        disabled={disabled}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn("min-w-0", error && "border-destructive")}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldError id={`${id}-error`} message={error} testId={`${testId}-error`} />
    </div>
  );
}

/** One weekly meeting in the manual form: day toggle chips, start and end time. */
function ManualMeetingRow({
  row,
  index,
  count,
  errors,
  disabled,
  onToggleDay,
  onChange,
  onRemove,
}: {
  row: Row;
  index: number;
  count: number;
  errors: { days?: string; start?: string; end?: string };
  disabled: boolean;
  onToggleDay: (day: number) => void;
  onChange: (patch: Partial<ManualMeetingDraft>, touch: Partial<Touched>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const n = index + 1;
  // Errors show once the student has worked on that field (or moved past the days).
  const showDays = (row.touched.days || row.touched.start || row.touched.end) && errors.days;
  const showStart = row.touched.start && errors.start;
  const showEnd = row.touched.end && errors.end;
  return (
    <li
      className="motion-rise rounded-lg border bg-card p-3 text-card-foreground"
      data-testid={`manual-meeting-${index}`}
    >
      <div role="group" aria-labelledby={`${id}-title`} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p id={`${id}-title`} className="text-sm font-medium">
            {count > 1 ? `Meeting ${n}` : "Weekly meeting"}
          </p>
          {count > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-muted-foreground"
              aria-label={`Remove meeting ${n}`}
              disabled={disabled}
              data-testid={`manual-remove-${index}`}
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <p id={`${id}-days`} className="text-xs font-medium">
            Days
          </p>
          <div
            role="group"
            aria-labelledby={`${id}-days`}
            aria-describedby={showDays ? `${id}-days-error` : undefined}
            className="flex flex-wrap gap-1.5"
          >
            {DAY_CHIPS.map((label, d) => {
              const on = row.days.includes(d);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[d]}
                  disabled={disabled}
                  data-testid={`manual-day-${index}-${d}`}
                  className={cn(
                    "inline-flex h-9 min-w-11 items-center justify-center rounded-full border px-2.5 text-sm font-medium",
                    "transition-[background-color,border-color,color,transform] duration-[var(--motion-fast)] ease-[var(--motion-ease-out)] active:scale-95 motion-reduce:transition-colors motion-reduce:active:scale-100",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-foreground hover:bg-muted",
                  )}
                  onClick={() => onToggleDay(d)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <FieldError
            id={`${id}-days-error`}
            message={showDays || undefined}
            testId={`manual-error-days-${index}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`${id}-start`} className="text-xs">
              Start time
            </Label>
            <Input
              id={`${id}-start`}
              type="time"
              step={300}
              value={row.start}
              disabled={disabled}
              aria-invalid={!!showStart || undefined}
              aria-describedby={showStart ? `${id}-start-error` : undefined}
              className={cn("min-w-0", showStart && "border-destructive")}
              data-testid={`manual-start-${index}`}
              onChange={(e) => onChange({ start: e.target.value }, { start: true })}
              onBlur={() => onChange({}, { start: true })}
            />
            <FieldError
              id={`${id}-start-error`}
              message={showStart || undefined}
              testId={`manual-error-start-${index}`}
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`${id}-end`} className="text-xs">
              End time
            </Label>
            <Input
              id={`${id}-end`}
              type="time"
              step={300}
              value={row.end}
              disabled={disabled}
              aria-invalid={!!showEnd || undefined}
              aria-describedby={showEnd ? `${id}-end-error` : undefined}
              className={cn("min-w-0", showEnd && "border-destructive")}
              data-testid={`manual-end-${index}`}
              onChange={(e) => onChange({ end: e.target.value }, { end: true })}
              onBlur={() => onChange({}, { end: true })}
            />
            <FieldError
              id={`${id}-end-error`}
              message={showEnd || undefined}
              testId={`manual-error-end-${index}`}
            />
          </div>
        </div>
      </div>
    </li>
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
        !section
          ? `Section cleared for ${subject}`
          : isManualSection(section)
            ? `Saved your class times for ${subject}`
            : `Saved section ${section.no} for ${subject}`,
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
        selectedNo={current && !isManualSection(current) ? current.sectionNo : null}
        manual={current && isManualSection(current) ? current : null}
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
        selectedNo={value && !isManualSection(value) ? value.no : null}
        manual={value && isManualSection(value) ? value : null}
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
        Optional: choose your section (or enter your class times) so the home page can count down to
        your next lecture.
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
