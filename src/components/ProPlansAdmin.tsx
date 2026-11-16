import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Crown, X } from "lucide-react";
import { getProPlans, handleProRequest, setUserPlan } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { friendlyError } from "@/lib/utils";

/** Admin: students asking for Pro (approve / decline) and current Pro members (remove). */
export function ProPlansAdmin() {
  const queryClient = useQueryClient();
  const fetchPlans = useServerFn(getProPlans);
  const handle = useServerFn(handleProRequest);
  const setPlan = useServerFn(setUserPlan);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-pro-plans"],
    queryFn: () => fetchPlans(),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-pro-plans"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] });
  };

  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => handle({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.approve ? "Pro turned on" : "Request declined");
      refresh();
    },
    onError: (e: Error) => toast.error(friendlyError(e, "Could not update the request.")),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => setPlan({ data: { userId, plan: "free" } }),
    onSuccess: () => {
      toast.success("Moved back to Free");
      refresh();
    },
    onError: (e: Error) => toast.error(friendlyError(e, "Could not change the plan.")),
  });

  const who = (p: { name: string; email: string }) => (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{p.name || p.email || "Student"}</p>
      {p.name && p.email && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
    </div>
  );

  return (
    <section className="surface-paper mt-10 rounded-xl p-6" aria-labelledby="pro-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="pro-heading" className="flex items-center gap-2 text-2xl">
          <Crown className="h-5 w-5 text-amber-500" /> Pro plan
        </h2>
        {!!data?.requests.length && <Badge>{data.requests.length} waiting</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Free includes 3 AI summaries a week. Students ask for Pro from the app; approve them here.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-destructive">
          Plans aren't set up in the database yet (apply the plans migration).
        </p>
      ) : isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Requests
            </h3>
            {data?.requests.length ? (
              <ul
                className="mt-2 divide-y divide-border rounded-lg border"
                data-testid="pro-requests"
              >
                {data.requests.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 p-3">
                    {who(r)}
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => decide.mutate({ id: r.id, approve: true })}
                      disabled={decide.isPending}
                      aria-label={`Approve Pro for ${r.name || r.email}`}
                    >
                      <Check className="mr-1 h-4 w-4" /> Approve
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => decide.mutate({ id: r.id, approve: false })}
                      disabled={decide.isPending}
                      aria-label={`Decline Pro for ${r.name || r.email}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No requests waiting.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Pro members ({data?.pro.length ?? 0})
            </h3>
            {data?.pro.length ? (
              <ul
                className="mt-2 divide-y divide-border rounded-lg border"
                data-testid="pro-members"
              >
                {data.pro.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 p-3">
                    {who(m)}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => remove.mutate(m.userId)}
                      disabled={remove.isPending}
                      aria-label={`Move ${m.name || m.email} back to Free`}
                    >
                      Remove Pro
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No Pro members yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
