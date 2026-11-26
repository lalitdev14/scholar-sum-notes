import { useEffect, useId, useState, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Plus, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getNyuTerms,
  searchNyuCourses,
  type NyuCourse,
  type NyuTerm,
} from "@/lib/nyu-courses.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { friendlyError } from "@/lib/utils";

export type CurrentClass = { id: string; subject: string; code: string };

/** Query keys of the home page and dashboard class lists, refreshed after a change. */
const CLASS_LIST_KEYS = [["welcome-home"], ["my-enrollments"], ["classes"]];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const sameCode = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

type Outcome = "added" | "enrolled" | "already" | "failed";

/** Enrolls the student in the LectureLoop class for an NYU course, creating the class if needed. */
async function addCourse(
  course: NyuCourse,
  termLabel: string,
  userId: string,
  universityId: string | null,
): Promise<Outcome> {
  const findByCode = async () => {
    const { data, error } = await supabase
      .from("classes")
      .select("id")
      .eq("code", course.code)
      .is("deleted_at", null)
      .limit(1);
    if (error) throw error;
    return data?.[0]?.id ?? null;
  };
  const enroll = async (classId: string): Promise<boolean> => {
    const { error } = await supabase
      .from("enrollments")
      .insert({ user_id: userId, class_id: classId });
    if (error?.code === "23505") return false; // already enrolled
    if (error) throw error;
    return true;
  };

  let classId = await findByCode();
  if (classId) return (await enroll(classId)) ? "enrolled" : "already";

  const { data: created, error } = await supabase
    .from("classes")
    .insert({
      subject: course.title,
      code: course.code,
      term: termLabel,
      professor: course.instructor || "TBA",
      created_by: userId,
      university_id: universityId,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    // Someone added the same code a moment ago: use theirs.
    classId = await findByCode();
    if (!classId) return "failed";
    return (await enroll(classId)) ? "enrolled" : "already";
  }
  if (error || !created) throw error ?? new Error("Class not created");
  await enroll(created.id);
  return "added";
}

function summary(counts: Record<Outcome, number>) {
  const n = counts.added + counts.enrolled;
  const parts: string[] = [];
  if (n) parts.push(`Added ${n} subject${n === 1 ? "" : "s"}`);
  if (counts.already) parts.push(`${counts.already} already in your classes`);
  if (counts.failed) parts.push(`${counts.failed} couldn't be added`);
  return parts.join(" · ") || "No changes";
}

/**
 * "Your subjects this semester": search NYU's class search by subject name, pick courses
 * and add them to the student's classes in one go; also lists and removes current classes.
 */
export function SemesterSubjectsDialog({
  open,
  onOpenChange,
  onDone,
  userId,
  currentClasses,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after Done (whether or not anything was chosen). */
  onDone: () => void;
  userId: string;
  currentClasses: CurrentClass[];
  /** Element to focus when the form closes (the button that opened it). */
  returnFocusTo?: RefObject<HTMLElement | null> | undefined;
}) {
  const queryClient = useQueryClient();
  const fetchTerms = useServerFn(getNyuTerms);
  const fetchCourses = useServerFn(searchNyuCourses);
  const inputId = useId();
  const termId = useId();

  const [term, setTerm] = useState<string>("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<NyuCourse[]>([]);
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CurrentClass | null>(null);
  const [removing, setRemoving] = useState(false);
  const q = useDebounced(query.trim(), 350);

  const termsQuery = useQuery({
    queryKey: ["nyu-terms"],
    enabled: open,
    staleTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<NyuTerm[]> => (await fetchTerms()).terms,
  });
  const terms = termsQuery.data;
  useEffect(() => {
    const pick = terms?.find((t) => t.current) ?? terms?.[0];
    if (!term && pick) setTerm(pick.id);
  }, [terms, term]);
  const termLabel = terms?.find((t) => t.id === term)?.label ?? "";

  const search = useQuery({
    queryKey: ["nyu-search", term, q.toLowerCase()],
    enabled: open && !!term && q.length >= 2,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => (await fetchCourses({ data: { q: q.slice(0, 80), term } })).courses,
  });

  // A fresh form each time it opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setChosen([]);
    }
  }, [open]);

  const inClasses = (code: string) => currentClasses.some((c) => sameCode(c.code, code));
  const isChosen = (code: string) => chosen.some((c) => sameCode(c.code, code));

  function refreshLists() {
    for (const queryKey of CLASS_LIST_KEYS) void queryClient.invalidateQueries({ queryKey });
  }

  async function done() {
    if (!chosen.length) {
      onDone();
      return;
    }
    setSaving(true);
    const counts: Record<Outcome, number> = { added: 0, enrolled: 0, already: 0, failed: 0 };
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("university_id")
        .eq("id", userId)
        .maybeSingle();
      for (const course of chosen) {
        if (inClasses(course.code)) {
          counts.already++;
          continue;
        }
        try {
          counts[await addCourse(course, termLabel, userId, profile?.university_id ?? null)]++;
        } catch (err) {
          console.error("[subjects] could not add", course.code, err);
          counts.failed++;
        }
      }
      refreshLists();
      const text = summary(counts);
      if (counts.failed) toast.error(text);
      else toast.success(text);
      if (counts.failed < chosen.length) onDone();
    } finally {
      setSaving(false);
    }
  }

  async function removeClass() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const { error } = await supabase
        .from("enrollments")
        .delete()
        .eq("class_id", removeTarget.id)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Class removed from your dashboard");
      setRemoveTarget(null);
      refreshLists();
    } catch (err) {
      toast.error(friendlyError(err, "Could not remove the class"));
    } finally {
      setRemoving(false);
    }
  }

  const results = search.data ?? [];
  const showResults = (q.length >= 2 && !!term) || termsQuery.isError;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
        <DialogContent
          className="flex max-h-[92dvh] flex-col gap-4 overflow-hidden sm:max-w-xl"
          data-testid="subjects-dialog"
          onCloseAutoFocus={(e) => {
            const el = returnFocusTo?.current;
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Your subjects this semester</DialogTitle>
            <DialogDescription>
              Type a subject name and pick your NYU courses. We'll add them to your classes with the
              official course code.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <div className="space-y-1.5">
                <Label htmlFor={inputId}>Subject name</Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id={inputId}
                    value={query}
                    onChange={(e) => setQuery(e.target.value.slice(0, 80))}
                    placeholder="e.g. algorithms, financial accounting"
                    className="pl-9"
                    maxLength={80}
                    autoComplete="off"
                    aria-describedby={`${inputId}-hint`}
                  />
                </div>
                <p id={`${inputId}-hint`} className="sr-only">
                  Type at least 2 characters to search NYU courses.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={termId}>Term</Label>
                <Select value={term} onValueChange={setTerm} disabled={!terms?.length}>
                  <SelectTrigger id={termId} aria-label="Term">
                    <SelectValue placeholder="Loading…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(terms ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search results */}
            <div aria-live="polite" className="space-y-2">
              {!showResults ? (
                query.trim().length === 1 ? (
                  <p className="text-sm text-muted-foreground">Keep typing…</p>
                ) : null
              ) : search.isError || termsQuery.isError ? (
                <div
                  role="alert"
                  className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                  data-testid="nyu-error"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">We couldn't reach NYU's class search.</p>
                    <p className="mt-1">
                      Please try again in a moment, or add the class yourself on the{" "}
                      <Link
                        to="/dashboard"
                        className="font-medium underline underline-offset-2"
                        onClick={() => onOpenChange(false)}
                      >
                        Dashboard → Add class
                      </Link>
                      .
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        void (termsQuery.isError ? termsQuery.refetch() : search.refetch())
                      }
                    >
                      Try again
                    </Button>
                  </div>
                </div>
              ) : search.isPending || q !== query.trim() ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching NYU
                  courses…
                </p>
              ) : results.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="nyu-empty">
                  No NYU courses found for “{q}” in {termLabel || "this term"}. Try another name or
                  term.
                </p>
              ) : (
                <ul
                  className="divide-y rounded-lg border"
                  aria-label="NYU courses"
                  data-testid="nyu-results"
                >
                  {results.map((c) => {
                    const already = inClasses(c.code);
                    const picked = isChosen(c.code);
                    return (
                      <li key={c.code} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
                          <p className="text-sm font-medium leading-snug">{c.title}</p>
                        </div>
                        {already ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            In your classes
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant={picked ? "secondary" : "outline"}
                            className="shrink-0"
                            aria-pressed={picked}
                            aria-label={`${picked ? "Added" : "Add"} ${c.code} ${c.title}`}
                            onClick={() =>
                              setChosen((list) =>
                                picked
                                  ? list.filter((x) => !sameCode(x.code, c.code))
                                  : [...list, c],
                              )
                            }
                          >
                            {picked ? (
                              <>
                                <Check className="h-4 w-4" aria-hidden="true" /> Added
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" aria-hidden="true" /> Add
                              </>
                            )}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Chosen courses */}
            {chosen.length > 0 && (
              <section aria-labelledby={`${inputId}-chosen`} data-testid="chosen-list">
                <h3 id={`${inputId}-chosen`} className="text-sm font-semibold">
                  To add ({chosen.length})
                </h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {chosen.map((c) => (
                    <li
                      key={c.code}
                      className="flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-3 pr-1 text-sm"
                    >
                      <span className="truncate">
                        <span className="font-mono text-xs">{c.code}</span> · {c.title}
                      </span>
                      <button
                        type="button"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1"
                        aria-label={`Remove ${c.code} from the list`}
                        onClick={() =>
                          setChosen((list) => list.filter((x) => !sameCode(x.code, c.code)))
                        }
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Current classes */}
            {currentClasses.length > 0 && (
              <section aria-labelledby={`${inputId}-current`} data-testid="current-classes">
                <h3 id={`${inputId}-current`} className="text-sm font-semibold">
                  Your classes
                </h3>
                <ul className="mt-2 divide-y rounded-lg border">
                  {currentClasses.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
                        <p className="truncate text-sm">{c.subject}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground"
                        aria-label={`Remove ${c.subject} from your classes`}
                        onClick={() => setRemoveTarget(c)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" onClick={() => void done()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {chosen.length
                ? `Done · add ${chosen.length} subject${chosen.length === 1 ? "" : "s"}`
                : "Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.subject}?</AlertDialogTitle>
            <AlertDialogDescription>
              The class is removed from your dashboard. Your notes are kept and come back if you
              enroll in it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                void removeClass();
              }}
            >
              Remove class
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
