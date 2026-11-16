import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PlanCards } from "@/components/PlanCards";
import { freeSummariesLeft, useRequestPro, usePlan } from "@/lib/plan";
import { friendlyError } from "@/lib/utils";

/**
 * The Pro upgrade page, shown when a Free student asks for an AI summary.
 * "Continue with Free" goes ahead within the Free limits; "Join Pro" upgrades.
 */
export function UpgradeDialog({
  open,
  onOpenChange,
  onContinueFree,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs the summary on the Free plan. */
  onContinueFree?: () => void;
}) {
  const { data: plan } = usePlan(open);
  const requestPro = useRequestPro();
  const [sending, setSending] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);
  const left = freeSummariesLeft(plan);
  const perWeek = plan?.freeSummariesPerWeek ?? 3;

  async function joinPro() {
    if (!plan?.canRequestPro) {
      setComingSoon(true);
      toast("Pro is coming soon! Keep using Free for now.");
      return;
    }
    setSending(true);
    try {
      await requestPro();
      toast.success("Request sent! You'll be switched to Pro soon.");
    } catch (err) {
      toast.error(friendlyError(err, "Could not send your request. Please try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Crown className="h-5 w-5 text-amber-500" /> Upgrade to Pro
          </DialogTitle>
          <DialogDescription>
            {left === 0
              ? `You've used your ${perWeek} free AI summaries this week. They reset on Monday, or join Pro for unlimited summaries.`
              : `Free includes ${perWeek} AI summaries a week${left !== null ? ` (${left} left)` : ""}. Pro has no weekly limit.`}
          </DialogDescription>
        </DialogHeader>
        <PlanCards
          current={plan?.plan}
          compact
          freeAction={
            left === null ? null : left > 0 ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  onContinueFree?.();
                }}
              >
                Continue with Free · {left} left
              </Button>
            ) : (
              <Button variant="outline" className="w-full" disabled>
                Free summaries used · resets Monday
              </Button>
            )
          }
          action={
            plan?.plan === "pro" ? (
              <p className="text-sm font-medium text-primary">You're on Pro. Enjoy!</p>
            ) : plan?.proRequested ? (
              <Button className="w-full" disabled>
                Request sent · waiting for approval
              </Button>
            ) : comingSoon ? (
              <Button className="w-full" disabled>
                Pro is coming soon
              </Button>
            ) : (
              <Button className="w-full" onClick={() => void joinPro()} disabled={sending}>
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Crown className="mr-2 h-4 w-4" />
                )}
                Join Pro
              </Button>
            )
          }
        />
        <p className="text-xs text-muted-foreground">
          <Link to="/plans" className="underline" onClick={() => onOpenChange(false)}>
            Compare plans
          </Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}
