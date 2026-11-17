import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/reset-password")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Choose a new password — LectureLoop" }] }),
  component: ResetPasswordPage,
});

type Mode = "checking" | "form" | "expired";

/**
 * Opened from the password-reset email. The email links here with a one-time code
 * (?token_hash=…&type=recovery) that is used only when the student presses Save, so mail
 * scanners that open links can't use it up. Older links that sign in straight away still work.
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("checking");
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const th = params.get("token_hash");
    if (th && params.get("type") === "recovery") {
      setTokenHash(th);
      setMode("form");
      return;
    }
    if (hash.get("error") || hash.get("error_code")) {
      setMode("expired");
      return;
    }
    // Older links: the Supabase client reads the link and starts a recovery session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) setMode("form");
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setMode("form");
    });
    const t = setTimeout(() => setMode((m) => (m === "checking" ? "expired" : m)), 4000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      if (tokenHash) {
        // Use the one-time code now (signs in for this step).
        const { error } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        if (error) {
          setMode("expired");
          return;
        }
        setTokenHash(null);
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(
          /should be different/i.test(error.message)
            ? "Choose a password that's different from your old one."
            : "Could not change your password. Request a new link and try again.",
        );
        return;
      }
      toast.success("Password changed. You're signed in.");
      void navigate({ to: "/" });
    } finally {
      setSaving(false);
    }
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
            <h1 className="text-3xl">Choose a new password</h1>
            {mode === "checking" ? (
              <p className="mt-4 text-sm text-muted-foreground">Checking your link…</p>
            ) : mode === "expired" ? (
              <SendNewLink />
            ) : (
              <form onSubmit={save} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      className="pr-12"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                      aria-label={show ? "Hide password" : "Show password"}
                      onClick={() => setShow((v) => !v)}
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Type it again</Label>
                  <Input
                    id="confirm-password"
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? "Saving…" : "Save new password"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Expired link: ask for the email again right here. */
function SendNewLink() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/reset-password",
    });
    setSending(false);
    if (error) {
      toast.error(
        /rate limit|after \d+ seconds/i.test(error.message)
          ? "Please wait a minute before asking for another email."
          : "Could not send the email. Please try again.",
      );
      return;
    }
    setSent(true);
  }

  if (sent)
    return (
      <p className="mt-4 text-sm text-muted-foreground" role="status">
        If an account exists for <strong className="text-foreground">{email}</strong>, a new link is
        on its way. Use the newest email: each new link cancels the earlier ones.
      </p>
    );
  return (
    <form onSubmit={send} className="mt-4 space-y-4" role="alert">
      <p className="text-sm text-muted-foreground">
        This link has expired or was already used. Reset links work once, and asking for a new one
        cancels the earlier ones. Enter your email for a fresh link.
      </p>
      <div className="space-y-2">
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
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
