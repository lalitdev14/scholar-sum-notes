import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Wait before "Send again": new emails cancel earlier links, and NYU mail can take minutes. */
const RESEND_AFTER_S = 120;

/**
 * "Check your inbox" after sending a sign-up or reset email. Explains that it can take a few
 * minutes (new senders are held by university mail filters) and only lets the student ask
 * again after a pause, since each new email cancels the previous link.
 */
export function EmailSentNotice({
  email,
  what,
  onResend,
}: {
  email: string;
  /** e.g. "a link to reset your password" */
  what: string;
  /** Sends the email again; throw to show an error. */
  onResend: () => Promise<void>;
}) {
  // Count down to a fixed time, so the wait stays right even if the tab sleeps.
  const [until, setUntil] = useState(() => Date.now() + RESEND_AFTER_S * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const [sending, setSending] = useState(false);

  async function again() {
    setSending(true);
    try {
      await onResend();
      toast.success("Sent again. Use only the newest email.");
      setUntil(Date.now() + RESEND_AFTER_S * 1000);
      setNow(Date.now());
    } catch {
      toast.error("Could not send the email. Please try again in a minute.");
    } finally {
      setSending(false);
    }
  }

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div
      className="mt-4 space-y-4 text-sm text-muted-foreground"
      role="status"
      data-testid="email-sent"
    >
      <p className="flex items-start gap-2">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>
          If an account exists for <strong className="text-foreground">{email}</strong>, we've sent{" "}
          {what}.
        </span>
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>It can take up to 5 minutes to arrive.</li>
        <li>Check Spam and the Updates or Promotions tabs too.</li>
        <li>Each new email cancels the earlier link, so wait for this one before asking again.</li>
      </ul>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={left > 0 || sending}
        onClick={() => void again()}
      >
        {sending
          ? "Sending…"
          : left > 0
            ? `Didn't get it? Send again in ${mm}:${ss}`
            : "Send again"}
      </Button>
    </div>
  );
}
