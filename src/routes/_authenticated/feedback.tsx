import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { useRoles } from "@/hooks/useRoles";
import { MessageSquarePlus, Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "Share feedback — LectureLoop" },
      {
        name: "description",
        content: "Tell us what could be better about LectureLoop — notes, summaries, or anything else.",
      },
      { property: "og:title", content: "Share feedback — LectureLoop" },
      { property: "og:description", content: "Suggest improvements to LectureLoop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeedbackPage,
});

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "notes", label: "Notes & writing" },
  { value: "summaries", label: "AI summaries" },
  { value: "handwriting", label: "Handwriting workspace" },
  { value: "bug", label: "Something is broken" },
];

const feedbackSchema = z.object({
  category: z.string().min(1),
  message: z
    .string()
    .trim()
    .nonempty({ message: "Please write a short note before sending." })
    .max(2000, { message: "Feedback must be under 2000 characters." }),
});

function FeedbackPage() {
  const queryClient = useQueryClient();
  const { isAdmin } = useRoles();
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: mine } = useQuery({
    queryKey: ["my-feedback"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return [];
      const { data, error } = await supabase
        .from("feedback")
        .select("id, category, message, status, admin_note, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: inbox } = useQuery({
    enabled: isAdmin,
    queryKey: ["feedback-inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("id, category, message, status, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = data ?? [];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const nameById = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        for (const p of profs ?? []) nameById.set(p.id, p.full_name);
      }
      return rows.map((r) => ({ ...r, author_name: nameById.get(r.user_id) ?? "Student" }));
    },
  });


  async function submit() {
    const parsed = feedbackSchema.safeParse({ category, message });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid feedback");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const { data: profile } = await supabase
        .from("profiles")
        .select("university_id")
        .eq("id", userId)
        .single();

      const { error } = await supabase.from("feedback").insert({
        user_id: userId,
        university_id: profile?.university_id ?? null,
        category: parsed.data.category,
        message: parsed.data.message,
      });
      if (error) throw error;
      setMessage("");
      setCategory("general");
      toast.success("Thanks — your feedback was sent.");
      queryClient.invalidateQueries({ queryKey: ["my-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-inbox"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send feedback");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Status updated");
    queryClient.invalidateQueries({ queryKey: ["feedback-inbox"] });
  }

  return (
    <div className="min-h-screen bg-background">
      <AuthenticatedHeader />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <h1 className="font-display text-3xl font-bold">Share feedback</h1>
        <p className="mt-2 text-muted-foreground">
          Noticed something confusing, missing, or worth improving? Tell us and we will look at it.
        </p>

        <section className="mt-8 rounded-xl border bg-card p-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="feedback-category">What is it about?</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="feedback-category" className="w-full sm:w-72">
                  <SelectValue placeholder="Choose a topic" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="feedback-message">Your suggestion</Label>
              <Textarea
                id="feedback-message"
                value={message}
                maxLength={2000}
                rows={6}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What could work better for you?"
              />
              <span className="text-xs text-muted-foreground">{message.length}/2000</span>
            </div>

            <div>
              <Button onClick={submit} disabled={saving}>
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                {saving ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">Your past feedback</h2>
          {(mine ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {(mine ?? []).map((f) => (
                <li key={f.id} className="rounded-lg border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {CATEGORIES.find((c) => c.value === f.category)?.label ?? f.category}
                    </Badge>
                    <Badge variant={f.status === "open" ? "outline" : "default"}>{f.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{f.message}</p>
                  {f.admin_note && (
                    <p className="mt-2 rounded-md bg-muted p-2 text-sm">Reply: {f.admin_note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {isAdmin && (
          <section className="mt-12">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <Inbox className="h-5 w-5" /> Campus feedback inbox
            </h2>
            {(inbox ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No feedback submitted yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {(inbox ?? []).map((f) => {
                  const name = f.author_name;
                  return (

                    <li key={f.id} className="rounded-lg border bg-card p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{name ?? "Student"}</span>
                        <Badge variant="secondary">
                          {CATEGORIES.find((c) => c.value === f.category)?.label ?? f.category}
                        </Badge>
                        <Badge variant={f.status === "open" ? "outline" : "default"}>{f.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(f.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{f.message}</p>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setStatus(f.id, "in_review")}>
                          Mark in review
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setStatus(f.id, "resolved")}>
                          Mark resolved
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
