import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

const ACTION_LABELS: Record<string, string> = {
  "account.password_reset": "Reset password",
  "account.delete": "Deleted account",
  "role.grant": "Granted role",
  "role.revoke": "Removed role",
  "class.update": "Edited class",
  "class.delete": "Deleted class",
  "classes.delete": "Deleted classes",
  "classes.import": "Imported classes",
  "registration.domain.add": "Allowed domain",
  "registration.domain.remove": "Removed domain",
  "registration.email.add": "Allowed email",
  "registration.email.remove": "Removed allowed email",
  "announcements.insert": "Published update",
  "announcements.update": "Changed update",
  "announcements.delete": "Deleted update",
  "contact_messages.update": "Updated message",
  "contact_messages.delete": "Deleted message",
};

const SENSITIVE = new Set([
  "account.password_reset",
  "account.delete",
  "role.grant",
  "role.revoke",
]);

/** Read-only record of admin actions (written by the server and database triggers). */
export function AdminAuditLog() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: entries, isPending } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id, created_at, actor_email, action, target, details")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section className="surface-paper mt-10 rounded-xl p-6" aria-labelledby="audit-heading">
      <h2 id="audit-heading" className="flex items-center gap-2 text-2xl">
        <History className="h-5 w-5 text-primary" /> Admin activity log
      </h2>
      <p className="text-sm text-muted-foreground">
        Every admin action (password resets, role changes, deletions, class edits, updates) is
        recorded here and can't be edited.
      </p>
      <ul className="mt-4 divide-y divide-border/60 text-sm" data-testid="audit-log">
        {isPending && <li className="py-3 text-muted-foreground">Loading…</li>}
        {!isPending && !entries?.length && (
          <li className="py-3 text-muted-foreground">No admin actions recorded yet.</li>
        )}
        {entries?.map((e) => {
          const open = openId === e.id;
          const hasDetails = e.details && Object.keys(e.details as object).length > 0;
          return (
            <li key={e.id} className="py-2.5">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
                onClick={() => hasDetails && setOpenId(open ? null : e.id)}
                aria-expanded={hasDetails ? open : undefined}
              >
                <span className="w-40 shrink-0 text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </span>
                <Badge variant={SENSITIVE.has(e.action) ? "default" : "secondary"}>
                  {ACTION_LABELS[e.action] ?? e.action}
                </Badge>
                <span className="min-w-0 truncate font-medium">{e.target}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  by {e.actor_email ?? "unknown"}
                </span>
              </button>
              {open && (
                <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(e.details, null, 2)}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
