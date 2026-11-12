import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Inbox, Mail, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOPIC_LABELS: Record<string, string> = {
  general: "General",
  account: "Account",
  bug: "Bug",
  feature: "Feature request",
  privacy: "Privacy / data",
  other: "Other",
};

type Filter = "new" | "resolved" | "all";

/**
 * Admin-only inbox for the public contact form. Uses the signed-in admin's session;
 * database policies allow reading and updating messages for admins only.
 */
export function ContactMessagesAdmin() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("new");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: messages, isPending } = useQuery({
    queryKey: ["admin-contact-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("id, created_at, name, email, topic, message, status, user_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-contact-messages"] });
  const counts = {
    new: messages?.filter((m) => m.status === "new").length ?? 0,
    resolved: messages?.filter((m) => m.status === "resolved").length ?? 0,
    all: messages?.length ?? 0,
  };
  const visible = (messages ?? []).filter((m) => filter === "all" || m.status === filter);

  async function setStatus(id: string, status: "new" | "resolved") {
    setBusyId(id);
    const { error } = await supabase
      .from("contact_messages")
      .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error("Could not update the message.");
      return;
    }
    toast.success(status === "resolved" ? "Marked as resolved" : "Moved back to new");
    void refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this message permanently?")) return;
    setBusyId(id);
    const { error } = await supabase.from("contact_messages").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error("Could not delete the message.");
      return;
    }
    toast.success("Message deleted");
    void refresh();
  }

  return (
    <section className="surface-paper mt-10 rounded-xl p-6" aria-labelledby="messages-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="messages-heading" className="flex items-center gap-2 text-2xl">
            <Inbox className="h-5 w-5 text-primary" /> Messages
            {counts.new > 0 && <Badge>{counts.new} new</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground">
            Queries sent through the Contact page. Reply by email, then mark them resolved.
          </p>
        </div>
        <div
          className="inline-flex rounded-lg bg-muted p-1 text-sm"
          role="tablist"
          aria-label="Filter messages"
        >
          {(["new", "resolved", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1 font-medium capitalize transition-colors",
                filter === f
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-5 space-y-2" data-testid="contact-messages">
        {isPending && <li className="text-sm text-muted-foreground">Loading messages…</li>}
        {!isPending && visible.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {filter === "new" ? "No new messages. You're all caught up." : "No messages here."}
          </li>
        )}
        {visible.map((m) => {
          const open = openId === m.id;
          const subject = `Re: your LectureLoop message (${TOPIC_LABELS[m.topic] ?? m.topic})`;
          return (
            <li
              key={m.id}
              className={cn(
                "rounded-lg border bg-background/60",
                m.status === "new" ? "border-primary/30" : "border-border/70",
              )}
            >
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
                onClick={() => setOpenId(open ? null : m.id)}
                aria-expanded={open}
              >
                {m.status === "new" && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="New" />
                )}
                <span className="font-medium">{m.name}</span>
                <span className="text-sm text-muted-foreground">{m.email}</span>
                <Badge variant="secondary">{TOPIC_LABELS[m.topic] ?? m.topic}</Badge>
                {m.user_id && <Badge variant="outline">signed-in user</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString()}
                </span>
                {!open && (
                  <span className="basis-full truncate text-sm text-muted-foreground">
                    {m.message}
                  </span>
                )}
              </button>
              {open && (
                <div className="border-t border-border/60 px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.message}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <a
                        href={`mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
                          `Hi ${m.name},\n\n\n\n—\nYour message:\n> ${m.message.replace(/\n/g, "\n> ")}`,
                        )}`}
                      >
                        <Mail className="mr-2 h-4 w-4" /> Reply by email
                      </a>
                    </Button>
                    {m.status === "new" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === m.id}
                        onClick={() => void setStatus(m.id, "resolved")}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Mark resolved
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === m.id}
                        onClick={() => void setStatus(m.id, "new")}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" /> Mark as new
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === m.id}
                      onClick={() => void remove(m.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
