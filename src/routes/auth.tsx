import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Sign in — LectureLoop" },
      {
        name: "description",
        content: "Sign in to take your class notes and get AI summaries of them.",
      },
      { property: "og:title", content: "Sign in — LectureLoop" },
      { property: "og:description", content: "Student sign in for personal AI class notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const oauthError = params.get("error_description");
    if (oauthError) {
      toast.error(friendlyAuthError(oauthError));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data: allowed, error: checkError } = await supabase.rpc("can_register", {
          _email: email.trim(),
        });
        if (checkError) throw checkError;
        if (!allowed) throw new Error(NYU_ONLY_MESSAGE);

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName,
              requested_role: "student",
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your NYU inbox and click the link to confirm your account.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(friendlyAuthError(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    // Uses the Supabase project's Google provider (Supabase > Authentication > Providers).
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Return to /auth so a refused (non-NYU) Google account sees the reason.
      options: { redirectTo: window.location.origin + "/auth" },
    });
    if (error) {
      toast.error("Google sign-in failed. Try again.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 text-muted-foreground">
          <GraduationCap className="h-5 w-5" />
          <span className="font-display text-xl text-foreground">LectureLoop</span>
        </Link>

        <div className="surface-paper rounded-xl p-8">
          <h1 className="text-3xl">{mode === "signin" ? "Welcome back" : "Join your class"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to keep taking notes."
              : "LectureLoop is for NYU students. Sign up with your NYU email."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ada Lovelace"
                    required
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{mode === "signup" ? "NYU email" : "Email"}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="netid@nyu.edu"
                required
              />
              {mode === "signup" && (
                <p className="text-xs text-muted-foreground">
                  Use your @nyu.edu or @stern.nyu.edu address. We'll send a confirmation link.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="pr-12"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-1/2 min-h-10 min-w-10 -translate-y-1/2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            <svg aria-hidden="true" viewBox="0 0 48 48" className="mr-2 h-4 w-4">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.76 7.18l7.73 6C44.42 38.03 46.98 31.89 46.98 24.55Z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59A14.5 14.5 0 0 1 9.75 24c0-1.6.28-3.14.78-4.59l-7.98-6.2A23.8 23.8 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.92-2.13 15.9-5.8l-7.73-6C30.02 37.65 27.27 38.5 24 38.5c-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 font-medium text-foreground underline underline-offset-4"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </Button>
          </p>
        </div>
      </div>
    </main>
  );
}

const NYU_ONLY_MESSAGE =
  "LectureLoop is only open to NYU students. Please use your @nyu.edu or @stern.nyu.edu email.";

/** Supabase reports the database's NYU-only check as a generic error; explain it instead. */
function friendlyAuthError(message: string): string {
  if (/database error saving new user|only open to NYU|check_violation/i.test(message))
    return NYU_ONLY_MESSAGE;
  return message;
}
