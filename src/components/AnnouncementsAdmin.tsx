import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Megaphone, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/**
 * Admin-only: publish updates that every user sees once as a popup after signing in.
 * Uses the signed-in admin's session; database policies allow writes for admins only.
 */
export function AnnouncementsAdmin() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const { data: items, isPending } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, active, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    queryClient.invalidateQueries({ queryKey: ["unread-updates"] });
  };

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give the update a title.");
      return;
    }
    setSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("announcements").insert({
        title: title.trim(),
        body: body.trim(),
        created_by: userData.user!.id,
      });
      if (error) throw error;
      toast.success("Update published — users will see it the next time they open LectureLoop.");
      setTitle("");
      setBody("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not publish the update");
    } finally {
      setSending(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    const { error } = await supabase.from("announcements").update({ active }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(active ? "Update is live again" : "Update hidden from users");
      refresh();
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this update permanently?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Update deleted");
      refresh();
    }
  }

  return (
    <section className="surface-paper mt-10 rounded-xl p-6" aria-labelledby="updates-heading">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="updates-heading" className="text-2xl">
          Send an update
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every user sees each live update once, as a popup, the next time they open LectureLoop.
      </p>

      <form onSubmit={publish} className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="update-title">Title</Label>
          <Input
            id="update-title"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New: rich-text notes editor"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="update-body">Message</Label>
          <Textarea
            id="update-body"
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's new, what changed, or anything students should know."
            className="min-h-32"
          />
        </div>
        <Button type="submit" disabled={sending}>
          <Megaphone className="mr-2 h-4 w-4" />
          {sending ? "Publishing…" : "Publish update"}
        </Button>
      </form>

      <div className="mt-8">
        <h3 className="text-xl">Past updates</h3>
        {isPending ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        ) : !items || items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No updates sent yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {items.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{a.title}</p>
                    <Badge variant={a.active ? "default" : "secondary"}>
                      {a.active ? "Live" : "Hidden"}
                    </Badge>
                  </div>
                  {a.body && (
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {a.body}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={a.active}
                      onCheckedChange={(v) => void setActive(a.id, v)}
                      aria-label={a.active ? "Hide update" : "Show update"}
                    />
                    Live
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete update"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void remove(a.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
