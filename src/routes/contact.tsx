import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, GraduationCap, Mail, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { CONTACT_EMAIL, SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/contact")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Contact | LectureLoop" },
      { name: "description", content: "Send the LectureLoop team a question or request." },
      { property: "og:title", content: "Contact | LectureLoop" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ContactPage,
});

const TOPICS = [
  ["general", "General question"],
  ["account", "Account or sign-in"],
  ["bug", "Something isn't working"],
  ["feature", "Feature request"],
  ["privacy", "Privacy or data request"],
  ["other", "Other"],
] as const;

const MAX = 5000;

function ContactPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>("general");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: real people leave this empty
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Prefill from the signed-in account.
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!active || !user) return;
      setSignedIn(true);
      setUserId(user.id);
      setEmail((e) => e || user.email || "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (active && profile?.full_name) setName((n) => n || profile.full_name || "");
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (website) {
      setSent(true); // silently drop bots
      return;
    }
    if (message.trim().length < 10) {
      toast.error("Please write a little more (at least 10 characters).");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        name: name.trim().slice(0, 120),
        email: email.trim().slice(0, 320),
        topic,
        message: message.trim().slice(0, MAX),
        user_id: userId,
      });
      if (error) {
        throw new Error(
          /Too many|a lot of messages/.test(error.message)
            ? error.message
            : /email/.test(error.message)
              ? "Please enter a valid email address."
              : "Could not send your message. Please try again.",
        );
      }
      setSent(true);
      setMessage("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {signedIn ? (
        <AuthenticatedHeader />
      ) : (
        <header className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-6 sm:px-6 lg:px-10 xl:px-16">
          <Link to="/" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            <span className="font-display text-xl">LectureLoop</span>
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </header>
      )}

      <main className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 xl:px-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,40rem)] lg:gap-16">
          <div>
            <h1 className="text-3xl sm:text-4xl">Contact us</h1>
            <p className="mt-3 text-muted-foreground">
              Questions, problems or ideas? Send us a message and we'll get back to you by email,
              usually within a couple of days.
            </p>
            <ul className="mt-8 space-y-5 text-sm">
              <li className="flex gap-3">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="font-medium">Using LectureLoop?</span>{" "}
                  <span className="text-muted-foreground">
                    For quick product suggestions you can also use{" "}
                    <Link to="/feedback" className="text-primary hover:underline">
                      Feedback
                    </Link>
                    .
                  </span>
                </span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">Data requests.</span> Choose
                  "Privacy or data request" to ask for a copy or deletion of your data. See our{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    privacy policy
                  </Link>
                  .
                </span>
              </li>
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">Prefer email?</span>{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                    {CONTACT_EMAIL}
                  </a>
                </span>
              </li>
            </ul>
          </div>

          <div className="surface-paper rounded-2xl p-6 sm:p-8">
            {sent ? (
              <div className="flex flex-col items-center py-10 text-center" role="status">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <h2 className="mt-4 text-2xl">Message sent</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Thanks for reaching out. We'll reply to <strong>{email}</strong> as soon as we
                  can.
                </p>
                <Button variant="outline" className="mt-6" onClick={() => setSent(false)}>
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5" noValidate={false}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-name">Name</Label>
                    <Input
                      id="contact-name"
                      required
                      maxLength={120}
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-email">Email</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      required
                      maxLength={320}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-topic">Topic</Label>
                  <select
                    id="contact-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {TOPICS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-message">Message</Label>
                  <Textarea
                    id="contact-message"
                    required
                    minLength={10}
                    maxLength={MAX}
                    rows={7}
                    placeholder="How can we help?"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {message.length}/{MAX}
                  </p>
                </div>

                {/* Honeypot field, hidden from people and screen readers. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    We only use your details to reply to you.
                  </p>
                  <Button type="submit" disabled={sending}>
                    <Send className="mr-2 h-4 w-4" />
                    {sending ? "Sending…" : "Send message"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
