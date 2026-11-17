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

/** Opened from the password-reset email: the link signs the student in for this one step. */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // The Supabase client reads the link and starts a short recovery session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    // No session after a few seconds: the link expired or was already used.
    const t = setTimeout(() => setReady((r) => r ?? false), 4000);
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
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
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
            {ready === null ? (
              <p className="mt-4 text-sm text-muted-foreground">Checking your link…</p>
            ) : ready === false ? (
              <div className="mt-4 space-y-4 text-sm text-muted-foreground" role="alert">
                <p>This link has expired or was already used. Reset links work once.</p>
                <Button asChild className="w-full">
                  <Link to="/auth">Request a new link</Link>
                </Button>
              </div>
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
