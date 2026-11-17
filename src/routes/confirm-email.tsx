import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/confirm-email")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Confirm your email — LectureLoop" }] }),
  component: ConfirmEmailPage,
});

/**
 * Opened from the sign-up confirmation email (?token_hash=…&type=email). The one-time code is
 * used only when the student presses the button, so mail scanners that open links can't use
 * it up before they do.
 */
function ConfirmEmailPage() {
  const navigate = useNavigate();
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [type, setType] = useState<"email" | "signup">("email");
  const [state, setState] = useState<"loading" | "ready" | "busy" | "failed">("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const th = params.get("token_hash");
    const t = params.get("type");
    if (th && (t === "email" || t === "signup")) {
      setTokenHash(th);
      setType(t);
      setState("ready");
    } else {
      setState("failed");
    }
  }, []);

  async function confirm() {
    if (!tokenHash) return;
    setState("busy");
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      setState("failed");
      return;
    }
    toast.success("Email confirmed. Welcome to LectureLoop!");
    void navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="mb-8 flex items-center justify-center gap-2 text-muted-foreground"
          >
            <GraduationCap className="h-5 w-5" />
            <span className="font-display text-xl text-foreground">LectureLoop</span>
          </Link>
          <div className="surface-paper rounded-xl p-8">
            <h1 className="text-3xl">Confirm your email</h1>
            {state === "loading" ? (
              <p className="mt-4 text-sm text-muted-foreground">Checking your link…</p>
            ) : state === "failed" ? (
              <ResendConfirmation />
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  One last step: confirm your NYU email to start using LectureLoop.
                </p>
                <Button
                  className="w-full"
                  onClick={() => void confirm()}
                  disabled={state === "busy"}
                >
                  {state === "busy" ? "Confirming…" : "Confirm my email"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Expired or used link: send a new confirmation email from here. */
function ResendConfirmation() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setSending(false);
    if (error) {
      toast.error(
        /rate limit|after \d+ seconds/i.test(error.message)
          ? "Please wait a minute before asking for another email."
          : "Could not send the email. If you already confirmed, just sign in.",
      );
      return;
    }
    setSent(true);
  }

  if (sent)
    return (
      <p className="mt-4 text-sm text-muted-foreground" role="status">
        A new confirmation link is on its way to{" "}
        <strong className="text-foreground">{email}</strong>. Use the newest email.
      </p>
    );
  return (
    <form onSubmit={send} className="mt-4 space-y-4" role="alert">
      <p className="text-sm text-muted-foreground">
        This link has expired or was already used. If you've already confirmed,{" "}
        <Link to="/auth" className="underline">
          sign in
        </Link>
        . Otherwise enter your NYU email for a new link.
      </p>
      <div className="space-y-2">
        <Label htmlFor="confirm-resend-email">NYU email</Label>
        <Input
          id="confirm-resend-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="netid@nyu.edu"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={sending}>
        {sending ? "Sending…" : "Send a new link"}
      </Button>
    </form>
  );
}
