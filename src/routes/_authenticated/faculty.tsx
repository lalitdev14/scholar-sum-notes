import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getReviewQueue, setSummaryReview } from "@/lib/faculty.functions";
import { useRoles } from "@/hooks/useRoles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { BadgeCheck, ShieldCheck, Sparkles } from "lucide-react";




export const Route = createFileRoute("/_authenticated/faculty")({
  head: () => ({
    meta: [
      { title: "Faculty review — LectureLoop" },
      {
        name: "description",
        content: "Faculty review of AI class summaries: verify accuracy and mark summaries as trusted for students.",
      },
      { property: "og:title", content: "Faculty review — LectureLoop" },
      { property: "og:description", content: "Verify AI class summaries and mark them trusted for students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FacultyReview,
});

function FacultyReview() {
  const { isReviewer, isPending: checkingRole } = useRoles();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const fetchQueue = useServerFn(getReviewQueue);
  const review = useServerFn(setSummaryReview);

  const { data, isPending } = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => fetchQueue({ data: undefined as never }),
    enabled: isReviewer,
  });

  const mutation = useMutation({
    mutationFn: (vars: { classId: string; reviewed: boolean; note: string }) =>
      review({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.reviewed ? "Summary marked as reviewed" : "Review removed");
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (checkingRole) {
    return <p className="mx-auto max-w-6xl px-6 py-16 text-muted-foreground">Checking access…</p>;
  }

  if (!isReviewer) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 text-3xl">Faculty only</h1>
        <p className="mt-2 text-muted-foreground">
          This review workspace is restricted to faculty. Ask an admin to grant you the faculty role.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <AuthenticatedHeader
        trailing={
          <Badge variant="secondary">
            <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Faculty
          </Badge>
        }
      />

      <main className="mx-auto max-w-5xl px-6 py-12">

        <h1 className="text-4xl">Review class summaries</h1>
        <p className="mt-1 text-muted-foreground">
          Read the AI-refined summary of each class and mark it reviewed so students know it is trusted.
        </p>

        <div className="mt-8 grid gap-5">
          {isPending && <p className="text-muted-foreground">Loading summaries…</p>}
          {data?.map((c) => (
            <article key={c.id} className="surface-paper rounded-xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl">{c.subject}</h2>
                  <p className="text-sm text-muted-foreground">
                    {c.code} · {c.professor}
                    {c.term ? ` · ${c.term}` : ""}
                  </p>
                </div>
                {c.reviewed ? (
                  <Badge>
                    <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Reviewed
                  </Badge>
                ) : (
                  <Badge variant="outline">Awaiting review</Badge>
                )}
              </div>

              {c.has_summary ? (
                <>
                  <p className="prose-notes mt-4 whitespace-pre-wrap text-sm opacity-90">{c.summary}</p>
                  {c.key_points.length > 0 && (
                    <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {c.key_points.map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    {c.notes_count} notes merged
                    {c.reviewed && c.reviewed_at
                      ? ` · reviewed by ${c.reviewer} on ${new Date(c.reviewed_at).toLocaleDateString()}`
                      : ""}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Input
                      className="max-w-sm"
                      placeholder="Optional note for students"
                      value={notes[c.id] ?? c.review_note}
                      onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                    />
                    <Button
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          classId: c.id,
                          reviewed: !c.reviewed,
                          note: notes[c.id] ?? c.review_note,
                        })
                      }
                      variant={c.reviewed ? "outline" : "default"}
                    >
                      {c.reviewed ? "Undo review" : "Mark as reviewed"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No AI summary generated yet for this class.
                </p>
              )}
            </article>
          ))}
          {!isPending && !data?.length && <p className="text-muted-foreground">No classes yet.</p>}
        </div>
      </main>
    </div>
  );
}
