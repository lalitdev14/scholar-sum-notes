import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Announcement = { id: string; title: string; body: string; created_at: string };

/**
 * Shows admin updates the signed-in user hasn't seen yet, one at a time.
 * Dismissing an update records it in announcement_reads so it is shown only once.
 */
export function UpdatesPopup() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: unread } = useQuery({
    queryKey: ["unread-updates"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Announcement[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return [];
      const [{ data: items, error }, { data: reads, error: readsError }] = await Promise.all([
        supabase
          .from("announcements")
          .select("id, title, body, created_at")
          .eq("active", true)
          .order("created_at", { ascending: true })
          .limit(20),
        supabase.from("announcement_reads").select("announcement_id").eq("user_id", userId),
      ]);
      if (error) throw error;
      if (readsError) throw readsError;
      const seen = new Set((reads ?? []).map((r) => r.announcement_id));
      return (items ?? []).filter((a) => !seen.has(a.id));
    },
  });

  const queue = (unread ?? []).filter((a) => !dismissed.has(a.id));
  const current = queue[0];
  const total = (unread ?? []).length;
  const position = total - queue.length + 1;

  async function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    await supabase
      .from("announcement_reads")
      .upsert(
        { user_id: userId, announcement_id: id },
        { onConflict: "user_id,announcement_id", ignoreDuplicates: true },
      );
    if (queue.length <= 1) queryClient.invalidateQueries({ queryKey: ["unread-updates"] });
  }

  if (!current) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void dismiss(current.id);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <Megaphone className="h-4 w-4 text-primary" aria-hidden="true" />
            Update
            {total > 1 && (
              <span className="ml-auto normal-case tracking-normal">
                {position} of {total}
              </span>
            )}
          </div>
          <DialogTitle className="text-2xl">{current.title}</DialogTitle>
          <DialogDescription className="text-xs">
            {new Date(current.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </DialogDescription>
        </DialogHeader>
        {current.body && (
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {current.body}
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => void dismiss(current.id)}>
            {queue.length > 1 ? "Next" : "Got it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
