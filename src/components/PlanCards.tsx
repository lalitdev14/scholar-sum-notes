import { Check, Crown } from "lucide-react";
import { PLANS } from "@/lib/plan";
import { cn } from "@/lib/utils";

/** Side-by-side Free and Pro cards. `action` renders the button under the Pro card. */
export function PlanCards({
  current,
  action,
  freeAction,
  compact = false,
}: {
  current?: "free" | "pro" | undefined;
  /** Button under the Pro card. */
  action?: React.ReactNode;
  /** Button under the Free card. */
  freeAction?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="plan-cards">
      {(["free", "pro"] as const).map((key) => {
        const plan = PLANS[key];
        const pro = key === "pro";
        return (
          <div
            key={key}
            className={cn(
              "relative flex flex-col rounded-xl border p-5",
              pro ? "border-primary/40 bg-primary/[0.04] shadow-sm" : "border-border bg-background",
            )}
            aria-label={`${plan.name} plan`}
          >
            {current === key && (
              <span className="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Your plan
              </span>
            )}
            <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider">
              {pro && <Crown className="h-4 w-4 text-amber-500" />}
              {plan.name}
            </p>
            <p className={cn("mt-2", compact ? "text-2xl" : "text-3xl")}>
              <span className="font-semibold">{plan.price}</span>{" "}
              <span className="text-sm text-muted-foreground">{plan.period}</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      pro ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {(pro ? action : freeAction) && (
              <div className="mt-auto pt-5">{pro ? action : freeAction}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
